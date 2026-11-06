import { requireViewer } from "@/lib/viewer";
import type { Drive, Vehicle } from "@/lib/types";
import { DriveList } from "./DriveList";

export const metadata = { title: "Drives" };

export default async function Drives() {
  const { supabase, user, settings } = await requireViewer();
  const [{ data: drives }, { data: vehicles }] = await Promise.all([
    supabase.from("drives").select("id, owner_id, vehicle_id, title, started_at, ended_at, duration_s, moving_s, distance_m, avg_speed_mps, avg_moving_speed_mps, max_speed_mps, elevation_gain_m, source, start_mode, confidence, visibility, status, acceleration").eq("owner_id", user.id).order("started_at", { ascending: false }).limit(500),
    supabase.from("vehicles").select("id, year, make, model, nickname, exterior_color_hex").eq("owner_id", user.id),
  ]);
  return <DriveList drives={(drives ?? []) as Drive[]} vehicles={(vehicles ?? []) as Vehicle[]} units={settings?.units ?? "imperial"}
    opts={{ maxAccuracyM: settings?.max_accuracy_m ?? 35, endpointPrivacyM: settings?.endpoint_privacy_m ?? 400 }} />;
}
