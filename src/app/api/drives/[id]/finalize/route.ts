import { NextResponse } from "next/server";
import { createClient as createSupabase, type SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { analyzeDrive, type Sample } from "@/lib/drive/analysis";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Same mapping as the web recorder's fromRow (kept here so this route doesn't import browser code). */
function fromRow(r: Record<string, number | string | null>): Sample {
  const n = (k: string) => (r[k] == null ? null : Number(r[k]));
  return {
    t: new Date(r.t as string).getTime(), lat: n("lat"), lng: n("lng"), altitude: n("altitude"), altitudeAccuracy: n("altitude_accuracy"), accuracy: n("accuracy"),
    gpsSpeed: r.speed_source === "gps_doppler" ? n("speed_mps") : null, heading: n("heading"), rpm: n("rpm"), coolantC: n("coolant_c"), throttlePct: n("throttle_pct"),
    engineLoadPct: n("engine_load_pct"), intakeTempC: n("intake_temp_c"), obdSpeedKph: n("obd_speed_kph"), accelG: n("accel_g"),
  };
}

/** The phone app signs requests with its access token; the website uses its session cookie. Either way RLS applies. */
async function clientFor(req: Request): Promise<SupabaseClient> {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    return createSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false }, global: { headers: { Authorization: auth } },
    });
  }
  return createClient();
}

/**
 * Analyse a drive from its stored samples and mark it complete. Used by the phone app after uploading,
 * and safe to call again (recomputes with the owner's current privacy settings).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid drive id" }, { status: 400 });
  const supabase = await clientFor(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { data: drive } = await supabase.from("drives").select("id, owner_id").eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (!drive) return NextResponse.json({ error: "Drive not found" }, { status: 404 });
  const { data: settings } = await supabase.from("user_settings").select("max_accuracy_m, endpoint_privacy_m").eq("user_id", user.id).maybeSingle();

  const rows: Record<string, number | string | null>[] = [];
  for (let from = 0; from < 200_000; from += 1000) {
    const { data, error } = await supabase.from("drive_samples").select("*").eq("drive_id", id).order("t").range(from, from + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const samples = rows.map(fromRow);
  if (samples.filter((s) => s.lat != null).length < 5) {
    await supabase.from("drives").delete().eq("id", id);
    return NextResponse.json({ deleted: true, reason: "Not enough GPS fixes to save a drive (need at least 5)." });
  }
  const { full_route: _route, ...agg } = analyzeDrive(samples, { maxAccuracyM: Number(settings?.max_accuracy_m ?? 35), endpointPrivacyM: Number(settings?.endpoint_privacy_m ?? 400) });
  void _route;
  const { error } = await supabase.from("drives").update({ ...agg, status: "complete" }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: false, distance_m: agg.distance_m, duration_s: agg.duration_s });
}
