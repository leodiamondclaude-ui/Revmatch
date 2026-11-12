"use client";
/* eslint-disable @next/next/no-img-element */
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Camera, Check, ChevronLeft, ChevronRight, Loader2, Search, Sparkles, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { prepareImage, uid } from "@/lib/image";
import { accentFromPaint } from "@/lib/color";
import { applyIdentification, type IdentifyResult } from "@/lib/identify";
import type { BodyStyle, ModCategory, ModelConfig } from "@/lib/types";
import { MOD_CATEGORIES } from "@/lib/types";
import { AccentScope } from "@/components/ui/AccentScope";
import { IntegrationNotice } from "@/components/ui/IntegrationNotice";
import { EMPTY_DRAFT, VehicleFields, type VehicleDraft } from "@/components/garage/VehicleFields";
import { ModelConfigurator } from "@/components/garage/ModelConfigurator";
import { DEFAULT_CONFIG } from "@/components/three/parts";

const VehicleViewer = dynamic(() => import("@/components/three/VehicleViewer"), { ssr: false });

const REQUIRED = [
  { angle: "front_3q", label: "Front three-quarter", hint: "Stand at a front corner, about two car-lengths back" },
  { angle: "rear_3q", label: "Rear three-quarter", hint: "Same from the opposite rear corner" },
  { angle: "side", label: "Side profile", hint: "Square-on from the side, whole car in frame" },
] as const;

interface Photo { id: string; angle: string; file: File; preview: string }
interface SuggestedMod { category: ModCategory; name: string; brand: string | null; evidence: string; confidence: string; keep: boolean }
interface LibResult { uid: string; name: string; author: string; license: string; thumbnail: string | null; url: string; faces: number }

const STEPS = ["Photos", "Identify", "Details", "3D build", "Publish"];

