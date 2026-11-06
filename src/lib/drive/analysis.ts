import type { AccelRun, DriveSegment } from "../types";

/** One raw sample captured during a drive. `t` is epoch milliseconds. */
export interface Sample {
  t: number;
  lat: number | null;
  lng: number | null;
  altitude: number | null;
  altitudeAccuracy: number | null;
  accuracy: number | null;
  /** Speed reported by the GPS chipset (Doppler), m/s. Null when the device doesn't report it. */
  gpsSpeed: number | null;
  heading: number | null;
  // OBD-II (null when not connected or PID unsupported)
  obdSpeedKph?: number | null;
  rpm?: number | null;
  coolantC?: number | null;
  throttlePct?: number | null;
  engineLoadPct?: number | null;
  intakeTempC?: number | null;
  /** Longitudinal-ish acceleration magnitude from DeviceMotion, in g. */
  accelG?: number | null;
}

export interface AnalysisOptions {
  maxAccuracyM: number;
  endpointPrivacyM: number;
}

export const ACCEL_TARGETS: { from_kph: number; to_kph: number; label: string }[] = [
  { from_kph: 0, to_kph: 96.5606, label: "0–60 mph" },
  { from_kph: 0, to_kph: 100, label: "0–100 km/h" },
  { from_kph: 48.2803, to_kph: 112.654, label: "30–70 mph" },
  { from_kph: 100, to_kph: 200, label: "100–200 km/h" },
];

const R = 6371008.8;
export function haversine(aLat: number, aLng: number, bLat: number, bLng: number) {
  const toRad = Math.PI / 180;
  const dLat = (bLat - aLat) * toRad;
  const dLng = (bLng - aLng) * toRad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * toRad) * Math.cos(bLat * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

const hasFix = (s: Sample) => s.lat != null && s.lng != null;

/** Best available speed for a sample: OBD > GPS Doppler > null. */
export function sampleSpeed(s: Sample): { mps: number; src: "obd" | "gps_doppler" } | null {
  if (s.obdSpeedKph != null) return { mps: s.obdSpeedKph / 3.6, src: "obd" };
  if (s.gpsSpeed != null && s.gpsSpeed >= 0) return { mps: s.gpsSpeed, src: "gps_doppler" };
  return null;
}

function median3(a: number, b: number, c: number) {
  return Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));
}

export interface SpeedPoint {
  t: number; // ms
  mps: number;
  src: "obd" | "gps_doppler" | "gps_derived";
}

/**
 * Build a cleaned speed timeline. Uses OBD/Doppler speed where present and
 * position-derived speed otherwise, then applies a 3-point median filter to
 * remove single-sample GPS spikes.
 */
export function speedTimeline(samples: Sample[], maxAccuracyM: number): SpeedPoint[] {
  const out: SpeedPoint[] = [];
  let prev: Sample | null = null;
  for (const s of samples) {
    const direct = sampleSpeed(s);
    if (direct) {
      if (direct.src === "obd" || s.accuracy == null || s.accuracy <= maxAccuracyM) out.push({ t: s.t, ...direct });
    } else if (hasFix(s) && (s.accuracy ?? 0) <= maxAccuracyM) {
      if (prev && hasFix(prev)) {
        const dt = (s.t - prev.t) / 1000;
        if (dt >= 0.5) {
          const v = haversine(prev.lat!, prev.lng!, s.lat!, s.lng!) / dt;
          if (v < 110) out.push({ t: s.t, mps: v, src: "gps_derived" });
        }
      }
      prev = s;
    }
  }
  if (out.length < 3) return out;
  return out.map((p, i) => {
    if (i === 0 || i === out.length - 1) return p;
    return { ...p, mps: median3(out[i - 1].mps, p.mps, out[i + 1].mps) };
  });
}

function interpCross(a: SpeedPoint, b: SpeedPoint, targetMps: number) {
  if (b.mps === a.mps) return b.t;
  return a.t + ((targetMps - a.mps) / (b.mps - a.mps)) * (b.t - a.t);
}

/**
 * Find acceleration runs. A run is only reported when the speed source is
 * direct (OBD or GPS Doppler), sampling is dense enough (every gap <= 1.5 s),
 * and speed rises without a significant dip. Position-derived speed is never
 * used for timing because it is too coarse.
 */
