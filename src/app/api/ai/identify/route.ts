import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase/server";
import { MOD_CATEGORIES } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const MEDIA = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
const Body = z.object({
  images: z.array(z.object({
    angle: z.string().max(20),
    media_type: z.enum(MEDIA),
    data: z.string().max(7_000_000), // base64
  })).min(1).max(8),
});

const cats = MOD_CATEGORIES.map((c) => c.id) as [string, ...string[]];

const Identification = z.object({
  is_vehicle: z.boolean().describe("False if the photos don't show a road vehicle"),
  year_min: z.number().int().nullable(),
  year_max: z.number().int().nullable(),
  make: z.string().nullable(),
  model: z.string().nullable(),
  trim: z.string().nullable(),
  generation: z.string().nullable().describe("Chassis code / generation if recognisable, e.g. 'E46', '992'"),
  body_style: z.enum(["coupe", "sedan", "hatch", "wagon", "suv", "truck"]),
  exterior_color_name: z.string().nullable(),
  exterior_color_hex: z.string().describe("Best estimate of the dominant paint colour as #rrggbb"),
  paint_finish: z.enum(["gloss", "metallic", "matte", "satin"]),
  confidence: z.enum(["low", "medium", "high"]),
  reasoning: z.string().describe("One or two sentences on the visual cues used"),
  visual: z.object({
    wheel_color_hex: z.string(),
    wheel_style: z.enum(["five_spoke", "mesh", "multi_spoke", "dish", "turbofan"]),
    wheel_size_in_estimate: z.number().int().nullable(),
    caliper_color_hex: z.string().nullable(),
    ride_height: z.enum(["slammed", "lowered", "stock", "lifted"]),
    spoiler: z.enum(["none", "lip", "ducktail", "wing", "gt_wing"]),
    front_splitter: z.boolean(),
    rear_diffuser: z.boolean(),
    side_skirts: z.boolean(),
    exhaust: z.enum(["single", "dual", "quad", "center", "not_visible"]),
    exhaust_finish: z.enum(["chrome", "black", "titanium", "not_visible"]),
    window_tint: z.enum(["none", "light", "medium", "dark", "limo"]),
    stripe: z.enum(["none", "racing", "side"]),
    stripe_color_hex: z.string().nullable(),
  }),
  likely_modifications: z.array(z.object({
    category: z.enum(cats),
    name: z.string(),
    brand_guess: z.string().nullable(),
    evidence: z.string(),
    confidence: z.enum(["low", "medium", "high"]),
  })).describe("Only aftermarket changes visibly different from factory spec"),
});

export type IdentifyResult = z.infer<typeof Identification>;

const SYSTEM = `You are an automotive identification specialist. You will be shown photographs of a single vehicle from several angles.
Identify the vehicle as precisely as the evidence allows, and list visible aftermarket modifications.
Rules:
- Use a year range when the generation spans multiple model years; never invent precision you don't have.
- Leave a field null rather than guessing when it can't be determined from the photos.
- Only list a modification when it visibly differs from how that model left the factory. Factory options (e.g. an OEM performance package) are not modifications.
- Colours: give the dominant body colour as a hex value as it appears under neutral light.
- The owner will review and correct everything you return, so be candid about uncertainty.`;

export async function POST(req: Request) {
  const { user } = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AI identification is not configured (ANTHROPIC_API_KEY).", code: "not_configured" }, { status: 501 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid images payload" }, { status: 400 });

  const client = new Anthropic();
  const content: Anthropic.ContentBlockParam[] = [];
  for (const img of parsed.data.images) {
    content.push({ type: "text", text: `Photo — ${img.angle.replace("_", " ")} view:` });
    content.push({ type: "image", source: { type: "base64", media_type: img.media_type, data: img.data } });
  }
  content.push({ type: "text", text: "Identify this vehicle and its visible modifications." });

  try {
    const response = await client.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: zodOutputFormat(Identification) },
      system: SYSTEM,
      messages: [{ role: "user", content }],
    });
    if (response.stop_reason === "refusal") {
      return NextResponse.json({ error: "The model declined to analyse these images." }, { status: 422 });
    }
    if (!response.parsed_output) return NextResponse.json({ error: "Could not parse identification." }, { status: 502 });
    return NextResponse.json({ result: response.parsed_output, model: response.model });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "AI service is busy. Try again shortly." }, { status: 429 });
    if (err instanceof Anthropic.BadRequestError) return NextResponse.json({ error: "AI request rejected: " + err.message }, { status: 400 });
    if (err instanceof Anthropic.APIError) return NextResponse.json({ error: "AI service error." }, { status: 502 });
    throw err;
  }
}