export function Wizard({ userId, accent: userAccent, integrations }: { userId: string; accent: string; integrations: Record<string, boolean> }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [idState, setIdState] = useState<"idle" | "running" | "done" | "error" | "skipped">("idle");
  const [idError, setIdError] = useState<string | null>(null);
  const [result, setResult] = useState<IdentifyResult | null>(null);
  const [draft, setDraft] = useState<VehicleDraft>(EMPTY_DRAFT);
  const [flags, setFlags] = useState<Set<string>>(new Set());
  const [bodyStyle, setBodyStyle] = useState<BodyStyle>("coupe");
  const [config, setConfig] = useState<ModelConfig>({ ...DEFAULT_CONFIG });
  const [mods, setMods] = useState<SuggestedMod[]>([]);
  const [source, setSource] = useState<"procedural" | "library" | "ai" | "agent">("procedural");
  const [libQuery, setLibQuery] = useState("");
  const [libResults, setLibResults] = useState<LibResult[] | null>(null);
  const [libPick, setLibPick] = useState<LibResult | null>(null);
  const [libBusy, setLibBusy] = useState(false);
  const [approved, setApproved] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const accent = useMemo(() => (draft.exterior_color_hex ? accentFromPaint(config.paint ?? draft.exterior_color_hex) : userAccent), [config.paint, draft.exterior_color_hex, userAccent]);
  const has = (a: string) => photos.some((p) => p.angle === a);
  const requiredDone = REQUIRED.every((r) => has(r.angle));

  function addPhoto(angle: string, files: FileList | null) {
    if (!files?.length) return;
    const list = [...files].filter((f) => f.type.startsWith("image/"));
    setPhotos((ps) => {
      const next = angle === "other" ? ps : ps.filter((p) => p.angle !== angle);
      return [...next, ...list.slice(0, angle === "other" ? 8 : 1).map((file) => ({ id: uid(), angle, file, preview: URL.createObjectURL(file) }))];
    });
  }

  async function identify() {
    setStep(1);
    setIdState("running"); setIdError(null);
    try {
      const ordered = [...photos].sort((a, b) => (a.angle === "other" ? 1 : 0) - (b.angle === "other" ? 1 : 0)).slice(0, 6);
      const images = await Promise.all(ordered.map(async (p) => ({ angle: p.angle, media_type: "image/jpeg" as const, data: (await prepareImage(p.file, 1280)).base64 })));
      const res = await fetch("/api/ai/identify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ images }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Identification failed");
      const r = json.result as IdentifyResult;
      setResult(r);
      if (!r.is_vehicle) throw new Error("These photos don't appear to show a vehicle.");
      const applied = applyIdentification(r, draft);
      setDraft(applied.draft); setFlags(applied.flags); setConfig({ ...DEFAULT_CONFIG, ...applied.config }); setBodyStyle(applied.bodyStyle);
      setMods(r.likely_modifications.map((m) => ({ category: m.category, name: m.name, brand: m.brand_guess, evidence: m.evidence, confidence: m.confidence, keep: m.confidence !== "low" })));
      setLibQuery([r.year_max ?? r.year_min, r.make, r.model].filter(Boolean).join(" "));
      setIdState("done");
    } catch (e) {
      setIdError((e as Error).message);
      setIdState("error");
    }
  }

  async function searchLibrary() {
    setLibBusy(true); setError(null);
    try {
      const res = await fetch(`/api/models/search?q=${encodeURIComponent(libQuery || `${draft.make} ${draft.model}`)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setLibResults(json.results);
    } catch (e) { setError((e as Error).message); } finally { setLibBusy(false); }
  }

  async function save() {
    setError(null);
    if (!draft.make || !draft.model) { setError("Manufacturer and model are required."); setStep(2); return; }
    const supabase = createClient();
    try {
      setSaving("Creating vehicle…");
      const { data: v, error: vErr } = await supabase.from("vehicles").insert({
        ...draft, owner_id: userId, body_style: bodyStyle, model_config: config,
        exterior_color_hex: config.paint ?? draft.exterior_color_hex,
        model_source: "procedural", model_status: "ready", model_approved: source === "procedural" ? approved : false,
        ai_identification: result ? { ...result, identified_at: new Date().toISOString() } : null,
      }).select("id, slug").single();
      if (vErr) throw vErr;

      setSaving(`Uploading ${photos.length} photos…`);
      let cover: string | null = null;
      for (const p of photos) {
        const { blob } = await prepareImage(p.file, 2400, 0.88);
        const path = `${userId}/${v.id}/${p.id}.jpg`;
        const { error: upErr } = await supabase.storage.from("vehicle-photos").upload(path, blob, { contentType: "image/jpeg" });
        if (upErr) throw upErr;
        const url = supabase.storage.from("vehicle-photos").getPublicUrl(path).data.publicUrl;
        await supabase.from("vehicle_photos").insert({ vehicle_id: v.id, owner_id: userId, storage_path: path, url, angle: p.angle === "other" ? "other" : p.angle });
        if (p.angle === "front_3q" || (!cover && p.angle !== "other")) cover = cover && p.angle !== "front_3q" ? cover : url;
      }
      if (cover) await supabase.from("vehicles").update({ cover_photo_url: cover }).eq("id", v.id);

      const kept = mods.filter((m) => m.keep && m.name.trim());
      if (kept.length) {
        setSaving("Saving modifications…");
        await supabase.from("modifications").insert(kept.map((m) => ({
          vehicle_id: v.id, owner_id: userId, category: m.category, name: m.name, brand: m.brand,
          description: `Identified from photos: ${m.evidence}`,
        })));
      }
      const { data: prof } = await supabase.from("profiles").select("primary_vehicle_id").eq("id", userId).single();
      if (!prof?.primary_vehicle_id) await supabase.from("profiles").update({ primary_vehicle_id: v.id }).eq("id", userId);
      if (draft.visibility !== "private") {
        await supabase.from("posts").insert({
          author_id: userId, vehicle_id: v.id, kind: "new_vehicle", image_url: cover, visibility: draft.visibility === "friends" ? "friends" : "public",
          body: `Added a ${[draft.year, draft.make, draft.model, draft.trim].filter(Boolean).join(" ")} to the garage.`,
        });
      }

      if (source === "library" && libPick) {
        setSaving("Importing 3D model…");
        const r = await fetch("/api/models/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vehicleId: v.id, uid: libPick.uid }) });
        if (!r.ok) setError(`Saved, but the model import failed: ${(await r.json()).error}. The parametric model is shown instead.`);
      } else if (source === "agent") {
        setSaving("Starting the model agent…");
        const r = await fetch("/api/models/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vehicleId: v.id }) });
        if (!r.ok) setError(`Saved, but the model agent could not start: ${(await r.json()).error}`);
      } else if (source === "ai") {
        setSaving("Starting AI 3D generation…");
        const r = await fetch("/api/models/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vehicleId: v.id }) });
        if (!r.ok) setError(`Saved, but generation could not start: ${(await r.json()).error}`);
      }
      router.push(`/v/${v.slug}?new=1`);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setSaving(null);
    }
  }

  return (
    <AccentScope accent={accent}>
      <div className="mb-6">
        <div className="label text-accent">New vehicle</div>
        <h1 className="h-display text-3xl sm:text-4xl">Add to garage</h1>
        <ol className="mt-5 flex gap-1.5">
          {STEPS.map((s, i) => (
            <li key={s} className="flex-1">
              <div className={`h-1 rounded-full transition-all duration-500 ${i <= step ? "bg-accent shadow-[0_0_10px_var(--accent)]" : "bg-surface-3"}`} />
              <div className={`mt-1.5 hidden font-mono text-[10px] uppercase tracking-widest sm:block ${i === step ? "text-ink" : "text-dim"}`}>{String(i + 1).padStart(2, "0")} {s}</div>
            </li>
          ))}
        </ol>
      </div>

      {step === 0 && (
        <section className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            {REQUIRED.map((r) => {
              const p = photos.find((x) => x.angle === r.angle);
              return (
                <label key={r.angle} className={`panel group relative block aspect-[4/3] cursor-pointer overflow-hidden ${p ? "border-accent/50" : "border-dashed"}`}>
                  {p ? <img src={p.preview} alt="" className="absolute inset-0 h-full w-full object-cover" /> : (
                    <div className="absolute inset-0 grid place-items-center p-4 text-center">
                      <div><Camera className="mx-auto text-accent" /><div className="mt-2 text-sm font-semibold">{r.label}</div><div className="mt-1 text-xs text-muted">{r.hint}</div></div>
                    </div>
                  )}
                  {p && <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/70 px-3 py-2 text-xs"><span>{r.label}</span><Check size={14} className="text-ok" /></div>}
                  <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => addPhoto(r.angle, e.target.files)} />
                </label>
              );
            })}
          </div>
          <div className="panel p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><div className="font-semibold">Additional photos</div><div className="text-xs text-muted">Front, rear, wheels and engine bay shots improve accuracy. Up to 8.</div></div>
              <label className="btn-ghost cursor-pointer"><Camera size={16} /> Add photos<input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => addPhoto("other", e.target.files)} /></label>
            </div>
            {photos.some((p) => p.angle === "other") && (
              <div className="mt-3 flex flex-wrap gap-2">
                {photos.filter((p) => p.angle === "other").map((p) => (
                  <div key={p.id} className="relative h-20 w-28 overflow-hidden rounded-lg border border-line">
                    <img src={p.preview} alt="" className="h-full w-full object-cover" />
                    <button type="button" aria-label="Remove" onClick={() => setPhotos((ps) => ps.filter((x) => x.id !== p.id))} className="absolute right-1 top-1 rounded bg-black/70 p-0.5"><X size={12} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="btn-quiet" onClick={() => { setIdState("skipped"); setStep(2); }}>Enter details manually</button>
            <button type="button" className="btn-primary" disabled={!requiredDone} onClick={() => (integrations.anthropic ? identify() : (setIdState("skipped"), setStep(1)))}>
              <Sparkles size={16} /> Identify vehicle
            </button>
          </div>
          {!requiredDone && <p className="text-right text-xs text-muted">Add all three required angles to continue.</p>}
        </section>
      )}

      {step === 1 && (
        <section className="space-y-5">
          {!integrations.anthropic && (
            <IntegrationNotice name="AI vehicle identification" envVar="ANTHROPIC_API_KEY">You can still enter the details yourself. Your photos are kept.</IntegrationNotice>
          )}
          {idState === "running" && (
            <div className="panel sweep relative overflow-hidden p-10 text-center">
              <Loader2 className="mx-auto animate-spin text-accent" size={32} />
              <div className="h-display mt-4 text-2xl">Analysing {Math.min(photos.length, 6)} photos</div>
              <p className="mt-1 text-sm text-muted">Matching body lines, lights and wheels against known generations…</p>
            </div>
          )}
          {idState === "error" && <div className="rounded-xl border border-bad/40 bg-bad/10 p-4 text-sm text-bad">{idError}</div>}
          {idState === "done" && result && (
            <div className="panel panel-accent p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="label">Best match</div>
                  <div className="h-display text-3xl">{[result.year_min === result.year_max ? result.year_min : result.year_min && result.year_max ? `${result.year_min}–${result.year_max}` : result.year_min ?? result.year_max, result.make, result.model, result.trim].filter(Boolean).join(" ") || "Unknown"}</div>
                  {result.generation && <div className="font-mono text-xs text-muted">Generation {result.generation}</div>}
                </div>
                <span className={`chip ${result.confidence === "high" ? "!border-ok/50 !text-ok" : result.confidence === "medium" ? "!border-warn/50 !text-warn" : "!border-bad/50 !text-bad"}`}>{result.confidence} confidence</span>
              </div>
              <p className="mt-3 text-sm text-muted">{result.reasoning}</p>
              <p className="mt-3 text-xs text-dim">This is a suggestion. You can correct every field in the next steps.</p>
            </div>
          )}
          {idState === "done" && (
            <div className="panel p-5">
              <div className="label mb-3">Detected modifications: keep the ones that are right</div>
              {mods.length === 0 && <p className="text-sm text-muted">No aftermarket parts were visible in the photos.</p>}
              <div className="space-y-2">
                {mods.map((m, i) => (
                  <div key={i} className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 ${m.keep ? "border-accent/40 bg-accent/5" : "border-line"}`}>
                    <input type="checkbox" checked={m.keep} onChange={(e) => setMods((ms) => ms.map((x, j) => (j === i ? { ...x, keep: e.target.checked } : x)))} className="accent-[var(--accent)]" />
                    <select className="input !w-auto !py-1.5" value={m.category} onChange={(e) => setMods((ms) => ms.map((x, j) => (j === i ? { ...x, category: e.target.value as ModCategory } : x)))}>
                      {MOD_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                    <input className="input !w-auto min-w-40 flex-1 !py-1.5" value={m.name} onChange={(e) => setMods((ms) => ms.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                    <span className="chip">{m.confidence}</span>
                    <div className="w-full text-xs text-muted">{m.evidence}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex justify-between">
            <button type="button" className="btn-quiet" onClick={() => setStep(0)}><ChevronLeft size={16} /> Photos</button>
            <div className="flex gap-2">
              {idState === "error" && <button type="button" className="btn-ghost" onClick={identify}>Retry</button>}
              <button type="button" className="btn-primary" disabled={idState === "running"} onClick={() => setStep(2)}>Review details <ChevronRight size={16} /></button>
            </div>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-5">
          <div className="panel p-5"><VehicleFields draft={draft} onChange={(d) => { setDraft(d); if (d.exterior_color_hex !== draft.exterior_color_hex) setConfig((c) => ({ ...c, paint: d.exterior_color_hex ?? c.paint })); }} aiFlags={flags} /></div>
          <div className="flex justify-between">
            <button type="button" className="btn-quiet" onClick={() => setStep(photos.length ? 1 : 0)}><ChevronLeft size={16} /> Back</button>
            <button type="button" className="btn-primary" disabled={!draft.make || !draft.model} onClick={() => setStep(3)}>3D build <ChevronRight size={16} /></button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {([
              ["procedural", "Built-in model", "A photoreal studio car (or a parametric model that follows your body style) shown with your paint, wheels, tint and aero. Every part is clickable. A stand-in, not your exact car.", true],
              ["library", "Existing 3D model", "Search Sketchfab for a downloadable model of your car, then import it.", integrations.sketchfab && integrations.serviceRole],
              ["agent", "AI model agent", "An AI agent finds a licensed, professionally made model of your exact car on Sketchfab and fits your mods using real part models. Takes a few minutes.", integrations.anthropic && integrations.sketchfab && integrations.serviceRole],
              ["ai", "AI-generated from photos", "Meshy builds a textured mesh from your photos. It's an approximation, not a scan, and takes a few minutes.", integrations.meshy && integrations.serviceRole],
            ] as const).map(([id, title, body, ok]) => (
              <button key={id} type="button" disabled={!ok} onClick={() => { setSource(id); setApproved(false); }}
                className={`panel p-4 text-left transition disabled:opacity-50 ${source === id ? "border-accent shadow-[0_0_0_1px_var(--accent)]" : "hover:border-line-strong"}`}>
                <div className="font-semibold">{title}</div>
                <p className="mt-1 text-xs text-muted">{body}</p>
                {!ok && <div className="mt-2 font-mono text-[10px] uppercase text-warn">Not configured</div>}
              </button>
            ))}
          </div>

          <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
            <div className="panel overflow-hidden">
              <VehicleViewer bodyStyle={bodyStyle} config={config} accent={accent} showPins={false} className="relative h-[360px] w-full sm:h-[440px]" />
              <div className="border-t border-line p-3 text-xs text-muted">
                {source === "procedural" ? ((config.representation ?? "studio") === "studio" ? "Studio stand-in: your paint, wheels, tint and aero on a generic sports-car body, not your car's exact shape." : "Parametric representation: proportions follow the body style, not exact factory dimensions.") : "This preview is shown until the imported or generated model is ready."}
              </div>
            </div>
            <div className="panel max-h-[520px] overflow-y-auto p-5">
              {source === "library" ? (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <input className="input" value={libQuery} onChange={(e) => setLibQuery(e.target.value)} placeholder="2019 Porsche 911 GT3" />
                    <button type="button" className="btn-ghost" onClick={searchLibrary} disabled={libBusy}>{libBusy ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}</button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {libResults?.map((m) => (
                      <button key={m.uid} type="button" onClick={() => setLibPick(m)} className={`overflow-hidden rounded-lg border text-left ${libPick?.uid === m.uid ? "border-accent" : "border-line"}`}>
                        {m.thumbnail && <img src={m.thumbnail} alt="" className="aspect-video w-full object-cover" />}
                        <div className="p-2"><div className="truncate text-xs font-semibold">{m.name}</div><div className="truncate text-[10px] text-muted">{m.author} · {m.license}</div></div>
                      </button>
                    ))}
                    {libResults?.length === 0 && <p className="col-span-2 text-sm text-muted">No downloadable matches. Try a broader query, or use the parametric or AI option.</p>}
                  </div>
                  <p className="text-[11px] text-dim">Models stay under their authors&apos; licences, and attribution is shown on your vehicle page.</p>
                  <hr className="border-line" />
                  <div className="label">Overlay settings (used for clickable parts)</div>
                  <ModelConfigurator bodyStyle={bodyStyle} config={config} onBodyStyle={setBodyStyle} onChange={setConfig} />
                </div>
              ) : (
                <ModelConfigurator bodyStyle={bodyStyle} config={config} onBodyStyle={setBodyStyle} onChange={setConfig} />
              )}
            </div>
          </div>
          <label className="flex items-start gap-3 rounded-xl border border-line p-4">
            <input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} className="mt-1 accent-[var(--accent)]" />
            <span className="text-sm">I&apos;ve reviewed the 3D representation and corrected anything that didn&apos;t match my car. {source !== "procedural" && <span className="text-muted">The imported or generated model will need a separate approval once it&apos;s ready.</span>}</span>
          </label>
          <div className="flex justify-between">
            <button type="button" className="btn-quiet" onClick={() => setStep(2)}><ChevronLeft size={16} /> Details</button>
            <button type="button" className="btn-primary" disabled={!approved || (source === "library" && !libPick)} onClick={() => setStep(4)}>Review &amp; publish <ChevronRight size={16} /></button>
          </div>
        </section>
      )}

      {step === 4 && (
        <section className="space-y-5">
          <div className="panel panel-accent p-6">
            <div className="label">Ready to publish</div>
            <div className="h-display mt-1 text-3xl">{[draft.year, draft.make, draft.model, draft.trim].filter(Boolean).join(" ")}</div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div><dt className="label">Photos</dt><dd className="num">{photos.length}</dd></div>
              <div><dt className="label">Mods</dt><dd className="num">{mods.filter((m) => m.keep).length}</dd></div>
              <div><dt className="label">3D</dt><dd>{source === "procedural" ? "Built-in" : source === "library" ? "Library import" : source === "agent" ? "AI model agent" : "AI generation"}</dd></div>
              <div><dt className="label">Visibility</dt><dd className="capitalize">{draft.visibility}</dd></div>
            </dl>
          </div>
          {error && <div className="rounded-xl border border-bad/40 bg-bad/10 p-4 text-sm text-bad">{error}</div>}
          <div className="flex justify-between">
            <button type="button" className="btn-quiet" disabled={!!saving} onClick={() => setStep(3)}><ChevronLeft size={16} /> 3D build</button>
            <button type="button" className="btn-primary" disabled={!!saving} onClick={save}>{saving ? <><Loader2 className="animate-spin" size={16} /> {saving}</> : "Publish to garage"}</button>
          </div>
        </section>
      )}
    </AccentScope>
  );
}