export function findAccelRuns(timeline: SpeedPoint[]): AccelRun[] {
  const pts = timeline.filter((p) => p.src !== "gps_derived");
  const best = new Map<string, AccelRun>();
  for (const target of ACCEL_TARGETS) {
    const fromMps = target.from_kph / 3.6;
    const toMps = target.to_kph / 3.6;
    for (let i = 0; i < pts.length - 1; i++) {
      // start condition: at/below from speed, next sample above it
      // For standing starts, the run begins at the last at-rest sample before launch.
      const restMps = 0.9;
      const startOk = target.from_kph === 0
        ? pts[i].mps <= restMps && pts[i + 1].mps > restMps
        : pts[i].mps <= fromMps && pts[i + 1].mps > fromMps;
      if (!startOk) continue;
      let peak = pts[i].mps;
      let ok = true;
      const tStart = target.from_kph === 0 ? pts[i].t : interpCross(pts[i], pts[i + 1], fromMps);
      for (let j = i + 1; j < pts.length; j++) {
        const gap = (pts[j].t - pts[j - 1].t) / 1000;
        if (gap > 1.5 || pts[j].src !== pts[i].src) { ok = false; break; }
        if (pts[j].mps < peak - 1.5) { ok = false; break; }
        peak = Math.max(peak, pts[j].mps);
        if (pts[j].mps >= toMps) {
          const tEnd = interpCross(pts[j - 1], pts[j], toMps);
          const seconds = (tEnd - tStart) / 1000;
          const n = j - i + 1;
          const hz = n / Math.max(0.001, (pts[j].t - pts[i].t) / 1000);
          if (ok && seconds > 1.2 && seconds < 60) {
            const key = `${target.from_kph}-${target.to_kph}`;
            const run: AccelRun = {
              from_kph: target.from_kph,
              to_kph: target.to_kph,
              seconds: Math.round(seconds * 100) / 100,
              source: pts[i].src as "obd" | "gps_doppler",
              sample_hz: Math.round(hz * 10) / 10,
              reliability: hz >= 4.5 ? "good" : "estimate",
            };
            const prev = best.get(key);
            if (!prev || run.seconds < prev.seconds) best.set(key, run);
          }
          break;
        }
      }
    }
  }
  return [...best.values()];
}

export function classifySegments(timeline: SpeedPoint[], windowS = 30): DriveSegment[] {
  if (timeline.length < 2) return [];
  const t0 = timeline[0].t;
  const segs: DriveSegment[] = [];
  let wStart = 0;
  while (wStart < timeline.length - 1) {
    let wEnd = wStart;
    while (wEnd < timeline.length - 1 && (timeline[wEnd].t - timeline[wStart].t) / 1000 < windowS) wEnd++;
    let dist = 0, max = 0;
    for (let k = wStart + 1; k <= wEnd; k++) {
      const dt = (timeline[k].t - timeline[k - 1].t) / 1000;
      dist += ((timeline[k].mps + timeline[k - 1].mps) / 2) * dt;
      max = Math.max(max, timeline[k].mps);
    }
    const dur = (timeline[wEnd].t - timeline[wStart].t) / 1000 || 1;
    const avg = dist / dur;
    const kph = avg * 3.6;
    const kind: DriveSegment["kind"] = kph < 5 ? "stopped" : kph < 50 ? "city" : kph < 85 ? "arterial" : "highway";
    const start_s = (timeline[wStart].t - t0) / 1000;
    const end_s = (timeline[wEnd].t - t0) / 1000;
    const last = segs[segs.length - 1];
    if (last && last.kind === kind) {
      const totalDur = last.end_s - last.start_s + dur;
      last.avg_speed_mps = (last.distance_m + dist) / totalDur;
      last.distance_m += dist;
      last.end_s = end_s;
      last.max_speed_mps = Math.max(last.max_speed_mps, max);
    } else {
      segs.push({ kind, basis: "inferred_from_speed", start_s, end_s, distance_m: dist, avg_speed_mps: avg, max_speed_mps: max });
    }
    wStart = wEnd === wStart ? wEnd + 1 : wEnd;
  }
  return segs.map((s) => ({ ...s, distance_m: Math.round(s.distance_m), avg_speed_mps: +s.avg_speed_mps.toFixed(2), max_speed_mps: +s.max_speed_mps.toFixed(2) }));
}

