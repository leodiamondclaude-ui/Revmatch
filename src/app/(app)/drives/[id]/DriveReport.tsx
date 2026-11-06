"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Loader2, RefreshCw, Share2, Trash2 } from "lucide-react";
import { useSupabase } from "@/lib/supabase/client";
import { accentFromPaint } from "@/lib/color";
import { finalizeDrive } from "@/lib/drive/finalize";
import { RUN_LABEL } from "@/lib/stats";
import { distance, distanceUnit, duration, elevation, speed, speedUnit, toSpeed, type Units } from "@/lib/units";
import type { Drive, Vehicle } from "@/lib/types";
import { AccentScope } from "@/components/ui/AccentScope";
import { Stat, StatPanel } from "@/components/ui/Stat";

const RouteMap = dynamic(() => import("@/components/drive/RouteMap"), { ssr: false, loading: () => <div className="h-80 animate-pulse bg-surface-2" /> });

type SampleRow = { t: string; lat: number | null; lng: number | null; altitude: number | null; accuracy: number | null; speed_mps: number | null; rpm: number | null; coolant_c: number | null; throttle_pct: number | null; engine_load_pct: number | null; accel_g: number | null };

const SRC: Record<string, string> = { obd: "OBD-II", gps_doppler: "GPS Doppler", gps_derived: "GPS position-derived", device_motion: "Phone accelerometer" };
const SEG_COLOR: Record<string, string> = { stopped: "#3a3f46", city: "#3b82f6", arterial: "#a78bfa", highway: "var(--accent)" };
const tt = { contentStyle: { background: "#14171b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }, labelStyle: { color: "#8a9099" } };
const fmtT = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function DriveReport({ drive: d, vehicle, samples, isOwner, units, opts, lifetimeAvg }: {
  drive: Drive; vehicle: Vehicle | null; samples: SampleRow[] | null; isOwner: boolean; units: Units;
  opts: { maxAccuracyM: number; endpointPrivacyM: number }; lifetimeAvg: { distance_m: number; speed_mps: number; n: number } | null;
}) {
  const router = useRouter();
  const accent = accentFromPaint(vehicle?.exterior_color_hex);
  const [title, setTitle] = useState(d.title ?? "");
  const [notes, setNotes] = useState(d.notes ?? "");
  const [vis, setVis] = useState(d.visibility);
  const [shareRoute, setShareRoute] = useState(d.share_route);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const supabase = useSupabase();

  const t0 = samples?.length ? new Date(samples[0].t).getTime() : 0;
  const speedData = d.speed_series.map(([t, mps, src]) => ({ t, v: +toSpeed(mps, units).toFixed(1), src }));
  const route = useMemo(() => {
    if (samples) return samples.filter((s) => s.lat != null).map((s) => ({ lat: s.lat!, lng: s.lng!, mps: s.speed_mps }));
    if (d.share_route && d.route_preview) return d.route_preview.map(([lat, lng]) => ({ lat, lng }));
    return [];
  }, [samples, d.share_route, d.route_preview]);
  const elevData = useMemo(() => samples?.filter((s) => s.altitude != null).filter((_, i, a) => i % Math.ceil(a.length / 400) === 0)
    .map((s) => ({ t: (new Date(s.t).getTime() - t0) / 1000, a: Math.round(units === "imperial" ? s.altitude! * 3.281 : s.altitude!) })) ?? [], [samples, t0, units]);
  const obdData = useMemo(() => samples?.filter((s) => s.rpm != null || s.throttle_pct != null).filter((_, i, a) => i % Math.ceil(a.length / 500) === 0)
    .map((s) => ({ t: (new Date(s.t).getTime() - t0) / 1000, rpm: s.rpm, thr: s.throttle_pct, load: s.engine_load_pct, cool: s.coolant_c })) ?? [], [samples, t0]);

  async function saveMeta() {
    setBusy("save");
    const { error } = await supabase.from("drives").update({ title: title || null, notes: notes || null, visibility: vis, share_route: shareRoute }).eq("id", d.id);
    setBusy(null); setMsg(error ? error.message : "Saved.");
    router.refresh();
  }
  async function shareToFeed() {
    setBusy("share");
    if (vis === "private") { setMsg("Set visibility to friends or public first."); setBusy(null); return; }
    await supabase.from("drives").update({ visibility: vis, share_route: shareRoute }).eq("id", d.id);
    const { error } = await supabase.from("posts").insert({
      author_id: d.owner_id, vehicle_id: d.vehicle_id, kind: "drive", ref_id: d.id, visibility: vis === "friends" ? "friends" : "public",
      body: title || `Logged a ${distance(d.distance_m, units)} ${distanceUnit(units)} drive`,
      meta: { distance_m: d.distance_m, duration_s: d.duration_s, max_speed_mps: d.max_speed_mps, avg_speed_mps: d.avg_speed_mps },
    });
    setBusy(null); setMsg(error ? error.message : "Shared to your feed.");
  }
  async function recompute() {
    setBusy("re");
    try { const r = await finalizeDrive(d.id, opts); if (r.deleted) router.push("/drives"); else router.refresh(); setMsg("Recomputed with your current settings."); }
    catch (e) { setMsg((e as Error).message); } finally { setBusy(null); }
  }
  async function remove() {
    if (!confirm("Delete this drive and its GPS data permanently?")) return;
    await supabase.from("drives").delete().eq("id", d.id);
    router.push("/drives"); router.refresh();
  }

  const totalSeg = d.segments.reduce((s, x) => s + (x.end_s - x.start_s), 0) || 1;
  const runs = d.acceleration?.runs ?? [];
  const peak = d.acceleration?.peak_long_g;

  return (
    <AccentScope accent={accent}>
      <div className="mb-5">
        <div className="label text-accent">Drive report · {new Date(d.started_at).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</div>
        <h1 className="h-display text-3xl sm:text-4xl">{d.title || `${new Date(d.started_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} drive`}</h1>
        <div className="mt-2 flex flex-wrap gap-2">
          {vehicle && <Link href={`/v/${vehicle.slug}`} className="chip-accent">{vehicle.nickname || `${vehicle.year ?? ""} ${vehicle.make} ${vehicle.model}`}</Link>}
          <span className="chip">{d.source === "gps+obd" ? "GPS + OBD-II" : "Phone GPS"}</span>
          <span className="chip">{d.start_mode} start</span>
          <span className={`chip ${d.confidence === "high" ? "!text-ok" : d.confidence === "medium" ? "!text-warn" : "!text-bad"}`}>{d.confidence} confidence</span>
        </div>
      </div>

      <StatPanel className="mb-5">
        <Stat big label="Distance" value={distance(d.distance_m, units, 2)} unit={distanceUnit(units)} sub={lifetimeAvg && `avg drive ${distance(lifetimeAvg.distance_m, units)} ${distanceUnit(units)}`} />
        <Stat big label="Duration" value={duration(d.duration_s)} sub={`moving ${duration(d.moving_s)}`} />
        <Stat big label="Avg speed" value={speed(d.avg_speed_mps, units)} unit={speedUnit(units)} sub={`moving avg ${speed(d.avg_moving_speed_mps, units)}${lifetimeAvg ? ` · lifetime ${speed(lifetimeAvg.speed_mps, units)}` : ""}`} />
        <Stat big label="Max recorded" value={speed(d.max_speed_mps, units)} unit={speedUnit(units)} sub="sustained across 2 samples" />
        <Stat label="Start" value={new Date(d.started_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} />
        <Stat label="Finish" value={d.ended_at ? new Date(d.ended_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "—"} />
        <Stat label="Climb / descent" value={d.elevation_gain_m != null ? `${elevation(d.elevation_gain_m, units)} / ${elevation(d.elevation_loss_m, units)}` : "n/a"} sub={d.elevation_gain_m != null ? "GPS altitude, 3 m noise filter" : "device gave no altitude"} />
        <Stat label="Avg GPS accuracy" value={d.avg_accuracy_m != null ? `±${d.avg_accuracy_m}` : "—"} unit="m" sub={`${d.sample_count} samples · ${d.sample_rate_hz} Hz`} />
      </StatPanel>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <section className="panel overflow-hidden">
            {route.length > 1 ? <RouteMap points={route} accent={accent} colorBySpeed={!!samples} showEnds={!!samples} className="h-80 w-full sm:h-96" />
              : <div className="carbon grid h-48 place-items-center text-sm text-muted">{isOwner ? "No route recorded." : "The driver hasn't shared this route."}</div>}
            <div className="p-3 text-xs text-muted">{samples ? "Full route with start and finish, visible only to you. Coloured by speed." : "Shared route with the start and finish areas removed for privacy."}</div>
          </section>

          <section className="panel p-5">
            <div className="label mb-3">Speed trace ({speedUnit(units)})</div>
            <div className="h-60">
              <ResponsiveContainer>
                <AreaChart data={speedData} margin={{ left: -18, right: 6 }}>
                  <defs><linearGradient id="sp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--accent)" stopOpacity={0.5} /><stop offset="100%" stopColor="var(--accent)" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={fmtT} tick={{ fill: "#8a9099", fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: "#8a9099", fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip {...tt} labelFormatter={(l) => `t+${fmtT(Number(l))}`} formatter={(v, _n, p) => [`${v} ${speedUnit(units)}`, SRC[(p.payload as { src: string }).src] ?? "speed"]} />
                  <Area type="monotone" dataKey="v" stroke="var(--accent)" strokeWidth={2} fill="url(#sp)" isAnimationActive />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            {d.segments.length > 0 && (
              <div className="mt-4">
                <div className="flex h-3 overflow-hidden rounded-full">
                  {d.segments.map((s, i) => <div key={i} title={`${s.kind}: ${distance(s.distance_m, units)} ${distanceUnit(units)}`} style={{ width: `${((s.end_s - s.start_s) / totalSeg) * 100}%`, background: SEG_COLOR[s.kind] }} />)}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(["city", "arterial", "highway", "stopped"] as const).map((k) => {
                    const ss = d.segments.filter((s) => s.kind === k);
                    if (!ss.length) return null;
                    const dist = ss.reduce((a, s) => a + s.distance_m, 0), time = ss.reduce((a, s) => a + s.end_s - s.start_s, 0);
                    return (
                      <div key={k} className="rounded-lg border border-line p-2.5">
                        <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: SEG_COLOR[k] }} /><span className="label">{k}</span></div>
                        <div className="num text-sm">{distance(dist, units)} {distanceUnit(units)} · {duration(time)}</div>
                        {k !== "stopped" && <div className="num text-xs text-muted">avg {speed(time ? dist / time : 0, units)} · max {speed(Math.max(...ss.map((s) => s.max_speed_mps)), units)}</div>}
                      </div>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11px] text-dim">Road type is inferred from sustained speed bands, not from map data. Segments never include location.</p>
              </div>
            )}
          </section>

          {elevData.length > 5 && (
            <section className="panel p-5">
              <div className="label mb-3">Elevation ({units === "imperial" ? "ft" : "m"}), GPS altitude</div>
              <div className="h-40"><ResponsiveContainer>
                <AreaChart data={elevData} margin={{ left: -10, right: 6 }}>
                  <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={fmtT} tick={{ fill: "#8a9099", fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis domain={["dataMin - 10", "dataMax + 10"]} tick={{ fill: "#8a9099", fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip {...tt} labelFormatter={(l) => `t+${fmtT(Number(l))}`} />
                  <Area dataKey="a" stroke="#8a9099" fill="rgba(255,255,255,0.06)" />
                </AreaChart>
              </ResponsiveContainer></div>
            </section>
          )}

          {obdData.length > 5 && (
            <section className="panel p-5">
              <div className="label mb-3">OBD-II channels</div>
              <div className="h-56"><ResponsiveContainer>
                <LineChart data={obdData} margin={{ left: -10, right: 6 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={fmtT} tick={{ fill: "#8a9099", fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="rpm" tick={{ fill: "#8a9099", fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="pct" orientation="right" domain={[0, 100]} tick={{ fill: "#8a9099", fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip {...tt} labelFormatter={(l) => `t+${fmtT(Number(l))}`} />
                  <Line yAxisId="rpm" dataKey="rpm" name="RPM" stroke="var(--accent)" dot={false} strokeWidth={1.5} connectNulls />
                  <Line yAxisId="pct" dataKey="thr" name="Throttle %" stroke="#3ddc97" dot={false} strokeWidth={1.2} connectNulls />
                  <Line yAxisId="pct" dataKey="load" name="Load %" stroke="#a78bfa" dot={false} strokeWidth={1.2} connectNulls />
                </LineChart>
              </ResponsiveContainer></div>
            </section>
          )}
        </div>

        <aside className="space-y-5">
          <section className="panel panel-accent p-5">
            <div className="label mb-3">Acceleration</div>
            {runs.length === 0 ? (
              <p className="text-sm text-muted">No qualifying runs in this drive. Timed runs need direct speed (OBD-II or GPS Doppler), samples at most 1.5 s apart, and continuous acceleration. Position-only GPS is never used for timing.</p>
            ) : (
              <ul className="space-y-3">
                {runs.map((r, i) => (
                  <li key={i} className="flex items-center justify-between gap-3">
                    <div><div className="font-semibold">{RUN_LABEL(r.from_kph, r.to_kph)}</div><div className="text-xs text-muted">{SRC[r.source]} · {r.sample_hz} Hz · {r.reliability === "good" ? "dense sampling" : "estimate, ±0.5 s or more"}</div></div>
                    <div className="num text-3xl text-accent">{r.seconds.toFixed(2)}<span className="text-sm">s</span></div>
                  </li>
                ))}
              </ul>
            )}
            {peak && (
              <div className="mt-4 border-t border-line pt-3">
                <div className="flex items-baseline justify-between"><span className="label">Peak longitudinal</span><span className="num text-xl">{peak.value.toFixed(2)} g</span></div>
                <p className="mt-1 text-xs text-muted">{SRC[peak.source]}. {peak.note}</p>
              </div>
            )}
          </section>

          {d.obd_summary && (
            <section className="panel p-5">
              <div className="label mb-3">OBD-II summary (only PIDs your car reported)</div>
              <table className="w-full text-sm"><tbody className="num">
                {Object.entries(d.obd_summary).map(([k, s]) => (
                  <tr key={k} className="border-b border-line last:border-0"><td className="py-1.5 font-sans text-muted">{k.replace(/_/g, " ")}</td><td>{s.min}–{s.max}</td><td className="text-right">avg {s.avg} {s.unit}</td></tr>
                ))}
              </tbody></table>
            </section>
          )}

          <section className="panel p-5 text-sm">
            <div className="label mb-2">Data quality</div>
            <ul className="space-y-1.5 text-muted">
              <li>Speed source: <b className="text-ink">{[...new Set(d.speed_series.map((x) => SRC[x[2]] ?? x[2]))].join(", ") || "—"}</b></li>
              <li>Sampling: <b className="text-ink">{d.sample_rate_hz} Hz</b> ({d.sample_count} samples)</li>
              <li>Mean horizontal accuracy: <b className="text-ink">{d.avg_accuracy_m != null ? `±${d.avg_accuracy_m} m` : "unknown"}</b></li>
              <li>Confidence <b className="text-ink">{d.confidence}</b>: high means ≤10 m accuracy, ≥0.8 Hz and mostly Doppler or OBD speed.</li>
            </ul>
          </section>

          {isOwner && (
            <section className="panel space-y-3 p-5">
              <div className="label">Details &amp; privacy</div>
              <input className="input" placeholder="Title (e.g. Canyon run)" value={title} onChange={(e) => setTitle(e.target.value)} />
              <textarea className="input min-h-16" placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
              <select className="input" value={vis} onChange={(e) => setVis(e.target.value as Drive["visibility"])}>
                <option value="private">Private: only me</option><option value="friends">Friends can see stats</option><option value="public">Public stats</option>
              </select>
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={shareRoute} onChange={(e) => setShareRoute(e.target.checked)} className="mt-1 accent-[var(--accent)]" />
                <span>Share the route map (with the first and last {opts.endpointPrivacyM} m removed). Start and finish points are never shared.</span></label>
              {msg && <p className="text-xs text-accent">{msg}</p>}
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-primary" onClick={saveMeta} disabled={!!busy}>{busy === "save" && <Loader2 size={14} className="animate-spin" />} Save</button>
                <button type="button" className="btn-ghost" onClick={shareToFeed} disabled={!!busy}><Share2 size={14} /> Post</button>
                <button type="button" className="btn-quiet" onClick={recompute} disabled={!!busy} title="Re-analyse from raw samples">{busy === "re" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}</button>
                <button type="button" className="btn-quiet !text-bad" onClick={remove} aria-label="Delete drive"><Trash2 size={14} /></button>
              </div>
            </section>
          )}
        </aside>
      </div>
    </AccentScope>
  );
}
