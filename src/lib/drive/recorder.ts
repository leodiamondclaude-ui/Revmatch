"use client";
import type { Sample } from "./analysis";

export interface RecorderLive {
  sample: Sample | null;
  count: number;
  error: string | null;
}

type Listener = (live: RecorderLive) => void;
export type ObdReading = Partial<Pick<Sample, "obdSpeedKph" | "rpm" | "coolantC" | "throttlePct" | "engineLoadPct" | "intakeTempC">>;

/**
 * Records GPS (plus optional OBD-II and DeviceMotion) samples while the page is
 * open. Browsers pause geolocation when the tab is backgrounded or the screen
 * locks, so we hold a Screen Wake Lock where supported.
 */
export class DriveRecorder {
  samples: Sample[] = [];
  private watchId: number | null = null;
  private wakeLock: { release: () => Promise<void> } | null = null;
  private listeners = new Set<Listener>();
  private obd: ObdReading = {};
  private obdAt = 0;
  private motionG: number | null = null;
  private motionHandler = (e: DeviceMotionEvent) => {
    const a = e.acceleration; // excludes gravity, when available
    if (a && a.x != null && a.y != null && a.z != null) {
      this.motionG = Math.sqrt(a.x ** 2 + a.y ** 2 + a.z ** 2) / 9.80665;
    }
  };
  private onVisibility = () => {
    if (document.visibilityState === "visible" && this.watchId != null) void this.acquireWakeLock();
  };
  error: string | null = null;

  constructor(private opts: { minDistanceM: number; useMotion: boolean }) {}

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    const live = { sample: this.samples[this.samples.length - 1] ?? null, count: this.samples.length, error: this.error };
    this.listeners.forEach((l) => l(live));
  }

  setObd(reading: ObdReading) {
    this.obd = { ...this.obd, ...reading };
    this.obdAt = Date.now();
  }

  private async acquireWakeLock() {
    try {
      const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
      if (nav.wakeLock) this.wakeLock = await nav.wakeLock.request("screen");
    } catch {
      /* not fatal */
    }
  }

  async start() {
    if (!("geolocation" in navigator)) throw new Error("This browser has no geolocation support.");
    await this.acquireWakeLock();
    document.addEventListener("visibilitychange", this.onVisibility);
    if (this.opts.useMotion && typeof DeviceMotionEvent !== "undefined") {
      const DM = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> };
      try {
        if (DM.requestPermission) {
          if ((await DM.requestPermission()) === "granted") window.addEventListener("devicemotion", this.motionHandler);
        } else window.addEventListener("devicemotion", this.motionHandler);
      } catch { /* motion is optional */ }
    }
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this.onPosition(pos),
      (err) => {
        this.error = err.code === err.PERMISSION_DENIED ? "Location permission denied." : err.message;
        this.emit();
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
  }

  private onPosition(pos: GeolocationPosition) {
    const c = pos.coords;
    const prev = this.samples[this.samples.length - 1];
    const obdFresh = Date.now() - this.obdAt < 3000;
    const s: Sample = {
      t: pos.timestamp || Date.now(),
      lat: c.latitude,
      lng: c.longitude,
      altitude: c.altitude,
      altitudeAccuracy: c.altitudeAccuracy,
      accuracy: c.accuracy,
      gpsSpeed: c.speed != null && !Number.isNaN(c.speed) ? c.speed : null,
      heading: c.heading != null && !Number.isNaN(c.heading) ? c.heading : null,
      accelG: this.motionG,
      ...(obdFresh ? this.obd : {}),
    };
    if (prev && s.t <= prev.t) return;
    this.error = null;
    this.samples.push(s);
    this.emit();
  }

  /** OBD readings can arrive faster than GPS; record them as position-less samples. */
  pushObdSample() {
    if (this.watchId == null) return;
    const last = this.samples[this.samples.length - 1];
    if (last && Date.now() - last.t < 200) return;
    this.samples.push({ t: Date.now(), lat: null, lng: null, altitude: null, altitudeAccuracy: null, accuracy: null, gpsSpeed: null, heading: null, accelG: this.motionG, ...this.obd });
    this.emit();
  }

  get recording() {
    return this.watchId != null;
  }

  async stop() {
    if (this.watchId != null) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
    window.removeEventListener("devicemotion", this.motionHandler);
    document.removeEventListener("visibilitychange", this.onVisibility);
    try { await this.wakeLock?.release(); } catch { /* ignore */ }
    this.wakeLock = null;
    return this.samples;
  }
}

export function toRow(s: Sample, driveId: string, ownerId: string) {
  const speedSrc = s.obdSpeedKph != null ? "obd" : s.gpsSpeed != null ? "gps_doppler" : null;
  return {
    drive_id: driveId,
    owner_id: ownerId,
    t: new Date(s.t).toISOString(),
    lat: s.lat, lng: s.lng,
    altitude: s.altitude, altitude_accuracy: s.altitudeAccuracy, accuracy: s.accuracy,
    speed_mps: s.obdSpeedKph != null ? s.obdSpeedKph / 3.6 : s.gpsSpeed,
    speed_source: speedSrc,
    heading: s.heading,
    rpm: s.rpm ?? null, coolant_c: s.coolantC ?? null, throttle_pct: s.throttlePct ?? null,
    engine_load_pct: s.engineLoadPct ?? null, intake_temp_c: s.intakeTempC ?? null,
    obd_speed_kph: s.obdSpeedKph ?? null,
    accel_g: s.accelG != null ? +s.accelG.toFixed(3) : null,
  };
}

export function fromRow(r: Record<string, number | string | null>): Sample {
  const n = (k: string) => (r[k] == null ? null : Number(r[k]));
  return {
    t: new Date(r.t as string).getTime(),
    lat: n("lat"), lng: n("lng"), altitude: n("altitude"), altitudeAccuracy: n("altitude_accuracy"),
    accuracy: n("accuracy"),
    gpsSpeed: r.speed_source === "gps_doppler" ? n("speed_mps") : null,
    heading: n("heading"), rpm: n("rpm"), coolantC: n("coolant_c"), throttlePct: n("throttle_pct"),
    engineLoadPct: n("engine_load_pct"), intakeTempC: n("intake_temp_c"), obdSpeedKph: n("obd_speed_kph"), accelG: n("accel_g"),
  };
}

/**
 * Trip detector for automatic mode. Watches location at the page level and
 * reports when sustained speed exceeds the threshold for long enough.
 */
export class TripDetector {
  private watchId: number | null = null;
  private aboveSince: number | null = null;
  constructor(private opts: { minSpeedKph: number; minDurationS: number; onTrip: () => void; onStatus?: (kph: number | null) => void }) {}
  start() {
    if (!("geolocation" in navigator) || this.watchId != null) return;
    this.watchId = navigator.geolocation.watchPosition(
      (p) => {
        const kph = p.coords.speed != null && !Number.isNaN(p.coords.speed) ? p.coords.speed * 3.6 : null;
        this.opts.onStatus?.(kph);
        if (kph != null && kph >= this.opts.minSpeedKph && (p.coords.accuracy ?? 99) < 50) {
          this.aboveSince ??= Date.now();
          if (Date.now() - this.aboveSince >= this.opts.minDurationS * 1000) {
            this.aboveSince = null;
            this.opts.onTrip();
          }
        } else this.aboveSince = null;
      },
      () => this.opts.onStatus?.(null),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 },
    );
  }
  stop() {
    if (this.watchId != null) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
  }
}
