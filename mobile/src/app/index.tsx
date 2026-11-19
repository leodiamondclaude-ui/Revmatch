import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AppState, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { supabase } from "../lib/supabase";
import { db, activeDrive, type LocalDrive, type LocalSample } from "../lib/db";
import { onSample, reconcile, startDrive, stopDrive } from "../lib/recorder";
import { syncDrives } from "../lib/sync";
import { disconnectObd, subscribeObd } from "../lib/obdSession";
import type { ObdValues } from "../lib/obd";
import { haversine } from "../lib/geo";
import { SITE_URL } from "../lib/config";
import { C } from "../lib/theme";

type Vehicle = { id: string; year: number | null; make: string; model: string; nickname: string | null };
type Live = { started: number; dist: number; speed: number | null; maxSpeed: number; fixes: number; last: LocalSample | null; accuracy: number | null };
const fresh = (started: number): Live => ({ started, dist: 0, speed: null, maxSpeed: 0, fixes: 0, last: null, accuracy: null });

function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return `${h ? `${h}:` : ""}${String(m).padStart(h ? 2 : 1, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export default function DriveScreen() {
  const router = useRouter();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [metric, setMetric] = useState(false);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<Live>(fresh(Date.now()));
  const [now, setNow] = useState(Date.now());
  const [notice, setNotice] = useState<{ text: string; tone: "ok" | "warn" | "bad" } | null>(null);
  const [pending, setPending] = useState<LocalDrive[]>([]);
  const [obd, setObd] = useState<{ status: string; name?: string; values?: ObdValues }>({ status: "off" });
  const syncing = useRef(false);

  const unit = metric ? { speed: (mps: number) => mps * 3.6, s: "km/h", dist: (m: number) => m / 1000, d: "km" } : { speed: (mps: number) => mps * 2.23694, s: "mph", dist: (m: number) => m / 1609.344, d: "mi" };

  const refreshPending = useCallback(async () => {
    setPending(await db.getAllAsync<LocalDrive>("select * from drives where status in ('stopped') order by id desc"));
  }, []);

  const sync = useCallback(async (quiet = false) => {
    if (syncing.current) return;
    syncing.current = true;
    const r = await syncDrives().finally(() => { syncing.current = false; });
    await refreshPending();
    if (r.failed) setNotice({ text: `Couldn't upload ${r.failed === 1 ? "a drive" : `${r.failed} drives`}: ${r.lastError}. They're saved on this phone; we'll retry.`, tone: "warn" });
    else if (r.uploaded && !quiet) setNotice({ text: "Drive uploaded. Open it on the website for the full report.", tone: "ok" });
    return r;
  }, [refreshPending]);

  // Load the garage and settings; pick up a drive that was recording before the app was closed.
  useEffect(() => {
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [{ data: vs }, { data: st }, { data: prof }] = await Promise.all([
        supabase.from("vehicles").select("id, year, make, model, nickname").eq("owner_id", user.id).order("created_at"),
        supabase.from("user_settings").select("units").eq("user_id", user.id).maybeSingle(),
        supabase.from("profiles").select("primary_vehicle_id").eq("id", user.id).maybeSingle(),
      ]);
      setVehicles((vs ?? []) as Vehicle[]);
      setVehicleId(prof?.primary_vehicle_id ?? vs?.[0]?.id ?? null);
      setMetric(st?.units === "metric");
      const r = await reconcile();
      if (r.recording) { const d = await activeDrive(); setLive(fresh(d?.started_at ?? Date.now())); setRecording(true); }
      if (r.orphan) {
        await db.runAsync("update drives set status = 'stopped', ended_at = ? where id = ?", Date.now(), r.orphan);
        setNotice({ text: "The last drive stopped when the app was closed. What was recorded is saved and will upload now.", tone: "warn" });
      }
      await refreshPending();
      void sync(true);
    })();
  }, [refreshPending, sync]);

  // Retry uploads whenever the app comes back to the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => { if (s === "active" && !recording) void sync(true); });
    return () => sub.remove();
  }, [recording, sync]);

  useEffect(() => subscribeObd(setObd), []);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (!recording) return;
    void activateKeepAwakeAsync("drive");
    return () => { void deactivateKeepAwake("drive"); };
  }, [recording]);

  useEffect(() => onSample((smp) => setLive((L) => {
    let dist = L.dist;
    const good = smp.accuracy != null && smp.accuracy <= 35;
    if (good && L.last?.lat != null && smp.lat != null) {
      const d = haversine(L.last.lat, L.last.lng!, smp.lat, smp.lng!);
      if (d > Math.min(25, (smp.accuracy ?? 5) / 2) && d < 500) dist += d;
    }
    const sp = smp.obd_speed_kph != null ? smp.obd_speed_kph / 3.6 : smp.gps_speed;
    return { ...L, dist, speed: sp, maxSpeed: good && sp != null ? Math.max(L.maxSpeed, sp) : L.maxSpeed, fixes: L.fixes + 1, last: good ? smp : L.last ?? smp, accuracy: smp.accuracy };
  })), []);

  async function start() {
    setBusy(true); setNotice(null);
    const r = await startDrive(vehicleId).catch((e: Error) => ({ ok: false as const, reason: e.message }));
    setBusy(false);
    if (!r.ok) { setNotice({ text: r.reason, tone: "bad" }); if (/location access/.test(r.reason)) Alert.alert("Location is off", r.reason, [{ text: "Cancel" }, { text: "Open Settings", onPress: () => Linking.openSettings() }]); return; }
    if (r.warning) setNotice({ text: r.warning, tone: "warn" });
    setLive(fresh(Date.now()));
    setRecording(true);
  }

  async function stop() {
    setBusy(true);
    await stopDrive();
    setRecording(false);
    const r = await sync();
    setBusy(false);
    if (r?.lastDriveId && SITE_URL) setNotice({ text: "Drive uploaded. Tap to see the report.", tone: "ok" });
  }

  const v = vehicles.find((x) => x.id === vehicleId);
  const gpsLabel = live.accuracy == null ? "Waiting for GPS" : live.accuracy <= 10 ? "GPS strong" : live.accuracy <= 35 ? "GPS ok" : "GPS weak";

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={s.wrap}>
      {!recording && (
        <View style={s.card}>
          <Text style={s.label}>Car</Text>
          {vehicles.length === 0 ? <Text style={s.muted}>No cars in your garage yet. Add one on the website; drives can still be recorded without one.</Text> : (
            <View style={s.chips}>
              {vehicles.map((x) => (
                <Pressable key={x.id} onPress={() => setVehicleId(x.id)} style={[s.chip, x.id === vehicleId && s.chipOn]}>
                  <Text style={[s.chipText, x.id === vehicleId && { color: C.ink }]}>{x.nickname || `${x.year ?? ""} ${x.make} ${x.model}`.trim()}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      )}

      <View style={[s.card, s.hero, recording && { borderColor: C.accent }]}>
        <Text style={s.label}>{recording ? `Recording${v ? ` · ${v.nickname || v.model}` : ""}` : "Ready"}</Text>
        <Text style={s.speed}>{live.speed != null && recording ? Math.round(unit.speed(live.speed)) : "--"}</Text>
        <Text style={s.unit}>{unit.s}</Text>
        <View style={s.stats}>
          <Stat k="Time" v={recording ? clock(now - live.started) : "0:00"} />
          <Stat k="Distance" v={`${unit.dist(live.dist).toFixed(1)} ${unit.d}`} />
          <Stat k="Top" v={`${Math.round(unit.speed(live.maxSpeed))} ${unit.s}`} />
        </View>
        {recording && <Text style={[s.muted, { textAlign: "center" }]}>{gpsLabel} · {live.fixes} points · screen can be off</Text>}
        <Pressable style={[s.big, recording && { backgroundColor: C.surface2, borderColor: C.accent, borderWidth: 2 }, busy && { opacity: 0.5 }]} disabled={busy} onPress={recording ? stop : start}>
          <Text style={[s.bigText, recording && { color: C.ink }]}>{busy ? "…" : recording ? "End drive" : "Start drive"}</Text>
        </Pressable>
      </View>

      {notice && (
        <Pressable onPress={() => notice.tone === "ok" && SITE_URL && Linking.openURL(`${SITE_URL}/drives`)} style={[s.notice, { borderColor: notice.tone === "ok" ? C.ok : notice.tone === "warn" ? C.warn : C.bad }]}>
          <Text style={{ color: C.ink, lineHeight: 20 }}>{notice.text}</Text>
        </Pressable>
      )}

      <View style={s.card}>
        <View style={s.rowBetween}>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>OBD-II</Text>
            <Text style={s.body}>{obd.status === "on" ? `Connected · ${obd.name}` : obd.status === "connecting" ? "Connecting…" : "Optional: adds RPM, coolant and throttle"}</Text>
          </View>
          {obd.status === "on"
            ? <Pressable onPress={() => disconnectObd()}><Text style={s.action}>Disconnect</Text></Pressable>
            : <Pressable onPress={() => router.push("/obd")}><Text style={s.action}>Connect</Text></Pressable>}
        </View>
        {obd.status === "on" && obd.values && (
          <View style={s.stats}>
            {obd.values.rpm != null && <Stat k="RPM" v={String(Math.round(obd.values.rpm))} />}
            {obd.values.coolant_c != null && <Stat k="Coolant" v={metric ? `${obd.values.coolant_c}°C` : `${Math.round(obd.values.coolant_c * 9 / 5 + 32)}°F`} />}
            {obd.values.throttle_pct != null && <Stat k="Throttle" v={`${Math.round(obd.values.throttle_pct)}%`} />}
          </View>
        )}
      </View>

      {pending.length > 0 && (
        <View style={s.card}>
          <View style={s.rowBetween}>
            <Text style={s.label}>Waiting to upload · {pending.length}</Text>
            <Pressable onPress={() => sync()}><Text style={s.action}>Retry now</Text></Pressable>
          </View>
          {pending.map((d) => (
            <View key={d.id} style={{ paddingVertical: 6 }}>
              <Text style={s.body}>{new Date(d.started_at).toLocaleString()}</Text>
              {d.error && <Text style={[s.muted, { color: C.warn }]}>{d.error}</Text>}
            </View>
          ))}
        </View>
      )}

      <Text style={[s.muted, { textAlign: "center", marginTop: 8 }]}>Never interact with the app while driving. Start before you set off and end it once you&apos;re parked.</Text>
      <Pressable onPress={async () => { if (recording) { Alert.alert("End the drive first"); return; } await disconnectObd(); await supabase.auth.signOut(); }}>
        <Text style={[s.muted, { textAlign: "center", padding: 12 }]}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return <View style={{ alignItems: "center", flex: 1 }}><Text style={s.label}>{k}</Text><Text style={s.stat}>{v}</Text></View>;
}

const s = StyleSheet.create({
  wrap: { padding: 16, gap: 12, paddingBottom: 40 },
  card: { backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 16, gap: 10 },
  hero: { alignItems: "stretch" },
  label: { color: C.muted, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", fontWeight: "700" },
  muted: { color: C.dim, fontSize: 13 },
  body: { color: C.ink, fontSize: 15 },
  speed: { color: C.ink, fontSize: 96, fontWeight: "900", textAlign: "center", fontVariant: ["tabular-nums"], fontStyle: "italic" },
  unit: { color: C.muted, textAlign: "center", marginTop: -10, letterSpacing: 3, textTransform: "uppercase" },
  stats: { flexDirection: "row", marginTop: 8 },
  stat: { color: C.ink, fontSize: 18, fontWeight: "800", fontVariant: ["tabular-nums"], marginTop: 2 },
  big: { backgroundColor: C.accent, borderRadius: 999, paddingVertical: 20, alignItems: "center", marginTop: 8 },
  bigText: { color: "#000", fontSize: 18, fontWeight: "900", textTransform: "uppercase", letterSpacing: 2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  chipOn: { borderColor: C.accent, backgroundColor: "rgba(225,6,0,0.12)" },
  chipText: { color: C.muted, fontWeight: "600" },
  notice: { borderWidth: 1, borderRadius: 12, padding: 12, backgroundColor: C.surface },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  action: { color: C.accent, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1 },
});
