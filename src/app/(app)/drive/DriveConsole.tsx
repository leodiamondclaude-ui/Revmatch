"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Bluetooth, BluetoothOff, Loader2, Play, Radar, Square } from "lucide-react";
import { useSupabase } from "@/lib/supabase/client";
import { accentFromPaint } from "@/lib/color";
import { DriveRecorder, TripDetector, toRow } from "@/lib/drive/recorder";
import { analyzeDrive, haversine, sampleSpeed, type Sample } from "@/lib/drive/analysis";
import { Elm327, obdSupported, PIDS, type ObdValues } from "@/lib/obd/elm327";
import { distance, distanceUnit, duration, speedUnit, toSpeed } from "@/lib/units";
import type { UserSettings, Vehicle } from "@/lib/types";
import { AccentScope } from "@/components/ui/AccentScope";
import { Gauge } from "@/components/drive/Gauge";

const RouteMap = dynamic(() => import("@/components/drive/RouteMap"), { ssr: false, loading: () => <div className="h-56 animate-pulse rounded-xl bg-surface-2" /> });

type Phase = "idle" | "starting" | "recording" | "saving";
const SRC: Record<string, string> = { obd: "OBD-II", gps_doppler: "GPS Doppler", gps_derived: "GPS position" };

export function DriveConsole({ userId, vehicles, primaryId, settings }: { userId: string; vehicles: Vehicle[]; primaryId: string | null; settings: UserSettings }) {
  const router = useRouter();
  const units = settings.units;
  const [vehicleId, setVehicleId] = useState<string | null>(primaryId ?? vehicles[0]?.id ?? null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [live, setLive] = useState<{ s: Sample | null; n: number; dist: number; t0: number; idleSince: number | null }>({ s: null, n: 0, dist: 0, t0: 0, idleSince: null });
  const [track, setTrack] = useState<{ lat: number; lng: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [autoOn, setAutoOn] = useState(settings.auto_detect);
  const [autoStatus, setAutoStatus] = useState<string>("");
  const [tripPrompt, setTripPrompt] = useState(false);
  const [startMode, setStartMode] = useState<"manual" | "auto">("manual");
  const [obd, setObd] = useState<{ state: "off" | "connecting" | "on" | "error"; msg?: string; name?: string; values: ObdValues; pids: string[] }>({ state: "off", values: {}, pids: [] });
  const [now, setNow] = useState(Date.now());

  const recorder = useRef<DriveRecorder | null>(null);
  const driveId = useRef<string | null>(null);
  const flushed = useRef(0);
  const elm = useRef<Elm327 | null>(null);
  const obdLoop = useRef(false);
  const detector = useRef<TripDetector | null>(null);
  const supabase = useSupabase();
  const vehicle = vehicles.find((v) => v.id === vehicleId);
  const accent = accentFromPaint(vehicle?.exterior_color_hex);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const flush = useCallback(async () => {
    const r = recorder.current, id = driveId.current;
    if (!r || !id) return;
    const batch = r.samples.slice(flushed.current);
    if (!batch.length) return;
    const { error } = await supabase.from("drive_samples").insert(batch.map((s) => toRow(s, id, userId)));
    if (!error) flushed.current += batch.length;
  }, [supabase, userId]);

  useEffect(() => {
    if (phase !== "recording") return;
    const t = setInterval(flush, 5000);
    return () => clearInterval(t);
  }, [phase, flush]);

  // Warn before closing a tab mid-drive.
  useEffect(() => {
    if (phase !== "recording") return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [phase]);

  async function start(mode: "manual" | "auto") {
    setError(null); setPhase("starting"); setTripPrompt(false); setStartMode(mode);
    detector.current?.stop();
    try {
      const { data, error } = await supabase.from("drives").insert({
        owner_id: userId, vehicle_id: vehicleId, started_at: new Date().toISOString(), status: "recording", start_mode: mode,
        visibility: settings.default_drive_visibility, share_route: settings.default_share_route,
      }).select("id").single();
      if (error) throw error;
      driveId.current = data.id;
      flushed.current = 0;
      const rec = new DriveRecorder({ minDistanceM: settings.min_sample_distance_m, useMotion: true });
      recorder.current = rec;
      const t0 = Date.now();
      setLive({ s: null, n: 0, dist: 0, t0, idleSince: null });
      setTrack([]);
      rec.subscribe(({ sample, count, error }) => {
        if (error) setError(error);
        if (!sample) return;
        setLive((L) => {
          let dist = L.dist;
          const prev = L.s;
          if (sample.lat != null && prev?.lat != null && (sample.accuracy ?? 99) <= settings.max_accuracy_m) {
            const d = haversine(prev.lat, prev.lng!, sample.lat, sample.lng!);
            if (d > Math.min(25, (sample.accuracy ?? 5) / 2) && d < 500) dist += d;
          }
          const sp = sampleSpeed(sample)?.mps ?? 0;
          const idleSince = sp < 0.6 ? L.idleSince ?? Date.now() : null;
          return { s: sample.lat != null ? sample : { ...(prev ?? sample), ...sample, lat: prev?.lat ?? null, lng: prev?.lng ?? null }, n: count, dist: sample.lat != null && prev?.lat != null ? dist : L.dist, t0: L.t0, idleSince };
        });
        if (sample.lat != null) setTrack((tr) => (tr.length && haversine(tr[tr.length - 1].lat, tr[tr.length - 1].lng, sample.lat!, sample.lng!) < settings.min_sample_distance_m ? tr : [...tr, { lat: sample.lat!, lng: sample.lng! }]));
      });
      await rec.start();
      setPhase("recording");
    } catch (e) {
      setError((e as Error).message);
      setPhase("idle");
    }
  }

  const stop = useCallback(async () => {
    const r = recorder.current, id = driveId.current;
    if (!r || !id) return;
    setPhase("saving");
    const samples = await r.stop();
    await flush();
    const fixes = samples.filter((s) => s.lat != null);
    if (fixes.length < 5) {
      await supabase.from("drives").delete().eq("id", id);
      setError("Not enough GPS fixes to save a drive (need at least 5). Check location permission and sky visibility.");
      setPhase("idle");
      return;
    }
    const a = analyzeDrive(samples, { maxAccuracyM: settings.max_accuracy_m, endpointPrivacyM: settings.endpoint_privacy_m });
    const { full_route: _route, ...agg } = a;
    void _route;
    const { error } = await supabase.from("drives").update({ ...agg, status: "complete" }).eq("id", id);
    if (error) { setError(error.message); setPhase("idle"); return; }
    recorder.current = null; driveId.current = null;
    router.push(`/drives/${id}`);
  }, [flush, router, settings, supabase]);

  // Auto-stop for auto-started drives after sustained idling.
  useEffect(() => {
    if (phase === "recording" && startMode === "auto" && live.idleSince && now - live.idleSince > settings.auto_stop_idle_s * 1000) void stop();
  }, [now, live.idleSince, phase, startMode, settings.auto_stop_idle_s, stop]);

  // Automatic trip detection while this page is open.
  useEffect(() => {
    if (!autoOn || phase !== "idle") { detector.current?.stop(); return; }
    const d = new TripDetector({
      minSpeedKph: settings.auto_min_speed_kph, minDurationS: settings.auto_min_duration_s,
      onTrip: () => (settings.auto_action === "auto" ? void start("auto") : setTripPrompt(true)),
      onStatus: (kph) => setAutoStatus(kph == null ? "Waiting for GPS speed…" : `Watching · ${Math.round(units === "imperial" ? kph / 1.609 : kph)} ${speedUnit(units)}`),
    });
    detector.current = d;
    d.start();
    return () => d.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOn, phase]);

  async function connectObd() {
    const sup = obdSupported();
    if (!sup.ok) { setObd((o) => ({ ...o, state: "error", msg: sup.reason })); return; }
    setObd((o) => ({ ...o, state: "connecting", msg: undefined }));
    const e = new Elm327();
    e.onDisconnect = () => { obdLoop.current = false; setObd((o) => ({ ...o, state: "off", msg: "Adapter disconnected." })); };
    try {
      await e.connect();
      elm.current = e;
      const pids = e.availablePids;
      setObd({ state: "on", name: e.deviceName, values: {}, pids: pids.map((p) => p.pid), msg: `Protocol ${e.protocol || "auto"}` });
      obdLoop.current = true;
      (async () => {
        while (obdLoop.current) {
          const vals = await e.poll(pids).catch(() => ({} as ObdValues));
          setObd((o) => ({ ...o, values: vals }));
          recorder.current?.setObd({ rpm: vals.rpm ?? null, obdSpeedKph: vals.obdSpeedKph ?? null, coolantC: vals.coolantC ?? null, throttlePct: vals.throttlePct ?? null, engineLoadPct: vals.engineLoadPct ?? null, intakeTempC: vals.intakeTempC ?? null });
          recorder.current?.pushObdSample();
        }
      })();
    } catch (err) {
      e.disconnect();
      setObd((o) => ({ ...o, state: "error", msg: (err as Error).message }));
    }
  }
  function disconnectObd() { obdLoop.current = false; elm.current?.disconnect(); elm.current = null; setObd({ state: "off", values: {}, pids: [] }); }
  useEffect(() => () => { obdLoop.current = false; elm.current?.disconnect(); }, []);

  const s = live.s;
  const sp = s ? sampleSpeed(s) : null;
  const speedVal = sp ? toSpeed(sp.mps, units) : null;
  const elapsed = phase === "recording" ? (now - live.t0) / 1000 : 0;
  const acc = s?.accuracy;
  const accTone = acc == null ? "text-muted" : acc <= 10 ? "text-ok" : acc <= 25 ? "text-warn" : "text-bad";

  return (
    <AccentScope accent={accent}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="label text-accent">Telemetry</div>
          <h1 className="h-display text-3xl sm:text-4xl">{phase === "recording" ? "Recording" : "Drive"}</h1>
        </div>
        <select className="input !w-auto" value={vehicleId ?? ""} disabled={phase !== "idle"} onChange={(e) => setVehicleId(e.target.value || null)}>
          {vehicles.map((v) => <option key={v.id} value={v.id}>{v.nickname || `${v.year ?? ""} ${v.make} ${v.model}`}</option>)}
          <option value="">No vehicle</option>
        </select>
      </div>

      {error && <div className="mb-4 flex items-start gap-2 rounded-xl border border-bad/40 bg-bad/10 p-3 text-sm text-bad"><AlertTriangle size={16} className="mt-0.5 shrink-0" />{error}</div>}
      {tripPrompt && phase === "idle" && (
        <div className="rise mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-accent bg-accent/15 p-4">
          <Radar className="text-accent" />
          <div className="flex-1"><b>Looks like you&apos;re driving.</b> <span className="text-muted">Start recording this trip?</span></div>
          <button type="button" className="btn-quiet" onClick={() => setTripPrompt(false)}>Dismiss</button>
          <button type="button" className="btn-primary" onClick={() => start("auto")}>Record</button>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <section className="panel panel-accent carbon relative p-5">
          <Gauge value={phase === "recording" ? speedVal : null} max={units === "imperial" ? 160 : 260} unit={speedUnit(units)}
            sub={phase === "recording" && <span className="chip">{sp ? SRC[sp.src] : "No speed yet"}</span>} />
          <div className="mt-2 grid grid-cols-3 gap-3 text-center">
            <div><div className="label">Distance</div><div className="num text-xl">{distance(live.dist, units, 2)}<span className="text-xs text-muted"> {distanceUnit(units)}</span></div></div>
            <div><div className="label">Elapsed</div><div className="num text-xl">{duration(elapsed)}</div></div>
            <div><div className="label">Samples</div><div className="num text-xl">{live.n}</div></div>
          </div>
          <div className="mt-4 flex items-center justify-between rounded-lg border border-line px-3 py-2 text-xs">
            <span className="label">GPS accuracy</span>
            <span className={`num ${accTone}`}>{acc != null ? `±${Math.round(acc)} m` : "—"}</span>
            <span className="label">Altitude</span>
            <span className="num">{s?.altitude != null ? `${Math.round(units === "imperial" ? s.altitude * 3.281 : s.altitude)} ${units === "imperial" ? "ft" : "m"}` : "n/a"}</span>
          </div>
          <div className="mt-5">
            {phase === "idle" && <button type="button" className="btn-primary w-full !py-5 !text-lg" onClick={() => start("manual")}><Play size={20} /> Start drive</button>}
            {phase === "starting" && <button type="button" className="btn-primary w-full !py-5" disabled><Loader2 className="animate-spin" /> Acquiring GPS…</button>}
            {phase === "recording" && <button type="button" className="btn w-full !py-5 !text-lg bg-white text-black hover:bg-white/90" onClick={stop}><Square size={18} fill="currentColor" /> Stop drive</button>}
            {phase === "saving" && <button type="button" className="btn-primary w-full !py-5" disabled><Loader2 className="animate-spin" /> Analysing drive…</button>}
          </div>
          {phase === "recording" && <p className="mt-3 text-center text-xs text-muted">Keep this screen open. Browsers pause GPS when the tab is in the background or the phone is locked{"wakeLock" in (typeof navigator !== "undefined" ? navigator : {}) ? " (screen wake lock is on)" : ""}.</p>}
        </section>

        <div className="space-y-5">
          <section className="panel overflow-hidden">
            <RouteMap points={track} accent={accent} follow showEnds={track.length > 0} className="h-60 w-full sm:h-72" />
            <div className="p-3 text-xs text-muted">Live route, visible only to you. Shared routes have the first and last {settings.endpoint_privacy_m} m trimmed.</div>
          </section>

          <section className="panel p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold">Automatic detection</div>
                <div className="text-xs text-muted">Starts watching for sustained speed above {Math.round(units === "imperial" ? settings.auto_min_speed_kph / 1.609 : settings.auto_min_speed_kph)} {speedUnit(units)} for {settings.auto_min_duration_s}s, then {settings.auto_action === "auto" ? "starts recording" : "asks you"}.</div>
              </div>
              <button type="button" role="switch" aria-checked={autoOn} disabled={phase !== "idle"} onClick={() => setAutoOn(!autoOn)}
                className={`relative h-7 w-12 shrink-0 rounded-full transition ${autoOn ? "bg-accent" : "bg-surface-3"}`}>
                <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${autoOn ? "left-6" : "left-1"}`} />
              </button>
            </div>
            {autoOn && phase === "idle" && <div className="mt-2 font-mono text-xs text-accent">{autoStatus || "Starting location watch…"}</div>}
            <p className="mt-2 text-[11px] text-dim">Works while this page is open in the foreground. Web browsers can&apos;t detect trips in the background; that needs a native app wrapper. <Link href="/settings#tracking" className="text-accent">Thresholds</Link></p>
          </section>

          <section className="panel p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold">OBD-II adapter <span className="chip ml-1">optional</span></div>
                <div className="text-xs text-muted">{obd.state === "on" ? `${obd.name} · ${obd.msg}` : "BLE ELM327-compatible adapters via Web Bluetooth (Chrome or Edge on Android or desktop)."}</div>
              </div>
              {obd.state === "on" ? <button type="button" className="btn-ghost" onClick={disconnectObd}><BluetoothOff size={16} /> Disconnect</button>
                : <button type="button" className="btn-ghost" onClick={connectObd} disabled={obd.state === "connecting"}>{obd.state === "connecting" ? <Loader2 size={16} className="animate-spin" /> : <Bluetooth size={16} />} Connect</button>}
            </div>
            {obd.state === "error" && <p className="mt-2 text-xs text-warn">{obd.msg}</p>}
            {obd.state === "on" && (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {PIDS.map((p) => {
                  const supported = obd.pids.includes(p.pid);
                  const val = obd.values[p.key];
                  return (
                    <div key={p.pid} className={`rounded-lg border p-2.5 ${supported ? "border-line" : "border-line/40 opacity-40"}`}>
                      <div className="label truncate">{p.label}</div>
                      <div className="num text-lg">{supported ? (val != null ? val : "…") : "n/a"} <span className="text-[10px] text-muted">{supported ? p.unit : "unsupported"}</span></div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </AccentScope>
  );
}
