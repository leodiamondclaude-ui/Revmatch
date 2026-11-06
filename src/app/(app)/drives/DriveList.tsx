"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { GitCompare, Loader2, Play } from "lucide-react";
import { lifetime } from "@/lib/stats";
import { finalizeDrive } from "@/lib/drive/finalize";
import { distance, distanceUnit, duration, speed, speedUnit, type Units } from "@/lib/units";
import type { Drive, Vehicle } from "@/lib/types";
import { Stat, StatPanel } from "@/components/ui/Stat";
import { Empty } from "@/components/ui/Empty";
import { SectionTitle } from "@/components/ui/SectionTitle";

export function DriveList({ drives, vehicles, units, opts }: { drives: Drive[]; vehicles: Vehicle[]; units: Units; opts: { maxAccuracyM: number; endpointPrivacyM: number } }) {
  const router = useRouter();
  const [vf, setVf] = useState<string>("all");
  const [sel, setSel] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const shown = useMemo(() => drives.filter((d) => vf === "all" || d.vehicle_id === vf), [drives, vf]);
  const L = lifetime(shown);
  const vname = (id: string | null) => { const v = vehicles.find((x) => x.id === id); return v ? v.nickname || `${v.make} ${v.model}` : "No vehicle"; };
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id].slice(-4)));

  async function finalize(id: string) {
    setBusy(id);
    try { await finalizeDrive(id, opts); } finally { setBusy(null); router.refresh(); }
  }

  if (!drives.length) return <Empty title="No drives yet" body="Record your first drive with phone GPS. No extra hardware needed." action={<Link href="/drive" className="btn-primary"><Play size={16} /> Start a drive</Link>} />;

  return (
    <div className="space-y-6">
      <SectionTitle kicker="History" title="Drives" action={
        <div className="flex gap-2">
          <select className="input !w-auto" value={vf} onChange={(e) => setVf(e.target.value)}>
            <option value="all">All vehicles</option>
            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.nickname || `${v.make} ${v.model}`}</option>)}
          </select>
          <button type="button" className="btn-ghost" disabled={sel.length < 2} onClick={() => router.push(`/drives/compare?ids=${sel.join(",")}`)}><GitCompare size={16} /> Compare {sel.length > 1 ? sel.length : ""}</button>
        </div>
      } />
      <StatPanel>
        <Stat label="Lifetime distance" value={distance(L.distance_m, units, 0)} unit={distanceUnit(units)} />
        <Stat label="Drives" value={L.drives} />
        <Stat label="Avg speed" value={speed(L.avg_speed_mps, units)} unit={speedUnit(units)} sub="distance ÷ total time" />
        <Stat label="Avg distance" value={distance(L.avg_distance_m, units)} unit={distanceUnit(units)} />
      </StatPanel>
      <p className="text-xs text-muted">Select two to four drives to compare them side by side.</p>
      <div className="space-y-2">
        {shown.map((d) => (
          <div key={d.id} className={`panel flex items-center gap-3 p-3 transition sm:p-4 ${sel.includes(d.id) ? "border-accent/60" : ""}`}>
            {d.status === "complete" && <input type="checkbox" aria-label="Select for comparison" checked={sel.includes(d.id)} onChange={() => toggle(d.id)} className="h-4 w-4 accent-[var(--accent)]" />}
            <Link href={d.status === "complete" ? `/drives/${d.id}` : "#"} className="grid min-w-0 flex-1 grid-cols-2 items-center gap-2 sm:grid-cols-[1.6fr_repeat(4,1fr)]">
              <div className="col-span-2 min-w-0 sm:col-span-1">
                <div className="truncate font-semibold">{d.title || new Date(d.started_at).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
                <div className="flex flex-wrap gap-1.5 font-mono text-[10px] uppercase text-muted">
                  <span>{vname(d.vehicle_id)}</span>·<span>{d.source}</span>·<span>{d.start_mode}</span>{d.visibility !== "private" && <>·<span className="text-accent">{d.visibility}</span></>}
                </div>
              </div>
              {d.status === "complete" ? <>
                <div className="num">{distance(d.distance_m, units)} <span className="text-xs text-muted">{distanceUnit(units)}</span></div>
                <div className="num">{duration(d.duration_s)}</div>
                <div className="num">{speed(d.avg_speed_mps, units)} <span className="text-xs text-muted">avg</span></div>
                <div className="num">{speed(d.max_speed_mps, units)} <span className="text-xs text-muted">max</span></div>
              </> : <div className="col-span-2 text-sm text-warn sm:col-span-4">Unfinished: the recording was interrupted.</div>}
            </Link>
            {d.status !== "complete" && <button type="button" className="btn-ghost !py-1.5" onClick={() => finalize(d.id)} disabled={busy === d.id}>{busy === d.id ? <Loader2 size={14} className="animate-spin" /> : "Finalize"}</button>}
          </div>
        ))}
      </div>
    </div>
  );
}
