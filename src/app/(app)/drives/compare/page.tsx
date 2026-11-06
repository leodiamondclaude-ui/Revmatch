import Link from "next/link";
import { requireViewer } from "@/lib/viewer";
import type { Drive } from "@/lib/types";
import { CompareChart } from "./CompareChart";
import { distance, distanceUnit, duration, speed, speedUnit } from "@/lib/units";
import { RUN_LABEL } from "@/lib/stats";

export const metadata = { title: "Compare drives" };
const COLORS = ["var(--accent)", "#3b82f6", "#3ddc97", "#f2c500"];

export default async function Compare({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const ids = ((await searchParams).ids ?? "").split(",").filter((x) => /^[0-9a-f-]{36}$/.test(x)).slice(0, 4);
  const { supabase, settings } = await requireViewer();
  const units = settings?.units ?? "imperial";
  const { data } = await supabase.from("drives").select("*").in("id", ids);
  const drives = ids.map((id) => (data ?? []).find((d) => d.id === id)).filter(Boolean) as Drive[];
  const metric = (label: string, f: (d: Drive) => string, best?: (d: Drive) => number, lower = false) => {
    const vals = best ? drives.map(best) : [];
    const b = vals.length ? (lower ? Math.min(...vals.filter((v) => v > 0)) : Math.max(...vals)) : null;
    return (
      <tr className="border-t border-line">
        <td className="py-2.5 pr-4 text-muted">{label}</td>
        {drives.map((d, i) => <td key={d.id} className={`num py-2.5 pr-4 ${b != null && vals[i] === b ? "text-accent" : ""}`}>{f(d)}</td>)}
      </tr>
    );
  };
  const run = (d: Drive, from: number, to: number) => d.acceleration?.runs?.find((r) => Math.round(r.from_kph) === from && Math.round(r.to_kph) === to)?.seconds ?? 0;
  return (
    <div className="space-y-6">
      <div><Link href="/drives" className="label text-accent">← Drives</Link><h1 className="h-display text-3xl">Compare drives</h1></div>
      <div className="panel overflow-x-auto p-5">
        <table className="w-full min-w-[520px] text-sm">
          <thead><tr><th />{drives.map((d, i) => (
            <th key={d.id} className="pb-2 pr-4 text-left font-normal"><span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: COLORS[i] }} />
              <Link href={`/drives/${d.id}`} className="font-semibold hover:text-accent">{d.title || new Date(d.started_at).toLocaleDateString()}</Link></th>
          ))}</tr></thead>
          <tbody>
            {metric("Distance", (d) => `${distance(d.distance_m, units)} ${distanceUnit(units)}`, (d) => Number(d.distance_m))}
            {metric("Duration", (d) => duration(d.duration_s), (d) => d.duration_s ?? 0)}
            {metric("Avg speed", (d) => `${speed(d.avg_speed_mps, units)} ${speedUnit(units)}`, (d) => Number(d.avg_speed_mps))}
            {metric("Moving avg", (d) => `${speed(d.avg_moving_speed_mps, units)} ${speedUnit(units)}`, (d) => Number(d.avg_moving_speed_mps))}
            {metric("Max speed", (d) => `${speed(d.max_speed_mps, units)} ${speedUnit(units)}`, (d) => Number(d.max_speed_mps))}
            {metric("Climb", (d) => (d.elevation_gain_m != null ? `${d.elevation_gain_m} m` : "n/a"), (d) => Number(d.elevation_gain_m ?? 0))}
            {metric("0–60 mph", (d) => (run(d, 0, 97) ? `${run(d, 0, 97).toFixed(2)} s` : "—"), (d) => run(d, 0, 97), true)}
            {metric("0–100 km/h", (d) => (run(d, 0, 100) ? `${run(d, 0, 100).toFixed(2)} s` : "—"), (d) => run(d, 0, 100), true)}
            {metric("Source / confidence", (d) => `${d.source} · ${d.confidence}`)}
          </tbody>
        </table>
        <p className="mt-3 text-[11px] text-dim">Highlighted values are the best in each row. Acceleration times only appear where the data supports them ({RUN_LABEL(0, 96.56)} needs Doppler or OBD speed).</p>
      </div>
      <CompareChart series={drives.map((d, i) => ({ id: d.id, color: COLORS[i], data: d.speed_series }))} units={units} />
    </div>
  );
}
