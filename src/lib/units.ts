export type Units = "imperial" | "metric";

export const MPS_TO_MPH = 2.2369362920544;
export const MPS_TO_KPH = 3.6;

export function speed(mps: number | null | undefined, units: Units, digits = 0) {
  if (mps == null) return "—";
  const v = units === "imperial" ? mps * MPS_TO_MPH : mps * MPS_TO_KPH;
  return v.toFixed(digits);
}
export const speedUnit = (u: Units) => (u === "imperial" ? "mph" : "km/h");
export const toSpeed = (mps: number, u: Units) => (u === "imperial" ? mps * MPS_TO_MPH : mps * MPS_TO_KPH);

export function distance(m: number | null | undefined, units: Units, digits = 1) {
  if (m == null) return "—";
  const v = units === "imperial" ? m / 1609.344 : m / 1000;
  return v.toFixed(digits);
}
export const distanceUnit = (u: Units) => (u === "imperial" ? "mi" : "km");

export function elevation(m: number | null | undefined, units: Units) {
  if (m == null) return "—";
  return units === "imperial" ? `${Math.round(m * 3.28084)} ft` : `${Math.round(m)} m`;
}

export function duration(s: number | null | undefined) {
  if (s == null) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h) return `${h}h ${m.toString().padStart(2, "0")}m`;
  return `${m}m ${sec.toString().padStart(2, "0")}s`;
}

export function vehicleName(v: { year: number | null; make: string; model: string; trim?: string | null }) {
  return [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ");
}

export function relTime(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  if (d < 86400 * 7) return `${Math.floor(d / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}
