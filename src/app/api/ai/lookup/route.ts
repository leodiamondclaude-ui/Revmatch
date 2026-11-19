import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase/server";
import { aiQuota } from "@/lib/quota";

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({ year: z.number().int().min(1900).max(2100).nullable(), make: z.string().min(1).max(40), model: z.string().min(1).max(60), trim: z.string().max(40).nullable().optional() });

const hex = z.string().describe("#rrggbb");
const Lookup = z.object({
  known: z.boolean().describe("False if this car didn't exist or you aren't sure what it is"),
  trims: z.array(z.object({
    name: z.string(),
    engine: z.string().nullable(),
    horsepower: z.number().int().nullable(),
    transmission: z.string().nullable(),
    drivetrain: z.enum(["RWD", "FWD", "AWD", "4WD"]).nullable(),
    curb_weight_lb: z.number().int().nullable(),
    zero_to_sixty_s: z.number().nullable(),
    top_speed_mph: z.number().int().nullable(),
  })).max(6).describe("Versions sold that model year, most common first, with factory figures; null when unsure"),
  colors: z.array(z.object({ name: z.string(), hex })).max(8).describe("Factory paint colours offered that year, the brand's signature colour first"),
  interiors: z.array(z.object({ name: z.string(), hex })).max(6),
});
export type LookupResult = z.infer<typeof Lookup>;

const SYSTEM = `You are an automotive reference. Given a year, make and model, list the factory versions (trims) with their factory specifications, and the factory paint and interior colours. Use the US market where the car was sold there. Use null for any figure you are not confident about, and never invent trims or colours. The owner reviews everything and only keeps what they confirm.`;

/** Factory trims, specs and colours for a car, as suggestions the owner confirms. */
export async function POST(req: Request) {
  const { user } = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "AI lookup is not configured (ANTHROPIC_API_KEY).", code: "not_configured" }, { status: 501 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const quota = await aiQuota(user.id, "lookup");
  if (!quota.ok) return NextResponse.json({ error: quota.message }, { status: 429 });
  const { year, make, model, trim } = parsed.data;
  const client = new Anthropic();
  try {
    const response = await client.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      output_config: { effort: "low", format: zodOutputFormat(Lookup) },
      system: SYSTEM,
      messages: [{ role: "user", content: `${year ?? "Unknown year"} ${make} ${model}${trim ? ` (owner says trim: ${trim})` : ""}` }],
    });
    if (response.stop_reason === "refusal" || !response.parsed_output) return NextResponse.json({ error: "Couldn't look this car up." }, { status: 422 });
    await quota.record();
    const r = response.parsed_output;
    const okHex = (h: string) => /^#[0-9a-f]{6}$/i.test(h);
    return NextResponse.json({ result: { ...r, colors: r.colors.filter((c) => okHex(c.hex)), interiors: r.interiors.filter((c) => okHex(c.hex)) } });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "AI service is busy. Try again shortly." }, { status: 429 });
    if (err instanceof Anthropic.APIError) return NextResponse.json({ error: "AI service error." }, { status: 502 });
    throw err;
  }
}
