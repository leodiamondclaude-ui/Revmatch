"use client";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Sparkles, Trash2 } from "lucide-react";
import { useSupabase } from "@/lib/supabase/client";
import { accentFromPaint } from "@/lib/color";
import { splitPrivacy, type BuildSheet } from "@/lib/build";
import type { BodyStyle, ModelConfig, Vehicle } from "@/lib/types";
import { AccentScope } from "@/components/ui/AccentScope";
import { IntegrationNotice } from "@/components/ui/IntegrationNotice";
import { VehicleFields, type VehicleDraft } from "@/components/garage/VehicleFields";
import { ModelConfigurator } from "@/components/garage/ModelConfigurator";
import { BuildRecords, BuildSections, PrivacyCosts, type PrivateDetails } from "@/components/vehicle/BuildEditor";

const VehicleViewer = dynamic(() => import("@/components/three/VehicleViewer"), { ssr: false });
type Tab = "details" | "build" | "records" | "privacy" | "3d";
interface PrivRow extends PrivateDetails { hidden: Record<string, unknown> | null }

export function EditVehicle({ vehicle: v, priv: privRow, isPrimary, integrations }: { vehicle: Vehicle; priv: PrivRow | null; isPrimary: boolean; integrations: Record<string, boolean> }) {
  const router = useRouter();
  const hidden = privRow?.hidden ?? {};
  const [draft, setDraft] = useState<VehicleDraft>({
    nickname: v.nickname, year: v.year, make: v.make, model: v.model, trim: v.trim, engine: v.engine, horsepower: v.horsepower,
    transmission: v.transmission, drivetrain: v.drivetrain, exterior_color: v.exterior_color, exterior_color_hex: v.exterior_color_hex,
    interior_color: v.interior_color, mileage: v.mileage ?? (typeof hidden.mileage === "number" ? hidden.mileage : null), mileage_unit: v.mileage_unit,
    description: v.description, visibility: v.visibility, show_stats_public: v.show_stats_public,
  });
  // Hidden values come back into the editor so the owner can still see and change them.
  const [build, setBuild] = useState<BuildSheet>(() => {
    const b = structuredClone(v.build ?? {});
    if (typeof hidden.location === "string") b.profile = { ...b.profile, location: hidden.location };
    return b;
  });
  const [priv, setPriv] = useState<PrivateDetails>({ vin: privRow?.vin ?? null, plate: privRow?.plate ?? null, purchase_price: privRow?.purchase_price ?? null, budget: privRow?.budget ?? null, notes: privRow?.notes ?? null });
  const [config, setConfig] = useState<ModelConfig>(v.model_config ?? {});
  const [bodyStyle, setBodyStyle] = useState<BodyStyle>(v.body_style);
  const [tab, setTab] = useState<Tab>("details");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const accent = accentFromPaint(config.paint ?? draft.exterior_color_hex);
  const supabase = useSupabase();

  async function save() {
    setBusy("Saving…"); setMsg(null);
    const { publicSheet, hidden: hiddenNow } = splitPrivacy({ ...build, price: priv.purchase_price });
    const hideMiles = !!build.privacy?.hideMileage;
    if (hideMiles && draft.mileage != null) hiddenNow.mileage = draft.mileage;
    const { error } = await supabase.from("vehicles").update({
      ...draft, mileage: hideMiles ? null : draft.mileage, model_config: config, body_style: bodyStyle,
      exterior_color_hex: config.paint ?? draft.exterior_color_hex, build: publicSheet,
    }).eq("id", v.id);
    const { error: pErr } = error ? { error: null } : await supabase.from("vehicle_private").upsert({ vehicle_id: v.id, owner_id: v.owner_id, ...priv, hidden: hiddenNow, updated_at: new Date().toISOString() });
    setBusy(null);
    setMsg(error || pErr ? { ok: false, text: (error ?? pErr)!.message } : { ok: true, text: "Saved." });
    router.refresh();
  }
  async function findModel() {
    setBusy("Finding a real model…"); setMsg(null);
    const r = await fetch("/api/models/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vehicleId: v.id }) });
    const j = await r.json();
    setBusy(null);
    setMsg(r.ok ? { ok: true, text: j.library && !j.started ? "Ready: this car was already in the RevMatch model library. Review it on your car page." : "Started. You'll review the model on your car page before anyone else sees it." } : { ok: false, text: j.error });
    if (r.ok) router.push(`/v/${v.slug}`);
  }
  async function revert() {
    await supabase.from("vehicles").update({ model_url: null, model_assembly: null, model_source: "procedural", model_status: "ready", model_attribution: null, model_approved: true }).eq("id", v.id);
    router.refresh();
    setMsg({ ok: true, text: "Switched to the built-in model." });
  }
  async function makePrimary() {
    await supabase.from("profiles").update({ primary_vehicle_id: v.id }).eq("id", v.owner_id);
    router.refresh();
    setMsg({ ok: true, text: "This is now your primary car. Your interface accent follows its paint." });
  }
  async function remove() {
    if (prompt(`Type "${v.model}" to permanently delete this car, its mods, photos and history.`) !== v.model) return;
    setBusy("Deleting…");
    const { data: files } = await supabase.from("vehicle_photos").select("storage_path").eq("vehicle_id", v.id);
    if (files?.length) await supabase.storage.from("vehicle-photos").remove(files.map((f) => f.storage_path));
    const { error } = await supabase.from("vehicles").delete().eq("id", v.id);
    if (error) { setBusy(null); setMsg({ ok: false, text: error.message }); return; }
    router.push("/garage");
    router.refresh();
  }
  const canAgent = integrations.anthropic && integrations.serviceRole && (integrations.sketchfab || integrations.meshy);

  return (
    <AccentScope accent={accent}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div><div className="label text-accent">Edit</div><h1 className="h-display text-3xl">{draft.year} {draft.make} {draft.model}</h1></div>
        <div className="flex gap-2">
          <button type="button" className="btn-quiet" onClick={() => router.push(`/v/${v.slug}`)}>View</button>
          <button type="button" className="btn-primary" onClick={save} disabled={!!busy}>{busy ? <Loader2 size={16} className="animate-spin" /> : null} Save changes</button>
        </div>
      </div>
      {msg && <div role="status" className={`mb-4 rounded-lg border px-3 py-2 text-sm ${msg.ok ? "border-ok/40 text-ok" : "border-bad/40 text-bad"}`}>{msg.text}</div>}
      <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
        {([["details", "Details"], ["build", "Build sheet"], ["records", "Records"], ["privacy", "Privacy & costs"], ["3d", "3D model"]] as const).map(([id, l]) => (
          <button key={id} type="button" className="tab shrink-0" data-on={tab === id} onClick={() => setTab(id)}>{l}</button>
        ))}
      </nav>
      {tab === "details" && (
        <div className="space-y-5">
          <div className="panel p-5"><VehicleFields draft={draft} onChange={(d) => { setDraft(d); if (d.exterior_color_hex !== draft.exterior_color_hex) setConfig({ ...config, paint: d.exterior_color_hex ?? config.paint }); }} /></div>
          <div className="panel flex flex-wrap items-center justify-between gap-3 p-5">
            <div><div className="font-semibold">Primary car</div><div className="text-sm text-muted">Your dashboard and the interface accent follow your primary car.</div></div>
            {isPrimary ? <span className="chip-accent">Primary</span> : <button type="button" className="btn-ghost" onClick={makePrimary}>Make primary</button>}
          </div>
          <div className="panel flex flex-wrap items-center justify-between gap-3 border-bad/30 p-5">
            <div><div className="font-semibold text-bad">Delete car</div><div className="text-sm text-muted">Removes the car, mods, photos and history. Drives stay, but are no longer linked to a car.</div></div>
            <button type="button" className="btn-ghost !border-bad/50 !text-bad" onClick={remove}><Trash2 size={16} /> Delete</button>
          </div>
        </div>
      )}
      {tab === "build" && <BuildSections build={build} onChange={setBuild} />}
      {tab === "records" && <BuildRecords build={build} onChange={setBuild} />}
      {tab === "privacy" && <PrivacyCosts build={build} onBuild={setBuild} priv={priv} onPriv={setPriv} />}
      {tab === "3d" && (
        <div className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
            <div className="panel overflow-hidden">
              <VehicleViewer bodyStyle={bodyStyle} config={config} accent={accent} modelUrl={v.model_url} assembly={v.model_assembly} showPins={false} className="relative h-[380px] w-full" />
              <div className="border-t border-line p-3 text-xs text-muted">Current: <b className="text-ink">{v.model_url ? (v.model_approved ? "real model" : "real model, waiting for your review") : "built-in model"}</b>{v.model_attribution && <> · {v.model_attribution}</>}</div>
            </div>
            <div className="panel max-h-[520px] overflow-y-auto p-5">
              <div className="label mb-3">Colours and parts on the model</div>
              <ModelConfigurator bodyStyle={bodyStyle} config={config} onBodyStyle={setBodyStyle} onChange={setConfig} />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="panel p-5">
              <div className="font-semibold">Find a real model of my car</div>
              <p className="mt-1 text-sm text-muted">Uses our library when we have your car, otherwise finds a licensed model or builds one, and fits your visible mods. You approve it before anyone else sees it. Every model used is credited.</p>
              {!canAgent ? <div className="mt-2"><IntegrationNotice name="Real 3D models" envVar="ANTHROPIC_API_KEY + SUPABASE_SERVICE_ROLE_KEY + SKETCHFAB_API_TOKEN or MESHY_API_KEY" /></div> : (
                <button type="button" className="btn-primary mt-3" disabled={!!busy || v.model_status === "generating"} onClick={findModel}><Sparkles size={16} /> {v.model_status === "generating" ? "Working on it…" : "Find my car"}</button>
              )}
            </div>
            <div className="panel p-5">
              <div className="font-semibold">Built-in model</div>
              <p className="mt-1 text-sm text-muted">Your colours and aero on a stand-in body. Your photos lead the car page.</p>
              <button type="button" className="btn-ghost mt-3" onClick={revert} disabled={!v.model_url}>Use built-in model</button>
            </div>
          </div>
        </div>
      )}
    </AccentScope>
  );
}
