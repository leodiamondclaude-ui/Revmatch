import type { Drive } from "./types";

export interface Lifetime {
  drives: number;
  distance_m: number;
  duration_s: number;
  moving_s: number;
  max_speed_mps: number;
  avg_speed_mps: number;
  longest: Drive | null;
  avg_distance_m: number;
  best: Record<string, { seconds: number; source: string; reliability: string; drive_id: string }>;
  monthly: { key: string; label: string; distance_m: number; drives: number; duration_s: number }[];
  yearly: { key: string; distance_m: number; drives: number; duration_s: number; max_speed_mps: number }[];
}

export const RUN_LABEL = (from: number, to: number) => {
  const k = `${Math.round(from)}-${Math.round(to)}`;
  return ({ "0-97": "0–60 mph", "0-100": "0–100 km/h", "48-113": "30–70 mph", "100-200": "100–200 km/h" } as Record<string, string>)[k] ?? `${Math.round(from)}–${Math.round(to)} km/h`;
};

export function lifetime(drives: Drive[]): Lifetime {
  const done = drives.filter((d) => d.status === "complete");
  let distance = 0, duration = 0, moving = 0, max = 0;
  let longest: Drive | null = null;
  const best: Lifetime["best"] = {};
  const months = new Map<string, Lifetime["monthly"][number]>();
  const years = new Map<string, Lifetime["yearly"][number]>();
  for (const d of done) {
    const dist = Number(d.distance_m ?? 0);
    distance += dist;
    duration += d.duration_s ?? 0;
    moving += d.moving_s ?? 0;
    max = Math.max(max, Number(d.max_speed_mps ?? 0));
    if (!longest || dist > Number(longest.distance_m ?? 0)) longest = d;
    for (const r of d.acceleration?.runs ?? []) {
      const label = RUN_LABEL(r.from_kph, r.to_kph);
      if (!best[label] || r.seconds < best[label].seconds) best[label] = { seconds: r.seconds, source: r.source, reliability: r.reliability, drive_id: d.id };
    }
    const dt = new Date(d.started_at);
    const mk = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
    const m = months.get(mk) ?? { key: mk, label: dt.toLocaleDateString(undefined, { month: "short", year: "2-digit" }), distance_m: 0, drives: 0, duration_s: 0 };
    m.distance_m += dist; m.drives++; m.duration_s += d.duration_s ?? 0;
    months.set(mk, m);
    const yk = String(dt.getFullYear());
    const y = years.get(yk) ?? { key: yk, distance_m: 0, drives: 0, duration_s: 0, max_speed_mps: 0 };
    y.distance_m += dist; y.drives++; y.duration_s += d.duration_s ?? 0; y.max_speed_mps = Math.max(y.max_speed_mps, Number(d.max_speed_mps ?? 0));
    years.set(yk, y);
  }
  // Fill the last 12 months so the chart has a continuous axis.
  const monthly: Lifetime["monthly"] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mk = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
    monthly.push(months.get(mk) ?? { key: mk, label: dt.toLocaleDateString(undefined, { month: "short", year: "2-digit" }), distance_m: 0, drives: 0, duration_s: 0 });
  }
  return {
    drives: done.length,
    distance_m: distance,
    duration_s: duration,
    moving_s: moving,
    max_speed_mps: max,
    avg_speed_mps: duration ? distance / duration : 0,
    longest,
    avg_distance_m: done.length ? distance / done.length : 0,
    best,
    monthly,
    yearly: [...years.values()].sort((a, b) => a.key.localeCompare(b.key)),
  };
}
