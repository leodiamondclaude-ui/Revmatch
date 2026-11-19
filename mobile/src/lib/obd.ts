import { Buffer } from "buffer";
import { BleManager, type Characteristic, type Device, type Subscription } from "react-native-ble-plx";

/**
 * ELM327-compatible OBD-II adapter over Bluetooth Low Energy (react-native-ble-plx).
 * Works on iPhone and Android, unlike the website (no Web Bluetooth on iOS).
 * Supported: BLE serial-style adapters (Vgate iCar Pro BLE, OBDLink CX, Veepeak BLE, most "BLE 4.0" clones).
 * Not supported: Bluetooth Classic adapters on iPhone (Apple blocks them), and Wi-Fi adapters.
 */

export type ObdValues = { rpm?: number; obd_speed_kph?: number; coolant_c?: number; throttle_pct?: number; engine_load_pct?: number; intake_temp_c?: number };
type Pid = { pid: string; key: keyof ObdValues; decode: (b: number[]) => number };

const PIDS: Pid[] = [
  { pid: "0C", key: "rpm", decode: ([a, b]) => (256 * a + b) / 4 },
  { pid: "0D", key: "obd_speed_kph", decode: ([a]) => a },
  { pid: "11", key: "throttle_pct", decode: ([a]) => (100 * a) / 255 },
  { pid: "04", key: "engine_load_pct", decode: ([a]) => (100 * a) / 255 },
  { pid: "05", key: "coolant_c", decode: ([a]) => a - 40 },
  { pid: "0F", key: "intake_temp_c", decode: ([a]) => a - 40 },
];

const hexBytes = (s: string) => (s.match(/[0-9A-F]{2}/gi) ?? []).map((h) => parseInt(h, 16));

export function parseSupported(base: number, hex: string) {
  const out = new Set<string>();
  const bytes = hexBytes(hex);
  for (let i = 0; i < 4 && i < bytes.length; i++) for (let bit = 0; bit < 8; bit++) if (bytes[i] & (0x80 >> bit)) out.add((base + i * 8 + bit + 1).toString(16).toUpperCase().padStart(2, "0"));
  return out;
}

export function parseResponse(pid: string, raw: string): number[] | null {
  const clean = raw.replace(/\s|>/g, "").toUpperCase();
  if (/NODATA|ERROR|UNABLE|STOPPED|\?/.test(clean)) return null;
  const marker = "41" + pid.toUpperCase();
  const i = clean.indexOf(marker);
  return i < 0 ? null : hexBytes(clean.slice(i + marker.length));
}

let manager: BleManager | null = null;
const ble = () => (manager ??= new BleManager());

/** Scan for nearby adapters for up to `ms`. Reports each named device once. */
export function scanAdapters(onFound: (d: Device) => void, ms = 10000): () => void {
  const seen = new Set<string>();
  ble().startDeviceScan(null, null, (err, d) => {
    if (err || !d || seen.has(d.id)) return;
    if (!(d.name ?? d.localName)) return; // unnamed beacons are never OBD adapters
    seen.add(d.id);
    onFound(d);
  });
  const t = setTimeout(() => ble().stopDeviceScan(), ms);
  return () => { clearTimeout(t); ble().stopDeviceScan(); };
}

export class Elm327 {
  private device: Device | null = null;
  private tx: Characteristic | null = null;
  private sub: Subscription | null = null;
  private buffer = "";
  private pending: ((s: string) => void) | null = null;
  supported = new Set<string>();
  name = "";
  onDisconnect?: () => void;

  async connect(deviceId: string) {
    ble().stopDeviceScan();
    const d = await ble().connectToDevice(deviceId, { timeout: 15000 });
    this.device = await d.discoverAllServicesAndCharacteristics();
    this.name = d.name ?? d.localName ?? "OBD-II adapter";
    d.onDisconnected(() => this.onDisconnect?.());
    let rx: Characteristic | null = null;
    for (const svc of await this.device.services()) {
      for (const ch of await svc.characteristics()) {
        if (!rx && (ch.isNotifiable || ch.isIndicatable)) rx = ch;
        if (!this.tx && (ch.isWritableWithResponse || ch.isWritableWithoutResponse)) this.tx = ch;
      }
      if (rx && this.tx) break;
    }
    if (!rx || !this.tx) { await this.disconnect(); throw new Error("That device doesn't look like a BLE OBD-II adapter."); }
    this.sub = rx.monitor((err, ch) => {
      if (err || !ch?.value) return;
      this.buffer += Buffer.from(ch.value, "base64").toString("latin1");
      if (this.buffer.includes(">")) { const out = this.buffer; this.buffer = ""; this.pending?.(out); this.pending = null; }
    });
    for (const cmd of ["ATZ", "ATE0", "ATL0", "ATS0", "ATH0", "ATAT1", "ATSP0"]) await this.send(cmd, cmd === "ATZ" ? 3000 : 1500);
    const bitmap = await this.send("0100", 8000);
    const at = bitmap.toUpperCase().replace(/\s/g, "").indexOf("4100");
    if (at < 0) { await this.disconnect(); throw new Error("The adapter connected but the car didn't answer. Is the ignition on?"); }
    this.supported = parseSupported(0, bitmap.replace(/\s/g, "").slice(at + 4));
  }

  get pids() { return PIDS.filter((p) => this.supported.has(p.pid)); }

  send(cmd: string, timeoutMs = 1500): Promise<string> {
    return new Promise((resolve, reject) => {
      const tx = this.tx;
      if (!tx) return reject(new Error("Not connected"));
      const timer = setTimeout(() => { this.pending = null; resolve(""); }, timeoutMs);
      this.pending = (s) => { clearTimeout(timer); resolve(s); };
      const data = Buffer.from(cmd + "\r", "latin1").toString("base64");
      (tx.isWritableWithoutResponse ? tx.writeWithoutResponse(data) : tx.writeWithResponse(data))
        .catch((e: Error) => { clearTimeout(timer); this.pending = null; reject(e); });
    });
  }

  /** Read each supported PID once. PIDs the car doesn't report are left out, never guessed. */
  async poll(): Promise<ObdValues> {
    const out: ObdValues = {};
    for (const p of this.pids) {
      const bytes = parseResponse(p.pid, await this.send("01" + p.pid, 1000));
      if (bytes?.length) out[p.key] = Math.round(p.decode(bytes) * 10) / 10;
    }
    return out;
  }

  async disconnect() {
    this.sub?.remove(); this.sub = null; this.tx = null;
    if (this.device) await this.device.cancelConnection().catch(() => {});
    this.device = null;
  }
}
