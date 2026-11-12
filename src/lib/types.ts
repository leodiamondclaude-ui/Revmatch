export type Visibility = "public" | "friends" | "private";

export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  location: string | null;
  is_private: boolean;
  accent_mode: "vehicle" | "custom";
  accent_color: string;
  primary_vehicle_id: string | null;
  created_at: string;
}

export interface UserSettings {
  user_id: string;
  units: "imperial" | "metric";
  auto_detect: boolean;
  auto_action: "prompt" | "auto";
  auto_min_speed_kph: number;
  auto_min_duration_s: number;
  auto_stop_idle_s: number;
  min_sample_distance_m: number;
  max_accuracy_m: number;
  default_drive_visibility: Visibility;
  default_share_route: boolean;
  endpoint_privacy_m: number;
}

export type BodyStyle = "coupe" | "sedan" | "hatch" | "wagon" | "suv" | "truck";

/** Parametric description of the procedural 3D car (and overlay hints for GLB models). */
export interface ModelConfig {
  /** "studio": realistic base model recoloured with this config. "parametric": generated to match body style. */
  representation?: "studio" | "parametric";
  paint?: string;
  finish?: "gloss" | "metallic" | "matte" | "satin";
  wheelColor?: string;
  wheelStyle?: "five_spoke" | "mesh" | "multi_spoke" | "dish" | "turbofan";
  wheelSize?: number; // inches, 15-22
  caliperColor?: string;
  rideHeight?: number; // -1 (slammed) .. 1 (lifted)
  spoiler?: "none" | "lip" | "ducktail" | "wing" | "gt_wing";
  splitter?: boolean;
  diffuser?: boolean;
  sideSkirts?: boolean;
  exhaust?: "single" | "dual" | "quad" | "center";
  exhaustFinish?: "chrome" | "black" | "titanium";
  tint?: number; // 0 (clear) .. 1 (limo)
  stripeColor?: string | null;
  stripe?: "none" | "racing" | "side";
  roofColor?: string | null;
}

export interface Vehicle {
  id: string;
  owner_id: string;
  slug: string;
  nickname: string | null;
  year: number | null;
  make: string;
  model: string;
  trim: string | null;
  engine: string | null;
  horsepower: number | null;
  torque: number | null;
  transmission: string | null;
  drivetrain: string | null;
  exterior_color: string | null;
  exterior_color_hex: string | null;
  interior_color: string | null;
  mileage: number | null;
  mileage_unit: "mi" | "km";
  description: string | null;
  visibility: Visibility;
  show_stats_public: boolean;
  cover_photo_url: string | null;
  body_style: BodyStyle;
  model_config: ModelConfig;
  model_url: string | null;
  model_source: "procedural" | "library" | "ai" | "agent";
  model_assembly: import("./agent/plan").AssemblyPlan | null;
  model_agent_log: string[] | null;
  model_status: "none" | "searching" | "generating" | "ready" | "failed";
  model_task_id: string | null;
  model_attribution: string | null;
  model_approved: boolean;
  ai_identification: Record<string, unknown> | null;
  created_at: string;
}

export const MOD_CATEGORIES = [
  { id: "wheels", label: "Wheels & Tires", visual: true },
  { id: "exhaust", label: "Exhaust", visual: true },
  { id: "intake", label: "Intake", visual: false },
  { id: "forced_induction", label: "Turbo / Supercharger", visual: false },
  { id: "engine", label: "Engine Internals", visual: false },
  { id: "tune", label: "ECU / Tune", visual: false },
  { id: "suspension", label: "Suspension", visual: true },
  { id: "brakes", label: "Brakes", visual: true },
  { id: "body_kit", label: "Body Kit / Skirts", visual: true },
  { id: "spoiler", label: "Spoiler / Wing", visual: true },
  { id: "splitter", label: "Front Splitter", visual: true },
  { id: "diffuser", label: "Rear Diffuser", visual: true },
  { id: "tint", label: "Window Tint", visual: true },
  { id: "wrap", label: "Paint / Wrap / Decals", visual: true },
  { id: "lighting", label: "Lighting", visual: false },
  { id: "interior", label: "Interior", visual: false },
  { id: "drivetrain", label: "Drivetrain", visual: false },
  { id: "other", label: "Other", visual: false },
] as const;
export type ModCategory = (typeof MOD_CATEGORIES)[number]["id"];

export interface Modification {
  id: string;
  vehicle_id: string;
  owner_id: string;
  category: ModCategory;
  name: string;
  brand: string | null;
  product: string | null;
  installed_on: string | null;
  cost: number | null;
  show_cost: boolean;
  description: string | null;
  hp_gain: number | null;
  torque_gain: number | null;
  performance_notes: string | null;
  visual: Partial<ModelConfig>;
  created_at: string;
}

export interface VehiclePhoto {
  id: string;
  vehicle_id: string;
  owner_id: string;
  modification_id: string | null;
  storage_path: string;
  url: string;
  angle: string;
  caption: string | null;
  created_at: string;
}

export interface BuildEvent {
  id: string;
  vehicle_id: string;
  event_date: string;
  kind: "purchase" | "service" | "milestone" | "track" | "show";
  title: string;
  description: string | null;
  mileage: number | null;
}

export interface AccelRun {
  from_kph: number;
  to_kph: number;
  seconds: number;
  source: "gps_doppler" | "obd";
  sample_hz: number;
  reliability: "estimate" | "good";
}

export interface DriveSegment {
  kind: "city" | "arterial" | "highway" | "stopped";
  basis: "inferred_from_speed";
  start_s: number;
  end_s: number;
  distance_m: number;
  avg_speed_mps: number;
  max_speed_mps: number;
}

export interface Drive {
  id: string;
  owner_id: string;
  vehicle_id: string | null;
  title: string | null;
  notes: string | null;
  started_at: string;
  ended_at: string | null;
  duration_s: number | null;
  moving_s: number | null;
  distance_m: number | null;
  avg_speed_mps: number | null;
  avg_moving_speed_mps: number | null;
  max_speed_mps: number | null;
  elevation_gain_m: number | null;
  elevation_loss_m: number | null;
  min_altitude_m: number | null;
  max_altitude_m: number | null;
  avg_accuracy_m: number | null;
  sample_count: number | null;
  sample_rate_hz: number | null;
  source: "gps" | "gps+obd";
  start_mode: "manual" | "auto";
  confidence: "low" | "medium" | "high";
  acceleration: {
    runs?: AccelRun[];
    peak_long_g?: { value: number; source: "gps_doppler" | "obd" | "device_motion"; note: string } | null;
  };
  obd_summary: Record<string, { min: number; max: number; avg: number; unit: string }> | null;
  segments: DriveSegment[];
  speed_series: [number, number, string][];
  route_preview: [number, number][] | null;
  visibility: Visibility;
  share_route: boolean;
  status: "recording" | "complete";
}

export interface Post {
  id: string;
  author_id: string;
  vehicle_id: string | null;
  kind: "update" | "new_vehicle" | "new_mod" | "drive" | "photo";
  body: string | null;
  ref_id: string | null;
  image_url: string | null;
  meta: Record<string, unknown>;
  visibility: "public" | "followers" | "friends" | "private";
  created_at: string;
}
