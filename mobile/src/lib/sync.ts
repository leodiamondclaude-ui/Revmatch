import { db, type LocalDrive } from "./db";
import { SITE_URL } from "./config";
import { supabase } from "./supabase";

type Row = { id: number; t: number; lat: number | null; lng: number | null; altitude: number | null; altitude_accuracy: number | null; accuracy: number | null; gps_speed: number | null; heading: number | null; rpm: number | null; coolant_c: number | null; throttle_pct: number | null; engine_load_pct: number | null; intake_temp_c: number | null; obd_speed_kph: number | null };

/** Same mapping as the website's recorder (src/lib/drive/recorder.ts toRow). */
function toRow(s: Row, driveId: string, ownerId: string) {
  return {
    drive_id: driveId, owner_id: ownerId, t: new Date(s.t).toISOString(), lat: s.lat, lng: s.lng, altitude: s.altitude, altitude_accuracy: s.altitude_accuracy, accuracy: s.accuracy,
    speed_mps: s.obd_speed_kph != null ? s.obd_speed_kph / 3.6 : s.gps_speed, speed_source: s.obd_speed_kph != null ? "obd" : s.gps_speed != null ? "gps_doppler" : null,
    heading: s.heading, rpm: s.rpm != null ? Math.round(s.rpm) : null, coolant_c: s.coolant_c, throttle_pct: s.throttle_pct, engine_load_pct: s.engine_load_pct,
    intake_temp_c: s.intake_temp_c, obd_speed_kph: s.obd_speed_kph, accel_g: null,
  };
}

export type SyncResult = { uploaded: number; failed: number; lastError?: string; lastDriveId?: string };

/**
 * Upload every stopped drive: create the drive, send samples in batches (resumable: each batch is
 * marked as sent), then ask the website to analyse it. Safe to call repeatedly; it picks up where it left off.
 */
export async function syncDrives(): Promise<SyncResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { uploaded: 0, failed: 0, lastError: "Sign in to upload drives." };
  const me = session.user.id;
  const drives = await db.getAllAsync<LocalDrive>("select * from drives where status = 'stopped' order by id");
  const res: SyncResult = { uploaded: 0, failed: 0 };
  for (const d of drives) {
    try {
      let remote = d.remote_id;
      if (!remote) {
        const { data: s } = await supabase.from("user_settings").select("default_drive_visibility, default_share_route").eq("user_id", me).maybeSingle();
        const { data, error } = await supabase.from("drives").insert({
          owner_id: me, vehicle_id: d.vehicle_id, started_at: new Date(d.started_at).toISOString(), status: "recording", start_mode: d.start_mode,
          source: d.has_obd ? "gps+obd" : "gps", visibility: s?.default_drive_visibility ?? "private", share_route: s?.default_share_route ?? false,
        }).select("id").single();
        if (error) throw error;
        remote = data.id as string;
        await db.runAsync("update drives set remote_id = ? where id = ?", remote, d.id);
      }
      for (;;) {
        const batch = await db.getAllAsync<Row>("select * from samples where drive = ? and uploaded = 0 order by t limit 500", d.id);
        if (!batch.length) break;
        const { error } = await supabase.from("drive_samples").insert(batch.map((s) => toRow(s, remote!, me)));
        if (error) throw error;
        await db.runAsync(`update samples set uploaded = 1 where id in (${batch.map((b) => b.id).join(",")})`);
      }
      const r = await fetch(`${SITE_URL}/api/drives/${remote}/finalize`, { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` } });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error ?? `Analysis failed (${r.status})`);
      await db.runAsync("update drives set status = ?, error = ? where id = ?", body.deleted ? "discarded" : "uploaded", body.deleted ? body.reason ?? "Too short to save." : null, d.id);
      await db.runAsync("delete from samples where drive = ?", d.id); // the server has them now
      res.uploaded++;
      if (!body.deleted) res.lastDriveId = remote;
    } catch (e) {
      res.failed++;
      res.lastError = (e as Error).message;
      await db.runAsync("update drives set error = ? where id = ?", res.lastError, d.id);
    }
  }
  return res;
}
