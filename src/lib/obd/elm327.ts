"use client";
/**
 * ELM327-compatible OBD-II adapter over Bluetooth Low Energy (Web Bluetooth).
 *
 * Supported: BLE adapters exposing a serial-style GATT service (Vgate iCar Pro BLE,
 * OBDLink CX, Veepeak BLE, most "BLE 4.0" ELM327 clones).
 * Not supported in browsers: Bluetooth Classic (SPP) adapters, Wi-Fi adapters,
 * and any adapter on iOS Safari (Web Bluetooth is unavailable there).
 */

// Minimal Web Bluetooth typings (not part of lib.dom).
interface BTCharacteristic {
  uuid: string;
  properties: { write: boolean; writeWithoutResponse: boolean; notify: boolean };
  writeValue(v: BufferSource): Promise<void>;
  writeValueWithoutResponse?(v: BufferSource): Promise<void>;
  startNotifications(): Promise<BTCharacteristic>;
  addEventListener(t: "characteristicvaluechanged", cb: (e: Event) => void): void;
  value?: DataView;
}
interface BTService { uuid: string; getCharacteristics(): Promise<BTCharacteristic[]> }
interface BTServer { connected: boolean; getPrimaryServices(): Promise<BTService[]>; disconnect(): void }
interface BTDevice { name?: string; gatt?: { connect(): Promise<BTServer> }; addEventListener(t: "gattserverdisconnected", cb: () => void): void }
interface BT { requestDevice(o: unknown): Promise<BTDevice> }

const SERVICES = [
  0xfff0, 0xffe0, 0x18f0,
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2", // Vgate / OBDLink-style
  "0000fff0-0000-1000-8000-00805f9b34fb",
];

export function obdSupported(): { ok: boolean; reason?: string } {
  if (typeof navigator === "undefined") return { ok: false, reason: "Not in a browser." };
  if (!("bluetooth" in navigator)) {
    return { ok: false, reason: "Web Bluetooth is not available in this browser. Use Chrome or Edge on Android, Windows, macOS or ChromeOS. iOS browsers do not support it." };
  }
  if (!window.isSecureContext) return { ok: false, reason: "Web Bluetooth needs HTTPS." };
  return { ok: true };
}

export interface PidDef {
  pid: string; // mode 01 PID hex, e.g. "0C"
  key: "rpm" | "obdSpeedKph" | "coolantC" | "throttlePct" | "engineLoadPct" | "intakeTempC" | "mapKpa" | "mafGs" | "timingAdv" | "fuelLevelPct";
  label: string;
  unit: string;
  decode: (b: number[]) => number;
}

export const PIDS: PidDef[] = [
  { pid: "0C", key: "rpm", label: "Engine RPM", unit: "rpm", decode: ([a, b]) => (256 * a + b) / 4 },
  { pid: "0D", key: "obdSpeedKph", label: "Vehicle speed", unit: "km/h", decode: ([a]) => a },
  { pid: "11", key: "throttlePct", label: "Throttle position", unit: "%", decode: ([a]) => (100 * a) / 255 },
  { pid: "04", key: "engineLoadPct", label: "Engine load", unit: "%", decode: ([a]) => (100 * a) / 255 },
  { pid: "05", key: "coolantC", label: "Coolant temp", unit: "°C", decode: ([a]) => a - 40 },
  { pid: "0F", key: "intakeTempC", label: "Intake air temp", unit: "°C", decode: ([a]) => a - 40 },
  { pid: "0B", key: "mapKpa", label: "Intake manifold pressure", unit: "kPa", decode: ([a]) => a },
  { pid: "10", key: "mafGs", label: "Mass air flow", unit: "g/s", decode: ([a, b]) => (256 * a + b) / 100 },
  { pid: "0E", key: "timingAdv", label: "Timing advance", unit: "°", decode: ([a]) => a / 2 - 64 },
  { pid: "2F", key: "fuelLevelPct", label: "Fuel level", unit: "%", decode: ([a]) => (100 * a) / 255 },
];

/** Parse a "41 00 BE 3F A8 13" style supported-PID bitmap response. */
export function parseSupported(base: number, hex: string): Set<string> {
  const out = new Set<string>();
  const bytes = hexBytes(hex);
  for (let i = 0; i < 4 && i < bytes.length; i++) {
    for (let bit = 0; bit < 8; bit++) {
      if (bytes[i] & (0x80 >> bit)) out.add((base + i * 8 + bit + 1).toString(16).toUpperCase().padStart(2, "0"));
    }
  }
  return out;
}

function hexBytes(s: string) {
  return (s.match(/[0-9A-F]{2}/gi) ?? []).map((h) => parseInt(h, 16));
}

