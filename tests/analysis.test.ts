import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeDrive, findAccelRuns, haversine, privateRoute, speedTimeline, type Sample } from "../src/lib/drive/analysis";
import { parseResponse, parseSupported } from "../src/lib/obd/elm327";
import { accentFromPaint } from "../src/lib/color";

const OPTS = { maxAccuracyM: 35, endpointPrivacyM: 400 };
const base = { altitude: 100, altitudeAccuracy: 5, heading: 90 };
const M_PER_DEG_LNG = 111320; // at the equator

/** Straight eastward drive along the equator with a given speed profile (m/s per sample). */
function synth(speeds: number[], hz: number, opts: { doppler: boolean; obd?: boolean; accuracy?: number } = { doppler: true }): Sample[] {
  let x = 0;
  return speeds.map((v, i) => {
    if (i > 0) x += ((speeds[i - 1] + v) / 2) / hz;
    return {
      ...base, t: 1_700_000_000_000 + (i * 1000) / hz, lat: 0, lng: x / M_PER_DEG_LNG, accuracy: opts.accuracy ?? 4,
      gpsSpeed: opts.doppler ? v : null, obdSpeedKph: opts.obd ? v * 3.6 : null,
    };
  });
}

/** Constant acceleration from 0 to `top` m/s at `a` m/s², then cruise. */
function launch(a: number, top: number, hz: number, cruiseS = 20, idleS = 3) {
  const out: number[] = [];
  for (let i = 0; i < idleS * hz; i++) out.push(0);
  for (let t = 0; ; t += 1 / hz) { const v = a * t; if (v >= top) break; out.push(v); }
  for (let i = 0; i < cruiseS * hz; i++) out.push(top);
  return out;
}

test("haversine ~ 111 km per degree", () => {
  assert.ok(Math.abs(haversine(0, 0, 0, 1) - 111195) < 50);
});

test("distance, duration and max speed for a steady drive", () => {
  const s = synth(new Array(601).fill(20), 1); // 20 m/s for 600 s = 12 km
  const r = analyzeDrive(s, OPTS);
  assert.ok(Math.abs(r.distance_m - 12000) < 60, `distance ${r.distance_m}`);
  assert.equal(r.duration_s, 600);
  assert.ok(Math.abs(r.max_speed_mps - 20) < 0.01);
  assert.equal(r.confidence, "high");
  assert.ok(r.segments.some((x) => x.kind === "arterial"), "72 km/h should classify as arterial");
});

test("0-60 from 1 Hz Doppler is reported as an estimate, close to truth", () => {
  const a = 26.8224 / 5; // true 0-60 = 5.0 s
  const runs = findAccelRuns(speedTimeline(synth(launch(a, 35, 1), 1), 35));
  const r060 = runs.find((r) => r.from_kph === 0 && Math.round(r.to_kph) === 97);
  assert.ok(r060, "expected a 0-60 run");
  assert.equal(r060!.reliability, "estimate");
  assert.ok(Math.abs(r060!.seconds - 5) <= 1.0, `got ${r060!.seconds}`);
});

test("0-60 from 10 Hz OBD is 'good' and accurate", () => {
  const a = 26.8224 / 4.2;
  const runs = findAccelRuns(speedTimeline(synth(launch(a, 35, 10), 10, { doppler: false, obd: true }), 35));
  const r060 = runs.find((r) => r.from_kph === 0 && Math.round(r.to_kph) === 97)!;
  assert.equal(r060.source, "obd");
  assert.equal(r060.reliability, "good");
  assert.ok(Math.abs(r060.seconds - 4.2) < 0.15, `got ${r060.seconds}`);
});

test("no acceleration runs from position-only GPS", () => {
  const r = analyzeDrive(synth(launch(6, 35, 1), 1, { doppler: false }), OPTS);
  assert.equal(r.acceleration.runs.length, 0);
});

test("a lift mid-run invalidates the run", () => {
  const sp = launch(5, 35, 1);
  const i = sp.findIndex((v) => v > 15);
  // Driver lifts for 3 s (a single-sample dip would be indistinguishable from GPS noise).
  sp.splice(i + 1, 0, sp[i] - 3, sp[i] - 6, sp[i] - 8);
  const runs = findAccelRuns(speedTimeline(synth(sp, 1), 35)).filter((r) => r.from_kph === 0);
  assert.equal(runs.length, 0);
});

test("a single-sample GPS spike does not become max speed", () => {
  const sp = new Array(120).fill(15);
  sp[60] = 80;
  const r = analyzeDrive(synth(sp, 1), OPTS);
  assert.ok(r.max_speed_mps < 16, `max ${r.max_speed_mps}`);
});

test("poor-accuracy fixes are excluded and lower confidence", () => {
  const r = analyzeDrive(synth(new Array(100).fill(10), 1, { doppler: true, accuracy: 80 }), OPTS);
  assert.equal(r.distance_m, 0);
  assert.equal(r.confidence, "low");
});

test("shared route trims the endpoints", () => {
  const pts: [number, number][] = Array.from({ length: 200 }, (_, i) => [0, (i * 20) / M_PER_DEG_LNG]); // 4 km line
  const trimmed = privateRoute(pts, 400);
  const start = pts[0], end = pts[pts.length - 1];
  for (const p of trimmed) {
    assert.ok(haversine(start[0], start[1], p[0], p[1]) > 400);
    assert.ok(haversine(end[0], end[1], p[0], p[1]) > 400);
  }
  assert.ok(trimmed.length > 100);
});

test("OBD supported-PID bitmap and response parsing", () => {
  const sup = parseSupported(0, "BE 3F A8 13");
  for (const pid of ["01", "04", "05", "0C", "0D", "0F", "11"]) assert.ok(sup.has(pid), pid);
  assert.ok(!sup.has("02"));
  assert.deepEqual(parseResponse("0C", "41 0C 1A F8\r\r>"), [0x1a, 0xf8]);
  assert.equal(parseResponse("0C", "NO DATA\r>"), null);
  assert.deepEqual(parseResponse("0D", "SEARCHING...\r410D3C\r>"), [0x3c]);
});

test("accent derivation keeps hue and stays legible", () => {
  assert.equal(accentFromPaint("#0c0c0e"), "#8fb3d9"); // black car -> titanium blue
  const blue = accentFromPaint("#1f4fa3");
  assert.notEqual(blue, "#1f4fa3");
  assert.match(blue, /^#[0-9a-f]{6}$/);
});
