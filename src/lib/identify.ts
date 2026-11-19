import type { BodyStyle, ModCategory, ModelConfig } from "./types";
import type { VehicleDraft } from "@/components/garage/VehicleFields";

// Mirrors the server-side zod schema in app/api/ai/identify/route.ts
export interface IdentifyResult {
  is_vehicle: boolean;
  year_min: number | null; year_max: number | null;
  make: string | null; model: string | null; trim: string | null; generation: string | null;
  body_style: BodyStyle;
  exterior_color_name: string | null; exterior_color_hex: string;
  paint_finish: "gloss" | "metallic" | "matte" | "satin";
  confidence: "low" | "medium" | "high";
  reasoning: string;
  visual: {
    wheel_color_hex: string; wheel_style: NonNullable<ModelConfig["wheelStyle"]>; wheel_size_in_estimate: number | null;
    caliper_color_hex: string | null; ride_height: "slammed" | "lowered" | "stock" | "lifted";
    spoiler: NonNullable<ModelConfig["spoiler"]>; front_splitter: boolean; rear_diffuser: boolean; side_skirts: boolean;
    exhaust: "single" | "dual" | "quad" | "center" | "not_visible"; exhaust_finish: "chrome" | "black" | "titanium" | "not_visible";
    window_tint: "none" | "light" | "medium" | "dark" | "limo"; stripe: "none" | "racing" | "side"; stripe_color_hex: string | null;
    headlights: "white" | "warm" | "yellow" | "blue" | "smoked" | "not_visible"; taillights: string | null; badges: string | null;
  };
  interior: { seat_color_name: string | null; seat_color_hex: string | null; seat_material: "leather" | "alcantara" | "cloth" | "carbon_buckets" | "vinyl" | "not_visible"; steering_wheel: string | null; gauges: string | null; lighting: string | null; console: string | null } | null;
  engine_bay: { engine: string | null } | null;
  likely_modifications: { category: ModCategory; name: string; brand_guess: string | null; evidence: string; confidence: "low" | "medium" | "high" }[];
}