/** Extract data bytes for a mode-01 response to `pid`, tolerating echo/headers/multi-ECU replies. */
export function parseResponse(pid: string, raw: string): number[] | null {
  const clean = raw.replace(/\s|>/g, "").toUpperCase();
  if (/NODATA|ERROR|UNABLE|STOPPED|\?/.test(clean)) return null;
  const marker = "41" + pid.toUpperCase();
  const idx = clean.indexOf(marker);
  if (idx < 0) return null;
  return hexBytes(clean.slice(idx + marker.length));
}

export type ObdValues = Partial<Record<PidDef["key"], number>>;

export class Elm327 {
  private device: BTDevice | null = null;
  private server: BTServer | null = null;
  private tx: BTCharacteristic | null = null;
  private buffer = "";
  private pending: ((s: string) => void) | null = null;
  supported = new Set<string>();
  protocol = "";
  deviceName = "";
  onDisconnect?: () => void;

  async connect() {
    const bt = (navigator as unknown as { bluetooth: BT }).bluetooth;
    this.device = await bt.requestDevice({ acceptAllDevices: true, optionalServices: SERVICES });
    this.deviceName = this.device.name ?? "OBD-II adapter";
    this.device.addEventListener("gattserverdisconnected", () => this.onDisconnect?.());
    this.server = await this.device.gatt!.connect();
    const services = await this.server.getPrimaryServices();
    let rx: BTCharacteristic | null = null;
    for (const svc of services) {
      for (const ch of await svc.getCharacteristics()) {
        if (!rx && ch.properties.notify) rx = ch;
        if (!this.tx && (ch.properties.write || ch.properties.writeWithoutResponse)) this.tx = ch;
      }
      if (rx && this.tx) break;
    }
    if (!rx || !this.tx) throw new Error("Adapter has no serial-style characteristics. It may be a Bluetooth Classic adapter, which browsers can't use.");
    await rx.startNotifications();
    rx.addEventListener("characteristicvaluechanged", (e) => {
      const v = (e.target as unknown as BTCharacteristic).value!;
      this.buffer += new TextDecoder().decode(v.buffer as ArrayBuffer);
      if (this.buffer.includes(">")) {
        const out = this.buffer;
        this.buffer = "";
        this.pending?.(out);
        this.pending = null;
      }
    });

    for (const cmd of ["ATZ", "ATE0", "ATL0", "ATS0", "ATH0", "ATAT1", "ATSP0"]) await this.send(cmd, cmd === "ATZ" ? 3000 : 1500);
    // First real request triggers protocol search; allow extra time.
    const bitmap = await this.send("0100", 8000);
    if (!/41\s?00/i.test(bitmap)) throw new Error("Adapter connected but the vehicle ECU didn't answer. Is the ignition on?");
    this.supported = parseSupported(0, bitmap.slice(bitmap.toUpperCase().indexOf("4100") + 4));
    if (this.supported.has("20")) {
      const r = await this.send("0120", 2000);
      const i = r.toUpperCase().replace(/\s/g, "").indexOf("4120");
      if (i >= 0) parseSupported(0x20, r.replace(/\s/g, "").slice(i + 4)).forEach((p) => this.supported.add(p));
    }
    this.protocol = (await this.send("ATDPN", 1500)).replace(/[>\r\n]/g, "").trim();
  }

  get availablePids() {
    return PIDS.filter((p) => this.supported.has(p.pid));
  }

  send(cmd: string, timeoutMs = 1500): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.tx) return reject(new Error("Not connected"));
      const timer = setTimeout(() => { this.pending = null; resolve(""); }, timeoutMs);
      this.pending = (s) => { clearTimeout(timer); resolve(s); };
      const data = new TextEncoder().encode(cmd + "\r");
      const p = this.tx.properties.writeWithoutResponse && this.tx.writeValueWithoutResponse
        ? this.tx.writeValueWithoutResponse(data)
        : this.tx.writeValue(data);
      p.catch((e) => { clearTimeout(timer); this.pending = null; reject(e); });
    });
  }

  /** Read every supported PID once. Unsupported PIDs are never reported. */
  async poll(pids: PidDef[] = this.availablePids): Promise<ObdValues> {
    const out: ObdValues = {};
    for (const p of pids) {
      const raw = await this.send("01" + p.pid, 1000);
      const bytes = parseResponse(p.pid, raw);
      if (bytes && bytes.length) out[p.key] = Math.round(p.decode(bytes) * 10) / 10;
    }
    return out;
  }

  disconnect() {
    try { this.server?.disconnect(); } catch { /* ignore */ }
    this.tx = null;
  }
}
