"use client";
/* eslint-disable @next/next/no-img-element */
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Search, Sparkles, Trash2 } from "lucide-react";
import { useSupabase } from "@/lib/supabase/client";
import { accentFromPaint } from "@/lib/color";
import type { BodyStyle, ModelConfig, Vehicle } from "@/lib/types";
import { AccentScope } from "@/components/ui/AccentScope";
import { IntegrationNotice } from "@/components/ui/IntegrationNotice";
import { VehicleFields, type VehicleDraft } from "@/components/garage/VehicleFields";
import { ModelConfigurator } from "@/components/garage/ModelConfigurator";

const VehicleViewer = dynamic(() => import("@/components/three/VehicleViewer"), { ssr: false });

interface LibResult { uid: string; name: string; author: string; license: string; thumbnail: string | null }

export function EditVehicle({ vehicle: v, isPrimary, angleCount, integrations }: { vehicle: Vehicle; isPrimary: boolean; angleCount: number; integrations: Record<string, boolean> }) {
  const router = useRouter();
  const [draft, setDraft] = useState<VehicleDraft>({
    nickname: v.nickname, year: v.year, make: v.make, model: v.model, trim: v.trim, engine: v.engine, horsepower: v.horsepower, torque: v.torque,
    transmission: v.transmission, drivetrain: v.drivetrain, exterior_color: v.exterior_color, exterior_color_hex: v.exterior_color_hex,
    interior_color: v.interior_color, mileage: v.mileage, mileage_unit: v.mileage_unit, description: v.description, visibility: v.visibility,
    show_stats_public: v.show_stats_public,
  });
  const [config, setConfig] = useState<ModelConfig>(v.model_config ?? {});
  const [bodyStyle, setBodyStyle] = useState<BodyStyle>(v.body_style);
  const [tab, setTab] = useState<"details" | "3d">("details");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [q, setQ] = useState([v.year, v.make, v.model].filter(Boolean).join(" "));
  const [lib, setLib] = useState<LibResult[] | null>(null);
  const accent = accentFromPaint(config.paint ?? draft.exterior_color_hex);
  const supabase = useSupabase();

  async function save() {
    setBusy("Saving…"); setMsg(null);
    const { error } = await supabase.from("vehicles").update({ ...draft, model_config: config, body_style: bodyStyle, exterior_color_hex: config.paint ?? draft.exterior_color_hex }).eq("id", v.id);
    setBusy(null);
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: "Saved." });
    router.refresh();
  }
  async function post(url: string, body: object, label: string) {
    setBusy(label); setMsg(null);
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    setBusy(null);
    setMsg(r.ok ? { ok: true, text: label.replace("…", "") + " started. Check the vehicle page." } : { ok: false, text: j.error });
    if (r.ok) router.push(`/v/${v.slug}`);
  }
  async function search() {
    setBusy("Searching…");
    const r = await fetch(`/api/models/search?q=${encodeURIComponent(q)}`);
    const j = await r.json();
    setBusy(null);
    if (r.ok) setLib(j.results); else setMsg({ ok: false, text: j.error });
  }
  async function revert() {
    await supabase.from("vehicles").update({ model_url: null, model_source: "procedural", model_status: "ready", model_attribution: null, model_approved: true }).eq("id", v.id);
    router.refresh();
    setMsg({ ok: true, text: "Switched to the parametric model." });
  }
  async function makePrimary() {
    await supabase.from("profiles").update({ primary_vehicle_id: v.id }).eq("id", v.owner_id);
    router.refresh();
    setMsg({ ok: true, text: "This is now your primary vehicle. Your interface accent follows its paint." });
  }
  async function remove() {
    if (prompt(`Type "${v.model}" to permanently delete this vehicle, its mods, photos and history.`) !== v.model) return;
    setBusy("Deleting…");
    const { data: files } = await supabase.from("vehicle_photos").select("storage_path").eq("vehicle_id", v.id);
    if (files?.length) await supabase.storage.from("vehicle-photos").remove(files.map((f) => f.storage_path));
    const { error } = await supabase.from("vehicles").delete().eq("id", v.id);
    if (error) { setBusy(null); setMsg({ ok: false, text: error.message }); return; }
    router.push("/garage");
    router.refresh();
  }

  return (
    <AccentScope accent={accent}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div><div className="label text-accent">Edit</div><h1 className="h-display text-3xl">{draft.year} {draft.make} {draft.model}</h1></div>
        <div className="flex gap-2">
          <button type="button" className="btn-quiet" onClick={() => router.push(`/v/${v.slug}`)}>View</button>
          <button type="button" className="btn-primary" onClick={save} disabled={!!busy}>{busy ? <Loader2 size={16} className="animate-spin" /> : null} Save changes</button>
        </div>
      </div>
      {msg && <div className={`mb-4 rounded-lg border px-3 py-2 text-sm ${msg.ok ? "border-ok/40 text-ok" : "border-bad/40 text-bad"}`}>{msg.text}</div>}
      <nav className="mb-5 flex gap-1 border-b border-line">
        <button type="button" className="tab" data-on={tab === "details"} onClick={() => setTab("details")}>Details</button>
        <button type="button" className="tab" data-on={tab === "3d"} onClick={() => setTab("3d")}>3D model</button>
      </nav>
      {tab === "details" ? (
        <div className="space-y-5">
          <div className="panel p-5"><VehicleFields draft={draft} onChange={(d) => { setDraft(d); if (d.exterior_color_hex !== draft.exterior_color_hex) setConfig({ ...config, paint: d.exterior_color_hex ?? config.paint }); }} /></div>
          <div className="panel flex flex-wrap items-center justify-between gap-3 p-5">
            <div><div className="font-semibold">Primary vehicle</div><div className="text-sm text-muted">Your dashboard and the interface accent follow your primary car.</div></div>
            {isPrimary ? <span className="chip-accent">Primary</span> : <button type="button" className="btn-ghost" onClick={makePrimary}>Make primary</button>}
          </div>
          <div className="panel flex flex-wrap items-center justify-between gap-3 border-bad/30 p-5">
            <div><div className="font-semibold text-bad">Delete vehicle</div><div className="text-sm text-muted">Removes the vehicle, mods, photos and history. Drives stay, but are no longer linked to a vehicle.</div></div>
            <button type="button" className="btn-ghost !border-bad/50 !text-bad" onClick={remove}><Trash2 size={16} /> Delete</button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
            <div className="panel overflow-hidden">
              <VehicleViewer bodyStyle={bodyStyle} config={config} accent={accent} modelUrl={v.model_url} showPins={false} className="relative h-[380px] w-full" />
              <div className="border-t border-line p-3 text-xs text-muted">Current source: <b className="text-ink">{v.model_source}</b>{v.model_attribution && <> · {v.model_attribution}</>}</div>
            </div>
            <div className="panel max-h-[520px] overflow-y-auto p-5">
              <div className="label mb-3">{v.model_url ? "Overlay & fallback settings" : "Model configuration"}</div>
              <ModelConfigurator bodyStyle={bodyStyle} config={config} onBodyStyle={setBodyStyle} onChange={setConfig} />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="panel p-5">
              <div className="font-semibold">Built-in model</div>
              <p className="mt-1 text-sm text-muted">Realistic studio car or parametric model, fully editable, with every part clickable.</p>
              <button type="button" className="btn-ghost mt-3" onClick={revert} disabled={!v.model_url}>Use built-in model</button>
            </div>
            <div className="panel p-5">
              <div className="font-semibold">Library model (Sketchfab)</div>
              {!(integrations.sketchfab && integrations.serviceRole) ? <div className="mt-2"><IntegrationNotice name="Model library" envVar="SKETCHFAB_API_TOKEN + SUPABASE_SERVICE_ROLE_KEY" /></div> : (
                <>
                  <div className="mt-3 flex gap-2"><input className="input" value={q} onChange={(e) => setQ(e.target.value)} /><button type="button" className="btn-ghost" onClick={search}><Search size={16} /></button></div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {lib?.map((m) => (
                      <button key={m.uid} type="button" className="overflow-hidden rounded-lg border border-line text-left hover:border-accent" onClick={() => post("/api/models/import", { vehicleId: v.id, uid: m.uid }, "Importing model…")}>
                        {m.thumbnail && <img src={m.thumbnail} alt="" className="aspect-video w-full object-cover" />}
                        <div className="p-1.5 text-[11px]"><div className="truncate font-semibold">{m.name}</div><div className="truncate text-muted">{m.license}</div></div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="panel p-5">
              <div className="font-semibold">AI generation (Meshy)</div>
              <p className="mt-1 text-sm text-muted">Builds an approximate textured mesh from your front ¾, side and rear ¾ photos ({angleCount}/3 uploaded).</p>
              {!(integrations.meshy && integrations.serviceRole) ? <div className="mt-2"><IntegrationNotice name="AI 3D generation" envVar="MESHY_API_KEY + SUPABASE_SERVICE_ROLE_KEY" /></div> : (
                <button type="button" className="btn-ghost mt-3" disabled={angleCount < 3 || !!busy} onClick={() => post("/api/models/generate", { vehicleId: v.id }, "Generation…")}><Sparkles size={16} /> Generate</button>
              )}
            </div>
          </div>
        </div>
      )}
    </AccentScope>
  );
}