function downsample<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const step = arr.length / max;
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(arr[Math.floor(i * step)]);
  out.push(arr[arr.length - 1]);
  return out;
}

/** Route with the first/last `privacyM` metres removed so homes/workplaces aren't revealed. */
export function privateRoute(points: [number, number][], privacyM: number): [number, number][] {
  if (points.length < 2) return [];
  const [sLat, sLng] = points[0];
  const [eLat, eLng] = points[points.length - 1];
  const kept = points.filter(([la, ln]) => haversine(sLat, sLng, la, ln) > privacyM && haversine(eLat, eLng, la, ln) > privacyM);
  return downsample(kept, 500).map(([a, b]) => [+a.toFixed(5), +b.toFixed(5)]);
}

function stat(values: number[]) {
  if (!values.length) return null;
  let min = Infinity, max = -Infinity, sum = 0;
  for (const v of values) { min = Math.min(min, v); max = Math.max(max, v); sum += v; }
  return { min: +min.toFixed(1), max: +max.toFixed(1), avg: +(sum / values.length).toFixed(1) };
}

export function analyzeDrive(samples: Sample[], opts: AnalysisOptions) {
  const sorted = [...samples].sort((a, b) => a.t - b.t);
  const fixes = sorted.filter((s) => hasFix(s) && (s.accuracy ?? 0) <= opts.maxAccuracyM);

  // Distance: sum of segment lengths between good fixes, ignoring jitter while
  // stationary (step smaller than the combined accuracy) and impossible jumps.
  let distance = 0;
  let last: Sample | null = null;
  const routePts: [number, number][] = [];
  for (const s of fixes) {
    if (!last) { last = s; routePts.push([s.lat!, s.lng!]); continue; }
    const d = haversine(last.lat!, last.lng!, s.lat!, s.lng!);
    const dt = (s.t - last.t) / 1000;
    const noise = Math.min(25, ((last.accuracy ?? 5) + (s.accuracy ?? 5)) / 2);
    if (dt > 0 && d / dt > 110) continue; // >396 km/h: GPS jump
    const sp = sampleSpeed(s);
    if (d < noise && (!sp || sp.mps < 1)) continue; // stationary jitter
    distance += d;
    last = s;
    routePts.push([s.lat!, s.lng!]);
  }

  const startT = sorted[0]?.t ?? Date.now();
  const endT = sorted[sorted.length - 1]?.t ?? startT;
  const duration = Math.max(0, (endT - startT) / 1000);

  const timeline = speedTimeline(sorted, opts.maxAccuracyM);
  let moving = 0;
  for (let i = 1; i < timeline.length; i++) {
    const dt = (timeline[i].t - timeline[i - 1].t) / 1000;
    if (timeline[i].mps > 1 && dt < 30) moving += dt;
  }
  // Max speed: require the value to be held by two consecutive filtered points
  // so a lone spike can't become a "record".
  let maxSpeed = 0;
  for (let i = 1; i < timeline.length; i++) maxSpeed = Math.max(maxSpeed, Math.min(timeline[i].mps, timeline[i - 1].mps));

  // Elevation with 3 m hysteresis to suppress GPS altitude noise.
  const alts = fixes.filter((s) => s.altitude != null).map((s) => s.altitude!);
  let gain = 0, loss = 0;
  if (alts.length > 5) {
    let ref = alts[0];
    for (const a of alts) {
      if (a - ref >= 3) { gain += a - ref; ref = a; }
      else if (ref - a >= 3) { loss += ref - a; ref = a; }
    }
  }

  const accs = fixes.map((s) => s.accuracy).filter((v): v is number => v != null);
  const avgAcc = accs.length ? accs.reduce((a, b) => a + b, 0) / accs.length : null;
  const hz = sorted.length > 1 && duration > 0 ? (sorted.length - 1) / duration : 0;
  const directShare = timeline.length ? timeline.filter((p) => p.src !== "gps_derived").length / timeline.length : 0;
  const hasObd = sorted.some((s) => s.obdSpeedKph != null || s.rpm != null);

  let confidence: "low" | "medium" | "high" = "low";
  if (avgAcc != null && avgAcc <= 10 && hz >= 0.8 && directShare >= 0.8) confidence = "high";
  else if ((avgAcc != null && avgAcc <= 25 && hz >= 0.3) || hasObd) confidence = "medium";

  const runs = findAccelRuns(timeline);

  // Peak longitudinal acceleration from direct speed over >= 1 s windows
  let peakG: { value: number; source: "gps_doppler" | "obd" | "device_motion"; note: string } | null = null;
  const direct = timeline.filter((p) => p.src !== "gps_derived");
  for (let i = 1; i < direct.length; i++) {
    const dt = (direct[i].t - direct[i - 1].t) / 1000;
    if (dt < 0.9 || dt > 2.5 || direct[i].src !== direct[i - 1].src) continue;
    const g = (direct[i].mps - direct[i - 1].mps) / dt / 9.80665;
    if (g > 0 && g < 1.6 && (!peakG || g > peakG.value)) {
      peakG = { value: +g.toFixed(2), source: direct[i].src as "gps_doppler" | "obd", note: "Speed change over ≥1 s windows; smooths out short peaks." };
    }
  }
  const motion = sorted.map((s) => s.accelG).filter((v): v is number => v != null);
  if (!peakG && motion.length > 20) {
    const sortedG = [...motion].sort((a, b) => a - b);
    peakG = { value: +sortedG[Math.floor(sortedG.length * 0.99)].toFixed(2), source: "device_motion", note: "Phone accelerometer, 99th percentile; phone orientation and mounting are unknown, so treat as approximate." };
  }

  const obdFields: [keyof Sample, string, string][] = [
    ["rpm", "rpm", "rpm"], ["coolantC", "coolant_c", "°C"], ["throttlePct", "throttle_pct", "%"],
    ["engineLoadPct", "engine_load_pct", "%"], ["intakeTempC", "intake_temp_c", "°C"], ["obdSpeedKph", "obd_speed_kph", "km/h"],
  ];
  let obd: Record<string, { min: number; max: number; avg: number; unit: string }> | null = null;
  for (const [key, name, unit] of obdFields) {
    const vals = sorted.map((s) => s[key] as number | null | undefined).filter((v): v is number => v != null);
    const st = stat(vals);
    if (st) { obd ??= {}; obd[name] = { ...st, unit }; }
  }

  const speedSeries: [number, number, string][] = downsample(timeline, 600).map((p) => [
    Math.round((p.t - startT) / 100) / 10, +p.mps.toFixed(2), p.src,
  ]);

  return {
    started_at: new Date(startT).toISOString(),
    ended_at: new Date(endT).toISOString(),
    duration_s: Math.round(duration),
    moving_s: Math.round(moving),
    distance_m: Math.round(distance),
    avg_speed_mps: duration > 0 ? +(distance / duration).toFixed(2) : 0,
    avg_moving_speed_mps: moving > 0 ? +(distance / moving).toFixed(2) : 0,
    max_speed_mps: +maxSpeed.toFixed(2),
    elevation_gain_m: alts.length > 5 ? Math.round(gain) : null,
    elevation_loss_m: alts.length > 5 ? Math.round(loss) : null,
    min_altitude_m: alts.length ? Math.round(Math.min(...alts)) : null,
    max_altitude_m: alts.length ? Math.round(Math.max(...alts)) : null,
    avg_accuracy_m: avgAcc != null ? +avgAcc.toFixed(1) : null,
    sample_count: sorted.length,
    sample_rate_hz: +hz.toFixed(2),
    source: (hasObd ? "gps+obd" : "gps") as "gps" | "gps+obd",
    confidence,
    acceleration: { runs, peak_long_g: peakG },
    obd_summary: obd,
    segments: classifySegments(timeline),
    speed_series: speedSeries,
    route_preview: privateRoute(routePts, opts.endpointPrivacyM),
    full_route: routePts,
  };
}

export type DriveAnalysis = ReturnType<typeof analyzeDrive>;
