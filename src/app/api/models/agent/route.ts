import { after, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser, createServiceClient } from "@/lib/supabase/server";
import { enqueue, runJobs } from "@/lib/jobs";
import { addWaiting, findReady, planFromLibrary, requestEntry } from "@/lib/agent/library";
import { aiQuota } from "@/lib/quota";
import type { Vehicle } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 800; // the agent searches, inspects and downloads; runs take several minutes

/** Start the model agent for a vehicle. Returns at once; poll /api/models/status for progress. */
export async function POST(req: Request) {
  const { supabase, user } = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const missing = [!process.env.ANTHROPIC_API_KEY && "ANTHROPIC_API_KEY", !process.env.SUPABASE_SERVICE_ROLE_KEY && "SUPABASE_SERVICE_ROLE_KEY", !process.env.SKETCHFAB_API_TOKEN && !process.env.MESHY_API_KEY && "SKETCHFAB_API_TOKEN or MESHY_API_KEY"].filter(Boolean);
  if (missing.length) return NextResponse.json({ error: `Model agent is not configured (${missing.join(", ")}).`, code: "not_configured" }, { status: 501 });
  const body = z.object({ vehicleId: z.string().uuid() }).safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { data: v } = await supabase.from("vehicles").select("*").eq("id", body.data.vehicleId).eq("owner_id", user.id).maybeSingle<Vehicle>();
  if (!v) return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
  if (v.model_status === "generating") return NextResponse.json({ error: "A model is already being built for this vehicle." }, { status: 409 });
  const quota = await aiQuota(user.id, "agent");
  if (!quota.ok) return NextResponse.json({ error: quota.message }, { status: 429 });
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
    const entryId = await requestEntry(admin, car).catch(() => null);
    // Without Sketchfab the per-car agent can't search, so this car waits for the library agent (which can use Meshy).
    if (!process.env.SKETCHFAB_API_TOKEN) {
      if (entryId) await addWaiting(admin, entryId, v.id);
      await admin.from("vehicles").update({ model_status: "generating", model_source: "library", model_agent_log: ["Queued: our library agent is preparing a model of this car. This can take a while."] }).eq("id", v.id);
      return NextResponse.json({ started: true, queued: true });
    }
  }

  await admin.from("vehicles").update(lib
    ? { model_agent_log: [`Library model ready: ${lib.base!.name}`, "Fitting your mods…"] }
    : { model_status: "generating", model_source: "agent", model_agent_log: ["Queued: looking for a real model of your car…"] }).eq("id", v.id);
  // The run takes minutes, so it goes on the job queue (survives a timed-out request; the cron retries).
  const queued = await enqueue(admin, { kind: "model_agent", ownerId: user.id, vehicleId: v.id, payload: { useLibrary: !!lib } });
  if (!queued) return NextResponse.json({ error: "A model is already being built for this vehicle." }, { status: 409 });
  await quota.record();
  after(() => runJobs(admin, 1)); // start now rather than waiting for the next cron tick
  return NextResponse.json({ started: true, library: !!lib });
}
