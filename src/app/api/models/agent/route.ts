import { after, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser, createServiceClient } from "@/lib/supabase/server";
import { createSketchfabClient } from "@/lib/agent/sketchfab";
import { runModelAgent, type AgentMod } from "@/lib/agent/modelAgent";
import { findReady, planFromLibrary, requestEntry } from "@/lib/agent/library";
import type { Vehicle } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 800; // the agent searches, inspects and downloads; runs take several minutes

/** Start the model agent for a vehicle. Returns at once; poll /api/models/status for progress. */
export async function POST(req: Request) {
  const { supabase, user } = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const missing = [!process.env.ANTHROPIC_API_KEY && "ANTHROPIC_API_KEY", !process.env.SKETCHFAB_API_TOKEN && "SKETCHFAB_API_TOKEN", !process.env.SUPABASE_SERVICE_ROLE_KEY && "SUPABASE_SERVICE_ROLE_KEY"].filter(Boolean);
  if (missing.length) return NextResponse.json({ error: `Model agent is not configured (${missing.join(", ")}).`, code: "not_configured" }, { status: 501 });
  const body = z.object({ vehicleId: z.string().uuid() }).safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { data: v } = await supabase.from("vehicles").select("*").eq("id", body.data.vehicleId).eq("owner_id", user.id).maybeSingle<Vehicle>();
  if (!v) return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
  if (v.model_status === "generating") return NextResponse.json({ error: "A model is already being built for this vehicle." }, { status: 409 });
  const [{ data: photos }, { data: mods }] = await Promise.all([
    supabase.from("vehicle_photos").select("url, angle").eq("vehicle_id", v.id).in("angle", ["front_3q", "side", "rear_3q", "front", "rear"]),
    supabase.from("modifications").select("id, category, name, brand, product, description").eq("vehicle_id", v.id),
  ]);

  const admin = createServiceClient()!;
  const paintHex = v.model_config?.paint ?? v.exterior_color_hex, finish = v.model_config?.finish ?? null;
  const car = { year: v.year, make: v.make, model: v.model };

  // A stock model on standby in the library: show it at once.
  const lib = await findReady(admin, car).catch(() => null);
  // Mods the agent can fit as real part models (the rest are recolours or invisible).
  const visualMods = (mods ?? []).filter((m) => ["spoiler", "wheels", "splitter", "diffuser", "body_kit", "exhaust"].includes(m.category));
  if (lib) {
    const plan = planFromLibrary(lib, paintHex, finish);
    await admin.from("vehicles").update({
      model_assembly: plan, model_url: plan.base.glbUrl, model_status: visualMods.length ? "generating" : "ready", model_source: "library", model_approved: false,
      model_attribution: plan.attribution.join(" · "), model_agent_log: [`Library model ready: ${lib.base!.name}`],
    }).eq("id", v.id);
    if (!visualMods.length) return NextResponse.json({ started: false, library: true });
  } else {
    // Not on standby yet: queue it so the library agent prepares it for the next owner too.
    await requestEntry(admin, car).catch(() => null);
  }

  const log: string[] = lib ? [`Library model ready: ${lib.base!.name}`, "Fitting your mods…"] : [];
  const pushLog = async (line: string) => {
    log.push(`${new Date().toISOString().slice(11, 19)} ${line}`);
    await admin.from("vehicles").update({ model_agent_log: log.slice(-40) }).eq("id", v.id);
  };
  if (!lib) await admin.from("vehicles").update({ model_status: "generating", model_source: "agent", model_agent_log: [] }).eq("id", v.id);

  after(async () => {
    try {
      const plan = await runModelAgent(
        { year: v.year, make: v.make, model: v.model, trim: v.trim, bodyStyle: v.body_style, paintHex, finish, generation: (v.ai_identification as { generation?: string } | null)?.generation ?? lib?.generation ?? null },
        (mods ?? []) as AgentMod[],
        (photos ?? []).map((p) => p.url),
        {
          sketchfab: createSketchfabClient(),
          presetBase: lib ? { base: lib.base!, structure: lib.structure ?? "" } : null,
          log: pushLog,
          store: async (bytes, name) => {
            const path = `${user.id}/${v.id}/agent/${name}`;
            const { error } = await admin.storage.from("vehicle-models").upload(path, bytes, { contentType: "model/gltf-binary", upsert: true });
            if (error) throw error;
            return admin.storage.from("vehicle-models").getPublicUrl(path).data.publicUrl;
          },
        },
      );
      await admin.from("vehicles").update({
        model_assembly: plan, model_url: plan.base.glbUrl, model_status: "ready", model_approved: false, model_source: lib ? "library" : "agent",
        model_attribution: plan.attribution.join(" · "),
      }).eq("id", v.id);
      await pushLog("Finished: model ready for your review.");
    } catch (e) {
      await pushLog(`Failed: ${(e as Error).message}`);
      // With a library base the stock model is still there; only the mod fitting failed.
      await admin.from("vehicles").update({ model_status: lib ? "ready" : "failed" }).eq("id", v.id);
    }
  });
  return NextResponse.json({ started: true, library: !!lib });
}
