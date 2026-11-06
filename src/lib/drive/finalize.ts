"use client";
import { createClient } from "@/lib/supabase/client";
import { analyzeDrive } from "./analysis";
import { fromRow } from "./recorder";

/** Re-run analysis from stored samples (recovers drives interrupted by a closed tab, or applies new settings). */
export async function finalizeDrive(driveId: string, opts: { maxAccuracyM: number; endpointPrivacyM: number }) {
  const supabase = createClient();
  const rows: Record<string, number | string | null>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("drive_samples").select("*").eq("drive_id", driveId).order("t").range(from, from + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const samples = rows.map(fromRow);
  if (samples.filter((s) => s.lat != null).length < 5) {
    await supabase.from("drives").delete().eq("id", driveId);
    return { deleted: true as const };
  }
  const { full_route: _r, ...agg } = analyzeDrive(samples, opts);
  void _r;
  const { error } = await supabase.from("drives").update({ ...agg, status: "complete" }).eq("id", driveId);
  if (error) throw error;
  return { deleted: false as const };
}
