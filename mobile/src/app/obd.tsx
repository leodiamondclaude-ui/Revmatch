import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import type { Device } from "react-native-ble-plx";
import { scanAdapters } from "../lib/obd";
import { connectObd, subscribeObd } from "../lib/obdSession";
import { C } from "../lib/theme";

const LIKELY = /obd|elm|vlink|v-link|vgate|icar|obdlink|veepeak|konnwei|carista|kiwi|ios-vlink|android-vlink/i;

export default function ObdPicker() {
  const router = useRouter();
  const [devices, setDevices] = useState<Device[]>([]);
  const [scanning, setScanning] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const stop = scanAdapters((d) => setDevices((list) => [...list, d].sort((a, b) => Number(LIKELY.test(b.name ?? "")) - Number(LIKELY.test(a.name ?? "")))));
    const t = setTimeout(() => setScanning(false), 10000);
    const un = subscribeObd((s) => { if (s.error) setErr(s.error); });
    return () => { stop(); clearTimeout(t); un(); };
  }, []);

  async function pick(d: Device) {
    setBusy(d.id); setErr(null);
    const ok = await connectObd(d.id);
    setBusy(null);
    if (ok) router.back();
  }

  return (
    <View style={s.wrap}>
      <Text style={s.p}>Plug the adapter into the port under the dash, turn the ignition on, then pick it below. Only Bluetooth LE adapters work{Platform.OS === "ios" ? " on iPhone" : ""}.</Text>
      {err && <Text style={s.err}>{err}</Text>}
      <FlatList
        data={devices}
        keyExtractor={(d) => d.id}
        ListEmptyComponent={<Text style={s.muted}>{scanning ? "Looking for adapters…" : "Nothing found. Check the adapter's light is on and it isn't connected to another app."}</Text>}
        renderItem={({ item }) => (
          <Pressable style={s.row} onPress={() => pick(item)} disabled={!!busy}>
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{item.name ?? item.localName}</Text>
              <Text style={s.muted}>{LIKELY.test(item.name ?? "") ? "Looks like an OBD adapter" : "Bluetooth device"}{item.rssi != null ? ` · signal ${item.rssi} dBm` : ""}</Text>
            </View>
            {busy === item.id ? <ActivityIndicator color={C.accent} /> : <Text style={s.connect}>Connect</Text>}
          </Pressable>
        )}
      />
      {scanning && <ActivityIndicator color={C.muted} style={{ marginTop: 8 }} />}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg, padding: 16, gap: 12 },
  p: { color: C.muted, lineHeight: 20 },
  err: { color: C.bad },
  muted: { color: C.dim, fontSize: 13 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, marginBottom: 8 },
  name: { color: C.ink, fontWeight: "700", fontSize: 16 },
  connect: { color: C.accent, fontWeight: "800", textTransform: "uppercase" },
});
