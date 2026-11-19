import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { activeDrive, addSamples, db, type LocalSample } from "./db";
import type { ObdValues } from "./obd";

export const LOCATION_TASK = "revmatch-drive-location";

/** Latest OBD reading, merged into GPS samples while it's fresh. Set by the OBD poller. */
let obd: { at: number; v: ObdValues } | null = null;
export function setObdReading(v: ObdValues) { obd = { at: Date.now(), v }; }
export function clearObd() { obd = null; }

type Listener = (s: LocalSample) => void;
const listeners = new Set<Listener>();
export function onSample(l: Listener) { listeners.add(l); return () => { listeners.delete(l); }; }

/**
 * Background task: runs for every batch of locations, including with the screen off.
 * Must be defined at module scope, so this file is imported from the root layout.
 */
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;
  const drive = await activeDrive();
  if (!drive) { await Location.stopLocationUpdatesAsync(LOCATION_TASK).catch(() => {}); return; }
  const fresh = obd && Date.now() - obd.at < 3000 ? obd.v : null;
  const rows: LocalSample[] = data.locations.map((l) => ({
    t: l.timestamp, lat: l.coords.latitude, lng: l.coords.longitude, altitude: l.coords.altitude, altitude_accuracy: l.coords.altitudeAccuracy,
    accuracy: l.coords.accuracy, gps_speed: l.coords.speed != null && l.coords.speed >= 0 ? l.coords.speed : null, // iOS reports -1 when unknown
    heading: l.coords.heading != null && l.coords.heading >= 0 ? l.coords.heading : null, ...(fresh ?? {}),
  }));
  await addSamples(drive.id, rows);
  if (fresh && !drive.has_obd) await db.runAsync("update drives set has_obd = 1 where id = ?", drive.id);
  rows.forEach((r) => listeners.forEach((l) => l(r)));
});

export type StartResult = { ok: true; warning?: string } | { ok: false; reason: string };

/** Ask for location (foreground, then "always" so the screen can be off) and start recording. */
export async function startDrive(vehicleId: string | null, mode: "manual" | "auto" = "manual"): Promise<StartResult> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== "granted") return { ok: false, reason: "RevMatch needs location access to record a drive." };
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (await activeDrive()) return { ok: false, reason: "A drive is already recording." };
  await db.runAsync("insert into drives (vehicle_id, started_at, start_mode) values (?, ?, ?)", vehicleId, Date.now(), mode);
  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: 1000,
    distanceInterval: 0,
    activityType: Location.LocationActivityType.AutomotiveNavigation,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: { notificationTitle: "Recording your drive", notificationBody: "RevMatch is logging your route and speed. Open the app to stop.", notificationColor: "#e10600" },
  });
  if (bg.status !== "granted") return { ok: true, warning: "Location is set to \u201cWhile using the app\u201d, so recording pauses if you lock the phone or switch apps. Change it to \u201cAlways\u201d in Settings to record with the screen off." };
  return { ok: true };
}

/** Stop recording. The drive stays on the phone until sync uploads it. */
export async function stopDrive() {
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  const d = await activeDrive();
  if (d) await db.runAsync("update drives set status = 'stopped', ended_at = ? where id = ?", Date.now(), d.id);
  clearObd();
  return d?.id ?? null;
}

/** After a crash or force-quit, make sure the OS isn't still recording for a drive the app doesn't know about. */
export async function reconcile() {
  const running = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);
  const d = await activeDrive();
  if (running && !d) await Location.stopLocationUpdatesAsync(LOCATION_TASK).catch(() => {});
  return { recording: !!d && running, orphan: !!d && !running ? d.id : null };
}
