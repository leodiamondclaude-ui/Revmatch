import { Elm327, type ObdValues } from "./obd";
import { clearObd, setObdReading } from "./recorder";

/** One adapter connection shared by the drive screen and the adapter picker. Polls about twice a second. */
type State = { status: "off" | "connecting" | "on"; name?: string; values?: ObdValues; error?: string };
let state: State = { status: "off" };
let elm: Elm327 | null = null;
let looping = false;
const subs = new Set<(s: State) => void>();
const set = (p: Partial<State>) => { state = { ...state, ...p }; subs.forEach((f) => f(state)); };

export const obdState = () => state;
export function subscribeObd(f: (s: State) => void) { subs.add(f); f(state); return () => { subs.delete(f); }; }

export async function connectObd(deviceId: string) {
  await disconnectObd();
  set({ status: "connecting", error: undefined, values: undefined });
  const e = new Elm327();
  try {
    await e.connect(deviceId);
  } catch (err) {
    set({ status: "off", error: (err as Error).message });
    return false;
  }
  elm = e;
  e.onDisconnect = () => { elm = null; looping = false; clearObd(); set({ status: "off", error: "The adapter disconnected." }); };
  set({ status: "on", name: e.name });
  looping = true;
  void (async () => {
    while (looping && elm === e) {
      try {
        const v = await e.poll();
        if (Object.keys(v).length) { setObdReading(v); set({ values: v }); }
      } catch { /* a missed poll is fine; the next one retries */ }
      await new Promise((r) => setTimeout(r, 400));
    }
  })();
  return true;
}

export async function disconnectObd() {
  looping = false;
  const e = elm; elm = null;
  clearObd();
  if (e) await e.disconnect();
  set({ status: "off", name: undefined, values: undefined });
}
