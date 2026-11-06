import { notFound } from "next/navigation";
import { requireViewer } from "@/lib/viewer";
import type { Drive, Vehicle } from "@/lib/types";
import { DriveReport } from "./DriveReport";

export const metadata = { title: "Drive report" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, settings } = await requireViewer();
  const { data: d } = await supabase.from("drives").select("*").eq("id", id).maybeSingle<Drive>();
  if (!d) notFound();
  const isOwner = d.owner_id === user.id;
  const [vehicleRes, samplesRes, avgRes] = await Promise.all([
    d.vehicle_id ? supabase.from("vehicles").select("id, slug, year, make, model, nickname, exterior_color_hex").eq("id", d.vehicle_id).maybeSingle<Vehicle>() : Promise.resolve({ data: null }),
    // Raw samples are owner-only by RLS; non-owners get nothing here.
    isOwner ? supabase.from("drive_samples").select("t, lat, lng, altitude, accuracy, speed_mps, rpm, coolant_c, throttle_pct, engine_load_pct, accel_g").eq("drive_id", id).order("t").limit(20000) : Promise.resolve({ data: null }),
    isOwner ? supabase.from("drives").select("distance_m, duration_s, max_speed_mps").eq("owner_id", user.id).eq("status", "complete") : Promise.resolve({ data: null }),
  ]);
  const all = (avgRes.data ?? []) as Pick<Drive, "distance_m" | "duration_s" | "max_speed_mps">[];
  const totD = all.reduce((s, x) => s + Number(x.distance_m ?? 0), 0), totT = all.reduce((s, x) => s + (x.duration_s ?? 0), 0);
  return (
    <DriveReport drive={d} vehicle={vehicleRes.data} samples={samplesRes.data as never} isOwner={isOwner}
      units={settings?.units ?? "imperial"} opts={{ maxAccuracyM: settings?.max_accuracy_m ?? 35, endpointPrivacyM: settings?.endpoint_privacy_m ?? 400 }}
      lifetimeAvg={isOwner && all.length ? { distance_m: totD / all.length, speed_mps: totT ? totD / totT : 0, n: all.length } : null} />
  );
}
