import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSketchfabClient } from "./sketchfab";
import { createMeshyTextClient } from "./meshyText";
import { runLibraryAgent } from "./libraryAgent";
import { bestMatch, CATALOG, entryKey, normMake, type Body } from "./catalog";
import type { Base } from "./baseTools";
import type { LibraryLook } from "./libraryAgent";
export { planFromLibrary } from "./libraryPlan";

/** Shared library of stock models: lookup, queueing, and the build step the scheduled job runs. */

export interface LibraryRow {
  id: string; key: string; make: string; model: string; generation: string | null; year_from: number; year_to: number; body: Body;
  status: "queued" | "building" | "ready" | "none_found" | "failed"; source: "sketchfab" | "generated" | null;
  base: Base | null; structure: string | null; look: LibraryLook | null;
  summary: string | null; warnings: string[]; thumbnail_url: string | null; demand: number; attempts: number;
}
const asMatchable = (r: LibraryRow) => ({ ...r, from: r.year_from, to: r.year_to });

export const libraryConfigured = () => !!(process.env.ANTHROPIC_API_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY && (process.env.SKETCHFAB_API_TOKEN || process.env.MESHY_API_KEY));

/** Put every catalogue generation in the queue (rows that already exist are left alone). */
export async function seedCatalog(admin: SupabaseClient) {
  const rows = CATALOG.map((e) => ({ key: entryKey(e), make: e.make, model: e.model, generation: e.generation, year_from: e.from, year_to: e.to, body: e.body }));
  const { error } = await admin.from("model_library").upsert(rows, { onConflict: "key", ignoreDuplicates: true });
  if (error) throw error;
  return rows.length;
}

async function rowsForMake(db: SupabaseClient, make: string) {
  const { data, error } = await db.from("model_library").select("*").ilike("make", normMake(make));
  if (error) throw error;
  return (data ?? []) as LibraryRow[];
}

/** The ready library model for a car, if there is one. */
export async function findReady(db: SupabaseClient, car: { year: number | null; make: string; model: string }) {
  const rows = (await rowsForMake(db, car.make)).filter((r) => r.status === "ready" && r.base);
  return bestMatch(rows.map(asMatchable), car);
}

/**
 * Note that an owner wants this car. Bumps demand on the matching entry, or queues a new one
 * (covering just that year until the agent works out the generation's real range).
 */
export async function requestEntry(admin: SupabaseClient, car: { year: number | null; make: string; model: string; body?: Body }) {
  const match = bestMatch((await rowsForMake(admin, car.make)).map(asMatchable), car);
  if (match) {
    const retry = match.status === "failed" || (match.status === "none_found" && match.attempts < 2);
    await admin.from("model_library").update({ demand: match.demand + 1, ...(retry ? { status: "queued" } : {}), updated_at: new Date().toISOString() }).eq("id", match.id);
    return match.id;
  }
  const year = car.year ?? new Date().getFullYear();
  const generation = `y${year}`;
  const { data, error } = await admin.from("model_library").upsert(
    { key: entryKey({ make: car.make, model: car.model, generation }), make: car.make.trim(), model: car.model.trim(), generation: null, year_from: year, year_to: year, body: car.body ?? "sedan", demand: 1 },
    { onConflict: "key", ignoreDuplicates: true },
  ).select("id").maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

/** Claim up to n queued entries, most-requested first. Entries stuck "building" for over an hour are retried. */
export async function claimNext(admin: SupabaseClient, n: number) {
  const stale = new Date(Date.now() - 60 * 60_000).toISOString();
  await admin.from("model_library").update({ status: "queued" }).eq("status", "building").lt("claimed_at", stale);
  const { data } = await admin.from("model_library").select("*").eq("status", "queued").lt("attempts", 3)
    .order("demand", { ascending: false }).order("created_at", { ascending: true }).limit(n);
  const claimed: LibraryRow[] = [];
  for (const r of (data ?? []) as LibraryRow[]) {
    // Conditional update so two runs never build the same entry.
    const { data: ok } = await admin.from("model_library").update({ status: "building", attempts: r.attempts + 1, claimed_at: new Date().toISOString(), log: [] })
      .eq("id", r.id).eq("status", "queued").select("id").maybeSingle();
    if (ok) claimed.push(r);
  }
  return claimed;
}

/** Run the library agent for one entry and save the result. */
export async function buildEntry(admin: SupabaseClient, row: LibraryRow) {
  const log: string[] = [];
  const pushLog = async (line: string) => {
    log.push(`${new Date().toISOString().slice(11, 19)} ${line}`);
    await admin.from("model_library").update({ log: log.slice(-60), updated_at: new Date().toISOString() }).eq("id", row.id);
  };
  const store = async (bytes: Uint8Array, name: string) => {
    const path = `library/${row.key.replace(/[^a-z0-9|-]/g, "").replace(/\|/g, "/")}/${Date.now()}-${name}`;
    const { error } = await admin.storage.from("vehicle-models").upload(path, bytes, { contentType: "model/gltf-binary", upsert: true });
    if (error) throw error;
    return admin.storage.from("vehicle-models").getPublicUrl(path).data.publicUrl;
  };
  try {
    const r = await runLibraryAgent(
      { make: row.make, model: row.model, generation: row.generation, from: row.year_from, to: row.year_to, body: row.body },
      { sketchfab: createSketchfabClient(), meshy: process.env.MESHY_API_KEY ? createMeshyTextClient() : null, store, log: pushLog },
    );
    if ("found" in r) {
      await admin.from("model_library").update({ status: "none_found", last_error: r.reason, updated_at: new Date().toISOString() }).eq("id", row.id);
      await pushLog(`Nothing suitable: ${r.reason}`);
      return "none_found" as const;
    }
    await admin.from("model_library").update({
      status: "ready", source: r.source, base: r.base, structure: r.structure, look: r.look, summary: r.summary, warnings: r.warnings,
      thumbnail_url: r.thumbnail, generation: r.generation ?? row.generation,
      // Widen the entry to the generation's real year range (never narrower than what was asked for).
      year_from: Math.min(r.from, row.year_from), year_to: Math.max(r.to, row.year_to),
      last_error: null, built_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", row.id);
    await pushLog(`Ready: ${r.base.name} (${r.source}).`);
    return "ready" as const;
  } catch (e) {
    await admin.from("model_library").update({ status: "failed", last_error: (e as Error).message, updated_at: new Date().toISOString() }).eq("id", row.id);
    await pushLog(`Failed: ${(e as Error).message}`);
    return "failed" as const;
  }
}