const hex = (h: string | null | undefined, fallback: string) => (h && /^#[0-9a-f]{6}$/i.test(h) ? h : fallback);

export function applyIdentification(r: IdentifyResult, draft: VehicleDraft) {
  const flags = new Set<string>();
  const d = { ...draft };
  const put = <K extends keyof VehicleDraft>(k: K, v: VehicleDraft[K] | null | undefined) => {
    if (v != null && v !== "") { d[k] = v as VehicleDraft[K]; flags.add(k); }
  };
  put("year", r.year_max ?? r.year_min);
  put("make", r.make);
  put("model", r.model);
  put("trim", r.trim);
  put("exterior_color", r.exterior_color_name);
  put("exterior_color_hex", hex(r.exterior_color_hex, d.exterior_color_hex ?? "#9aa0a6"));
  const v = r.visual;
  const config: ModelConfig = {
    paint: hex(r.exterior_color_hex, "#9aa0a6"),
    finish: r.paint_finish,
    wheelColor: hex(v.wheel_color_hex, "#2a2c30"),
    wheelStyle: v.wheel_style,
    wheelSize: v.wheel_size_in_estimate ? Math.max(15, Math.min(22, v.wheel_size_in_estimate)) : 18,
    caliperColor: hex(v.caliper_color_hex, "#5b5e63"),
    rideHeight: { slammed: -0.9, lowered: -0.45, stock: 0, lifted: 0.6 }[v.ride_height],
    spoiler: v.spoiler,
    splitter: v.front_splitter,
    diffuser: v.rear_diffuser,
    sideSkirts: v.side_skirts,
    exhaust: v.exhaust === "not_visible" ? "dual" : v.exhaust,
    exhaustFinish: v.exhaust_finish === "not_visible" ? "chrome" : v.exhaust_finish,
    tint: { none: 0, light: 0.25, medium: 0.5, dark: 0.75, limo: 0.95 }[v.window_tint],
    stripe: v.stripe,
    stripeColor: v.stripe_color_hex,
  };
  return { draft: d, flags, config, bodyStyle: r.body_style };
}

// ---------------------------------------------------------------------------
// Four-photo setup: turn an identification into rows the owner ticks off,
// then apply only the ticked rows. Nothing AI-detected is saved unticked.
// ---------------------------------------------------------------------------
export interface SpotRow { id: string; group: "Outside" | "Inside" | "Engine bay" | "Mods"; label: string; value: string; hex?: string | null; ok: boolean }

const HEADLIGHT_HEX: Record<string, { name: string; hex: string }> = { white: { name: "Crisp white", hex: "#f4f8ff" }, warm: { name: "Warm halogen", hex: "#ffe2a8" }, yellow: { name: "Selective yellow", hex: "#ffd23a" }, blue: { name: "Ice blue", hex: "#cfe0ff" }, smoked: { name: "Smoked", hex: "#8d96a0" } };
const MATERIAL: Record<string, string> = { leather: "Leather", alcantara: "Alcantara / suede", cloth: "Cloth", carbon_buckets: "Carbon buckets", vinyl: "Vinyl" };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");

export function spottedRows(r: IdentifyResult): SpotRow[] {
  const rows: SpotRow[] = [], v = r.visual;
  const add = (id: string, group: SpotRow["group"], label: string, value: string | null | undefined, extra: Partial<SpotRow> = {}) => {
    if (value != null && value !== "") rows.push({ id, group, label, value, ok: true, ...extra });
  };
  add("paint", "Outside", "Paint", r.exterior_color_name ?? "Body colour", { hex: hex(r.exterior_color_hex, "#9aa0a6") });
  add("finish", "Outside", "Paint finish", cap(r.paint_finish));
  add("wheels", "Outside", "Wheels", `${cap(v.wheel_style)}${v.wheel_size_in_estimate ? `, about ${v.wheel_size_in_estimate} in` : ""}`, { hex: hex(v.wheel_color_hex, "#2a2c30") });
  if (v.caliper_color_hex) add("calipers", "Outside", "Brake calipers", "Visible", { hex: hex(v.caliper_color_hex, "#5b5e63") });
  if (v.headlights && v.headlights !== "not_visible") add("headlights", "Outside", "Headlights", HEADLIGHT_HEX[v.headlights].name, { hex: HEADLIGHT_HEX[v.headlights].hex });
  add("stance", "Outside", "Stance", cap(v.ride_height));
  if (v.spoiler !== "none") add("spoiler", "Outside", "Rear spoiler", { lip: "Lip spoiler", ducktail: "Ducktail", wing: "Wing", gt_wing: "Big wing" }[v.spoiler] ?? cap(v.spoiler));
  if (v.front_splitter) add("splitter", "Outside", "Front splitter", "Yes");
  if (v.rear_diffuser) add("diffuser", "Outside", "Rear diffuser", "Yes");
  if (v.side_skirts) add("skirts", "Outside", "Side skirts", "Yes");
  if (v.exhaust !== "not_visible") add("exhaust", "Outside", "Exhaust", `${cap(v.exhaust)}${v.exhaust_finish !== "not_visible" ? `, ${v.exhaust_finish} tips` : ""}`);
  if (v.window_tint !== "none") add("tint", "Outside", "Window tint", cap(v.window_tint));
  if (v.stripe !== "none") add("stripe", "Outside", "Stripes", cap(v.stripe), { hex: v.stripe_color_hex });
  add("taillights", "Outside", "Taillights", v.taillights);
  add("badges", "Outside", "Badges", v.badges);
  const i = r.interior;
  if (i) {
    add("seat", "Inside", "Seats", [i.seat_color_name, i.seat_material !== "not_visible" ? MATERIAL[i.seat_material] : null].filter(Boolean).join(", ") || null, { hex: i.seat_color_hex && /^#[0-9a-f]{6}$/i.test(i.seat_color_hex) ? i.seat_color_hex : null });
    add("wheel_int", "Inside", "Steering wheel", i.steering_wheel);
    add("gauges", "Inside", "Gauges", i.gauges);
    add("lighting", "Inside", "Interior lighting", i.lighting);
    add("console", "Inside", "Centre console", i.console);
  }
  add("engine", "Engine bay", "Engine", r.engine_bay?.engine);
  r.likely_modifications.forEach((m, n) => rows.push({ id: `mod:${n}`, group: "Mods", label: cap(m.category), value: m.name, ok: m.confidence !== "low" }));
  return rows;
}

/** What the ticked rows change: model config, vehicle columns, build-sheet values and mods. */
export function applySpotted(r: IdentifyResult, rows: SpotRow[], base: ModelConfig) {
  const on = (id: string) => rows.some((x) => x.id === id && x.ok);
  const v = r.visual, config: ModelConfig = { ...base };
  const vehicle: { exterior_color?: string | null; exterior_color_hex?: string; interior_color?: string | null; engine?: string | null } = {};
  const build: { exterior: Record<string, string>; interior: Record<string, string>; looks: Record<string, string> } = { exterior: {}, interior: {}, looks: {} };
  if (on("paint")) { config.paint = hex(r.exterior_color_hex, base.paint ?? "#9aa0a6"); vehicle.exterior_color_hex = config.paint; vehicle.exterior_color = r.exterior_color_name; }
  if (on("finish")) config.finish = r.paint_finish;
  if (on("wheels")) { config.wheelColor = hex(v.wheel_color_hex, "#2a2c30"); config.wheelStyle = v.wheel_style; if (v.wheel_size_in_estimate) config.wheelSize = Math.max(15, Math.min(22, v.wheel_size_in_estimate)); }
  if (on("calipers")) config.caliperColor = hex(v.caliper_color_hex, "#5b5e63");
  if (on("stance")) config.rideHeight = { slammed: -0.9, lowered: -0.45, stock: 0, lifted: 0.6 }[v.ride_height];
  if (on("spoiler")) config.spoiler = v.spoiler;
  if (on("splitter")) config.splitter = true;
  if (on("diffuser")) config.diffuser = true;
  if (on("skirts")) config.sideSkirts = true;
  if (on("exhaust")) { if (v.exhaust !== "not_visible") config.exhaust = v.exhaust; if (v.exhaust_finish !== "not_visible") config.exhaustFinish = v.exhaust_finish; }
  if (on("tint")) config.tint = { none: 0, light: 0.25, medium: 0.5, dark: 0.75, limo: 0.95 }[v.window_tint];
  if (on("stripe")) { config.stripe = v.stripe; config.stripeColor = v.stripe_color_hex; }
  if (on("headlights") && v.headlights !== "not_visible") build.looks.headlights = HEADLIGHT_HEX[v.headlights].hex;
  if (on("taillights") && v.taillights) build.exterior.taillights = v.taillights;
  if (on("badges") && v.badges) build.exterior.badges = v.badges;
  const i = r.interior;
  if (i) {
    if (on("seat")) {
      vehicle.interior_color = i.seat_color_name;
      if (i.seat_material !== "not_visible") build.interior.material = [i.seat_color_name, MATERIAL[i.seat_material]?.toLowerCase()].filter(Boolean).join(" ");
      if (i.seat_color_hex && /^#[0-9a-f]{6}$/i.test(i.seat_color_hex)) build.looks.interiorHex = i.seat_color_hex;
    }
    if (on("wheel_int") && i.steering_wheel) build.interior.wheel = i.steering_wheel;
    if (on("gauges") && i.gauges) build.interior.gauges = i.gauges;
    if (on("lighting") && i.lighting) build.interior.lighting = i.lighting;
    if (on("console") && i.console) build.interior.console = i.console;
  }
  if (on("engine") && r.engine_bay?.engine) vehicle.engine = r.engine_bay.engine;
  const mods = r.likely_modifications.filter((_, n) => on(`mod:${n}`)).map((m) => ({ category: m.category, name: m.name, brand: m.brand_guess }));
  return { config, vehicle, build, mods };
}
