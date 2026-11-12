import { after, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser, createServiceClient } from "@/lib/supabase/server";
import { createSketchfabClient } from "@/lib/agent/sketchfab";
import { runModelAgent, type AgentMod } from "@/lib/agent/modelAgent";
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
  const log: string[] = [];
  const pushLog = async (line: string) => {
    log.push(`${new Date().toISOString().slice(11, 19)} ${line}`);
    await admin.from("vehicles").update({ model_agent_log: log.slice(-40) }).eq("id", v.id);
  };
  await admin.from("vehicles").update({ model_status: "generating", model_source: "agent", model_agent_log: [] }).eq("id", v.id);

  after(async () => {
    try {
      const plan = await runModelAgent(
        { year: v.year, make: v.make, model: v.model, trim: v.trim, bodyStyle: v.body_style, paintHex: v.model_config?.paint ?? v.exterior_color_hex, finish: v.model_config?.finish ?? null, generation: (v.ai_identification as { generation?: string } | null)?.generation ?? null },
        (mods ?? []) as AgentMod[],
        (photos ?? []).map((p) => p.url),
        {
          sketchfab: createSketchfabClient(),
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
        model_assembly: plan, model_url: plan.base.glbUrl, model_status: "ready", model_approved: false,
        model_attribution: plan.attribution.join(" · "),
      }).eq("id", v.id);
      await pushLog("Finished: model ready for your review.");
    } catch (e) {
      await pushLog(`Failed: ${(e as Error).message}`);
      await admin.from("vehicles").update({ model_status: "failed" }).eq("id", v.id);
    }
  });
  return NextResponse.json({ started: true });
}
