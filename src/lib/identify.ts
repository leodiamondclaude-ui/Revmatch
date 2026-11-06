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
  };
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
