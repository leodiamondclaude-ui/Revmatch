"use client";
import type { Vehicle } from "@/lib/types";

export type VehicleDraft = Pick<Vehicle,
  "nickname" | "year" | "make" | "model" | "trim" | "engine" | "horsepower" | "torque" | "transmission" | "drivetrain" |
  "exterior_color" | "exterior_color_hex" | "interior_color" | "mileage" | "mileage_unit" | "description" | "visibility" | "show_stats_public">;

export const EMPTY_DRAFT: VehicleDraft = {
  nickname: null, year: null, make: "", model: "", trim: null, engine: null, horsepower: null, torque: null, transmission: null,
  drivetrain: null, exterior_color: null, exterior_color_hex: "#9aa0a6", interior_color: null, mileage: null, mileage_unit: "mi",
  description: null, visibility: "public", show_stats_public: true,
};

function Field({ ai, label, children }: { ai: boolean; label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="label flex items-center gap-2">{label}{ai && <span className="text-[9px] text-accent">AI · verify</span>}</span>
      {children}
    </label>
  );
}

export function VehicleFields({ draft, onChange, aiFlags }: { draft: VehicleDraft; onChange: (d: VehicleDraft) => void; aiFlags?: Set<string> }) {
  const set = <K extends keyof VehicleDraft>(k: K, v: VehicleDraft[K]) => onChange({ ...draft, [k]: v });
  const txt = (k: keyof VehicleDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k, (e.target.value || null) as never);
  const num = (k: keyof VehicleDraft) => (e: React.ChangeEvent<HTMLInputElement>) => set(k, (e.target.value === "" ? null : Number(e.target.value)) as never);
  return (
    <div className="grid gap-4 sm:grid-cols-6">
      <div className="sm:col-span-1"><Field ai={!!aiFlags?.has("year")} label="Year"><input className="input" inputMode="numeric" value={draft.year ?? ""} onChange={num("year")} /></Field></div>
      <div className="sm:col-span-2"><Field ai={!!aiFlags?.has("make")} label="Manufacturer *"><input className="input" required value={draft.make} onChange={(e) => set("make", e.target.value)} /></Field></div>
      <div className="sm:col-span-2"><Field ai={!!aiFlags?.has("model")} label="Model *"><input className="input" required value={draft.model} onChange={(e) => set("model", e.target.value)} /></Field></div>
      <div className="sm:col-span-1"><Field ai={!!aiFlags?.has("trim")} label="Trim"><input className="input" value={draft.trim ?? ""} onChange={txt("trim")} /></Field></div>
      <div className="sm:col-span-3"><Field ai={!!aiFlags?.has("nickname")} label="Nickname"><input className="input" placeholder="Optional" value={draft.nickname ?? ""} onChange={txt("nickname")} /></Field></div>
      <div className="sm:col-span-3"><Field ai={!!aiFlags?.has("engine")} label="Engine"><input className="input" placeholder="e.g. 3.0L twin-turbo I6" value={draft.engine ?? ""} onChange={txt("engine")} /></Field></div>
      <div className="sm:col-span-2"><Field ai={!!aiFlags?.has("horsepower")} label="Horsepower"><input className="input" inputMode="numeric" placeholder="If known" value={draft.horsepower ?? ""} onChange={num("horsepower")} /></Field></div>
      <div className="sm:col-span-2"><Field ai={!!aiFlags?.has("torque")} label="Torque (lb-ft)"><input className="input" inputMode="numeric" value={draft.torque ?? ""} onChange={num("torque")} /></Field></div>
      <div className="sm:col-span-2"><Field ai={!!aiFlags?.has("transmission")} label="Transmission">
        <input className="input" list="tx" value={draft.transmission ?? ""} onChange={txt("transmission")} />
        <datalist id="tx"><option>6-speed manual</option><option>7-speed DCT</option><option>8-speed automatic</option><option>CVT</option><option>Sequential</option></datalist>
      </Field></div>
      <div className="sm:col-span-2"><Field ai={!!aiFlags?.has("drivetrain")} label="Drivetrain">
        <select className="input" value={draft.drivetrain ?? ""} onChange={(e) => set("drivetrain", e.target.value || null)}>
          <option value="">—</option><option>RWD</option><option>FWD</option><option>AWD</option><option>4WD</option>
        </select>
      </Field></div>
      <div className="sm:col-span-2"><Field ai={!!aiFlags?.has("exterior_color")} label="Exterior colour">
        <div className="flex gap-2">
          <input type="color" className="h-10 w-12 shrink-0 cursor-pointer rounded border border-line bg-transparent" value={draft.exterior_color_hex ?? "#9aa0a6"} onChange={(e) => set("exterior_color_hex", e.target.value)} />
          <input className="input" placeholder="Name" value={draft.exterior_color ?? ""} onChange={txt("exterior_color")} />
        </div>
      </Field></div>
      <div className="sm:col-span-2"><Field ai={!!aiFlags?.has("interior_color")} label="Interior colour"><input className="input" value={draft.interior_color ?? ""} onChange={txt("interior_color")} /></Field></div>
      <div className="sm:col-span-2"><Field ai={!!aiFlags?.has("mileage")} label="Mileage">
        <div className="flex gap-2">
          <input className="input" inputMode="numeric" value={draft.mileage ?? ""} onChange={num("mileage")} />
          <select className="input !w-20" value={draft.mileage_unit} onChange={(e) => set("mileage_unit", e.target.value as "mi" | "km")}><option value="mi">mi</option><option value="km">km</option></select>
        </div>
      </Field></div>
      <div className="sm:col-span-6"><Field ai={!!aiFlags?.has("description")} label="Story"><textarea className="input min-h-24" placeholder="How you found it, what's planned…" value={draft.description ?? ""} onChange={txt("description")} /></Field></div>
      <div className="sm:col-span-3"><Field ai={!!aiFlags?.has("visibility")} label="Who can see this vehicle">
        <select className="input" value={draft.visibility} onChange={(e) => set("visibility", e.target.value as VehicleDraft["visibility"])}>
          <option value="public">Public: anyone, including QR scans</option>
          <option value="friends">Friends only</option>
          <option value="private">Only me</option>
        </select>
      </Field></div>
      <label className="flex items-center gap-3 self-end rounded-lg border border-line p-3 sm:col-span-3">
        <input type="checkbox" checked={draft.show_stats_public} onChange={(e) => set("show_stats_public", e.target.checked)} className="accent-[var(--accent)]" />
        <span className="text-sm">Show lifetime driving totals on the vehicle page (totals only, never routes)</span>
      </label>
    </div>
  );
}
