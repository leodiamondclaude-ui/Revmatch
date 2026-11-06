import { requireViewer } from "@/lib/viewer";
import type { UserSettings, Vehicle } from "@/lib/types";
import { DriveConsole } from "./DriveConsole";

export const metadata = { title: "Drive" };

const DEFAULTS: Omit<UserSettings, "user_id"> = {
  units: "imperial", auto_detect: false, auto_action: "prompt", auto_min_speed_kph: 20, auto_min_duration_s: 20, auto_stop_idle_s: 180,
  min_sample_distance_m: 3, max_accuracy_m: 35, default_drive_visibility: "private", default_share_route: false, endpoint_privacy_m: 400,
};

export default async function DrivePage() {
  const { supabase, user, profile, settings } = await requireViewer();
  const { data } = await supabase.from("vehicles").select("id, year, make, model, nickname, exterior_color_hex").eq("owner_id", user.id).order("created_at");
  return <DriveConsole userId={user.id} vehicles={(data ?? []) as Vehicle[]} primaryId={profile.primary_vehicle_id} settings={{ ...DEFAULTS, ...(settings ?? {}), user_id: user.id }} />;
}
