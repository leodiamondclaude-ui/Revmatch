import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSketchfabClient } from "@/lib/agent/sketchfab";
import { runModelAgent, type AgentMod } from "@/lib/agent/modelAgent";
import { findReady } from "@/lib/agent/library";
import type { Vehicle } from "@/lib/types";

export type ModelAgentPayload = { useLibrary: boolean };

/** The long part of "Find my car": search, inspect, download and fit parts. Runs in the job worker. */
export async function runModelAgentJob(admin: SupabaseClient, vehicleId: string, payload: ModelAgentPayload) {
  const { data: v } = await admin.from("vehicles").select("*").eq("id", vehicleId).maybeSingle<Vehicle>();
  if (!v) return; // car deleted while queued
  const [{ data: photos }, { data: mods }] = await Promise.all([
    admin.from("vehicle_photos").select("url, angle").eq("vehicle_id", v.id).in("angle", ["front_3q", "side", "rear_3q", "front", "rear"]),
    admin.from("modifications").select("id, category, name, brand, product, description").eq("vehicle_id", v.id),
  ]);
  const lib = payload.useLibrary ? await findReady(admin, { year: v.year, make: v.make, model: v.model }).catch(() => null) : null;
  const paintHex = v.model_config?.paint ?? v.exterior_color_hex, finish = v.model_config?.finish ?? null;
  const log: string[] = [...(v.model_agent_log ?? [])].slice(-30);
  const pushLog = async (line: string) => {
    log.push(`${new Date().toISOString().slice(11, 19)} ${line}`);
    await admin.from("vehicles").update({ model_agent_log: log.slice(-40) }).eq("id", v.id);
  };
  const plan = await runModelAgent(
    { year: v.year, make: v.make, model: v.model, trim: v.trim, bodyStyle: v.body_style, paintHex, finish, generation: (v.ai_identification as { generation?: string } | null)?.generation ?? lib?.generation ?? null },
    (mods ?? []) as AgentMod[],
    (photos ?? []).map((p) => p.url),
    {
      sketchfab: createSketchfabClient(),
      presetBase: lib ? { base: lib.base!, structure: lib.structure ?? "" } : null,
      log: pushLog,
      store: async (bytes, name) => {
        const path = `${v.owner_id}/${v.id}/agent/${name}`;
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
}

/** Called once a job has used up its retries. A library base stays usable; only the mod fitting failed. */
export async function failModelAgentJob(admin: SupabaseClient, vehicleId: string, payload: ModelAgentPayload, message: string) {
  const { data: v } = await admin.from("vehicles").select("model_agent_log").eq("id", vehicleId).maybeSingle<{ model_agent_log: string[] | null }>();
  if (!v) return;
  const log = [...(v.model_agent_log ?? []), `${new Date().toISOString().slice(11, 19)} Failed: ${message}`].slice(-40);
  await admin.from("vehicles").update({ model_status: payload.useLibrary ? "ready" : "failed", model_agent_log: log }).eq("id", vehicleId);
}
