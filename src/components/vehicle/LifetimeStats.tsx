"use client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Drive } from "@/lib/types";
import { lifetime } from "@/lib/stats";
import { distance, distanceUnit, duration, speed, speedUnit, type Units } from "@/lib/units";
import { Stat, StatPanel } from "@/components/ui/Stat";
import Link from "next/link";

const SRC_LABEL: Record<string, string> = { obd: "OBD-II speed", gps_doppler: "GPS Doppler speed" };

export interface PublicStats { drives: number; distance_m: number; duration_s: number; max_speed_mps: number | null; avg_speed_mps: number | null; longest_m: number | null; best_0_60_s: number | null; best_0_100_s: number | null }

export function LifetimeStats({ drives, publicStats, units }: { drives: Drive[] | null; publicStats: PublicStats | null; units: Units }) {
  if (!drives) {
    if (!publicStats) return <p className="text-sm text-muted">The owner hasn&apos;t shared driving statistics for this vehicle.</p>;
    const p = publicStats;
    return (
      <StatPanel>
        <Stat label="Distance tracked" value={distance(Number(p.distance_m), units, 0)} unit={distanceUnit(units)} />
        <Stat label="Drives" value={p.drives} />
        <Stat label="Top recorded speed" value={speed(p.max_speed_mps, units)} unit={speedUnit(units)} />
        <Stat label="Avg speed" value={speed(p.avg_speed_mps, units)} unit={speedUnit(units)} />
        <Stat label="Time behind the wheel" value={duration(Number(p.duration_s))} />
        <Stat label="Longest drive" value={distance(p.longest_m, units)} unit={distanceUnit(units)} />
        {p.best_0_60_s && <Stat label="Best 0–60 mph" value={Number(p.best_0_60_s).toFixed(2)} unit="s" sub="from recorded drive data" />}
        {p.best_0_100_s && <Stat label="Best 0–100 km/h" value={Number(p.best_0_100_s).toFixed(2)} unit="s" sub="from recorded drive data" />}
      </StatPanel>
    );
  }
  const L = lifetime(drives);
  if (!L.drives) return <p className="text-sm text-muted">No drives recorded with this vehicle yet. <Link href="/drive" className="text-accent">Start a drive</Link>.</p>;
  const toDist = (m: number) => +(units === "imperial" ? m / 1609.344 : m / 1000).toFixed(1);
  return (
    <div className="space-y-4">
      <StatPanel>
        <Stat big label="Total tracked" value={distance(L.distance_m, units, 0)} unit={distanceUnit(units)} />
        <Stat big label="Drives" value={L.drives} />
        <Stat big label="Top speed" value={speed(L.max_speed_mps, units)} unit={speedUnit(units)} />
        <Stat big label="Avg speed" value={speed(L.avg_speed_mps, units)} unit={speedUnit(units)} />
        <Stat label="Driving time" value={duration(L.duration_s)} />
        <Stat label="Moving time" value={duration(L.moving_s)} />
        <Stat label="Avg per drive" value={distance(L.avg_distance_m, units)} unit={distanceUnit(units)} />
        <Stat label="Longest drive" value={distance(Number(L.longest?.distance_m ?? 0), units)} unit={distanceUnit(units)}
          sub={L.longest && <Link className="text-accent" href={`/drives/${L.longest.id}`}>{new Date(L.longest.started_at).toLocaleDateString()}</Link>} />
      </StatPanel>
      <div className="panel p-5">
        <div className="label mb-3">Monthly distance ({distanceUnit(units)})</div>
        <div className="h-56">
          <ResponsiveContainer>
            <BarChart data={L.monthly.map((m) => ({ ...m, d: toDist(m.distance_m) }))} margin={{ left: -18, right: 4 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "#8a9099", fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: "#8a9099", fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} contentStyle={{ background: "#14171b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                formatter={(v) => [`${v} ${distanceUnit(units)}`, "Distance"]} />
              <Bar dataKey="d" fill="var(--accent)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="panel p-5">
          <div className="label mb-3">By year</div>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted"><th className="pb-2 font-normal">Year</th><th className="font-normal">Drives</th><th className="font-normal">Distance</th><th className="font-normal">Top</th></tr></thead>
            <tbody className="num">
              {L.yearly.map((y) => (
                <tr key={y.key} className="border-t border-line"><td className="py-2">{y.key}</td><td>{y.drives}</td><td>{distance(y.distance_m, units, 0)} {distanceUnit(units)}</td><td>{speed(y.max_speed_mps, units)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel p-5">
          <div className="label mb-3">Acceleration records</div>
          {Object.keys(L.best).length === 0 ? (
            <p className="text-sm text-muted">No qualifying runs yet. A run only counts when speed comes from OBD-II or GPS Doppler, samples are at most 1.5 s apart, and the car accelerates without lifting.</p>
          ) : (
            <ul className="space-y-2">
              {Object.entries(L.best).map(([label, b]) => (
                <li key={label} className="flex items-center justify-between gap-3 border-b border-line pb-2">
                  <div><div className="font-semibold">{label}</div><div className="text-xs text-muted">{SRC_LABEL[b.source] ?? b.source} · {b.reliability === "good" ? "dense sampling" : "estimate (≈1 Hz GPS)"}</div></div>
                  <Link href={`/drives/${b.drive_id}`} className="num text-2xl text-accent">{b.seconds.toFixed(2)}s</Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
