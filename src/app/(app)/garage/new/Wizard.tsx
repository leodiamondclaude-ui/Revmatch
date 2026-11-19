"use client";
/* eslint-disable @next/next/no-img-element */
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Camera, Check, ChevronLeft, ChevronRight, Loader2, Plus, Sparkles, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { prepareImage, uid } from "@/lib/image";
import { accentFromPaint } from "@/lib/color";
import { applySpotted, spottedRows, type IdentifyResult, type SpotRow } from "@/lib/identify";
import { BUILD_STYLES, brandColors, guessModCategory, HEADLIGHTS, type BuildSheet } from "@/lib/build";
import type { BodyStyle, ModCategory, ModelConfig, Visibility } from "@/lib/types";
import { MOD_CATEGORIES } from "@/lib/types";
import type { LookupResult } from "@/app/api/ai/lookup/route";
import { AccentScope } from "@/components/ui/AccentScope";
import { IntegrationNotice } from "@/components/ui/IntegrationNotice";
import { ModelConfigurator } from "@/components/garage/ModelConfigurator";
import { DEFAULT_CONFIG } from "@/components/three/parts";

const VehicleViewer = dynamic(() => import("@/components/three/VehicleViewer"), { ssr: false });

/** The four photos, and exactly how to take each one. */
const SHOTS = [
  { angle: "front_3q", label: "Front corner, driver's side", hint: "Stand off the front-left corner with the left headlight in the middle of the frame. Get the hood and the whole driver's side in." },
  { angle: "interior", label: "From the driver's seat", hint: "Sit in the driver's seat and show as much as you can: the door, steering wheel, gauges, lighting, centre console and the seats." },
  { angle: "rear_3q", label: "Rear corner, passenger side", hint: "Stand off the back-right corner with the right taillight in the middle. Get the spoiler, diffuser, taillights, badges and the passenger side in." },
  { angle: "engine", label: "Under the hood", hint: "Pop the hood and fit the whole engine bay in the shot." },
] as const;
const STEPS = ["Your car", "Photos", "What we spotted", "Looks", "Mods", "Specs", "Publish"];
const BODY_STYLES: [BodyStyle, string][] = [["coupe", "Coupe"], ["sedan", "Sedan"], ["hatch", "Hatchback"], ["wagon", "Wagon"], ["suv", "SUV"], ["truck", "Truck"]];
const MATERIALS = ["Leather", "Alcantara / suede", "Cloth", "Carbon buckets", "Vinyl"];
const SEATS = [{ name: "Black", hex: "#0b0b0c" }, { name: "Graphite", hex: "#2b2c30" }, { name: "Bone", hex: "#cfc4ad" }, { name: "Tan", hex: "#a8763e" }, { name: "Cognac", hex: "#7a3a1b" }, { name: "Red", hex: "#8e1a1f" }, { name: "Navy", hex: "#1c2d52" }];

interface Photo { id: string; angle: string; file: File; preview: string }
interface ModLine { id: string; name: string; category: ModCategory; brand: string | null; source: "owner" | "photo" }
type SpecKey = "engine" | "horsepower" | "transmission" | "drivetrain" | "weight" | "zero60" | "top";
const SPEC_ROWS: [SpecKey, string, "text" | "number"][] = [["engine", "Engine", "text"], ["horsepower", "Factory power (hp)", "number"], ["transmission", "Transmission", "text"], ["drivetrain", "Drivetrain", "text"], ["weight", "Curb weight (lb)", "number"], ["zero60", "0–60 mph (s)", "number"], ["top", "Top speed (mph)", "number"]];

export function Wizard({ userId, accent: userAccent, integrations }: { userId: string; accent: string; integrations: Record<string, boolean> }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  // Step 1
  const [year, setYear] = useState<string>("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [style, setStyle] = useState<string | null>(null);
  // Step 2-3
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [idState, setIdState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [idError, setIdError] = useState<string | null>(null);
  const [result, setResult] = useState<IdentifyResult | null>(null);
  const [rows, setRows] = useState<SpotRow[]>([]);
  // Step 4
  const [config, setConfig] = useState<ModelConfig>({ ...DEFAULT_CONFIG });
  const [bodyStyle, setBodyStyle] = useState<BodyStyle>("coupe");
  const [paintName, setPaintName] = useState<string | null>(null);
  const [headlights, setHeadlights] = useState<string | null>(null);
  const [seat, setSeat] = useState<{ name: string | null; hex: string | null; material: string | null }>({ name: null, hex: null, material: null });
  const [found, setFound] = useState<{ vehicle: Record<string, unknown>; build: BuildSheet }>({ vehicle: {}, build: {} });
  // Step 5
  const [mods, setMods] = useState<ModLine[]>([{ id: uid(), name: "", category: "other", brand: null, source: "owner" }]);
  // Step 6
  const [lookup, setLookup] = useState<{ state: "idle" | "running" | "done" | "error"; data?: LookupResult; error?: string }>({ state: "idle" });
  const [trim, setTrim] = useState("");
  const [specs, setSpecs] = useState<Record<SpecKey, { v: string; ok: boolean }>>(() => Object.fromEntries(SPEC_ROWS.map(([k]) => [k, { v: "", ok: false }])) as never);
  const [powerNow, setPowerNow] = useState("");
  const [mileage, setMileage] = useState("");
  const [nickname, setNickname] = useState("");
  // Step 7
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [source, setSource] = useState<"procedural" | "agent">("procedural");
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const accent = useMemo(() => (config.paint ? accentFromPaint(config.paint) : userAccent), [config.paint, userAccent]);
  const carName = [year, make, model].filter(Boolean).join(" ");
  const canAgent = integrations.anthropic && integrations.serviceRole && (integrations.sketchfab || integrations.meshy);

  function addPhoto(angle: string, files: FileList | null) {
    const file = [...(files ?? [])].find((f) => f.type.startsWith("image/"));
    if (!file) return;
    setPhotos((ps) => [...ps.filter((p) => p.angle !== angle), { id: uid(), angle, file, preview: URL.createObjectURL(file) }]);
  }

  async function readPhotos() {
    setStep(2); setIdState("running"); setIdError(null);
    try {
      const ordered = SHOTS.map((s) => photos.find((p) => p.angle === s.angle)).filter(Boolean) as Photo[];
      const images = await Promise.all(ordered.map(async (p) => ({ angle: p.angle, media_type: "image/jpeg" as const, data: (await prepareImage(p.file, 1280)).base64 })));
      const res = await fetch("/api/ai/identify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ images }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't read the photos.");
      const r = json.result as IdentifyResult;
      if (!r.is_vehicle) throw new Error("These photos don't seem to show a car. Try different shots, or skip this step.");
      setResult(r); setRows(spottedRows(r)); setBodyStyle(r.body_style);
      if (!trim && r.trim) setTrim(r.trim);
      setIdState("done");
    } catch (e) { setIdError((e as Error).message); setIdState("error"); }
  }

  /** Apply the ticked findings, then go on to Looks. */
  function confirmSpotted() {
    if (result) {
      const a = applySpotted(result, rows, { ...DEFAULT_CONFIG, ...config });
      setConfig(a.config);
      if (a.vehicle.exterior_color) setPaintName(a.vehicle.exterior_color);
      if (a.build.looks.headlights) setHeadlights(a.build.looks.headlights);
      if (a.vehicle.interior_color || a.build.looks.interiorHex) setSeat((s) => ({ name: a.vehicle.interior_color ?? s.name, hex: a.build.looks.interiorHex ?? s.hex, material: s.material }));
      setFound({ vehicle: a.vehicle, build: { exterior: a.build.exterior, interior: a.build.interior } });
      const fromPhotos: ModLine[] = a.mods.map((m) => ({ id: uid(), name: m.name, category: m.category, brand: m.brand, source: "photo" }));
      setMods((ms) => [...fromPhotos, ...ms.filter((m) => m.source === "owner")]);
      if (a.vehicle.engine) setSpecs((s) => ({ ...s, engine: { v: a.vehicle.engine as string, ok: true } }));
    }
    setStep(3);
  }

  async function runLookup() {
    setLookup({ state: "running" });
    try {
      const res = await fetch("/api/ai/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ year: year ? +year : null, make, model, trim: trim || null }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Lookup failed");
      setLookup({ state: "done", data: json.result });
    } catch (e) { setLookup({ state: "error", error: (e as Error).message }); }
  }
  function pickTrim(t: LookupResult["trims"][number]) {
    setTrim(t.name);
    // Fill the rows with the suggestion but leave every one unticked: the owner confirms what's right.
    const v: Record<SpecKey, string> = { engine: t.engine ?? "", horsepower: t.horsepower?.toString() ?? "", transmission: t.transmission ?? "", drivetrain: t.drivetrain ?? "", weight: t.curb_weight_lb?.toString() ?? "", zero60: t.zero_to_sixty_s?.toString() ?? "", top: t.top_speed_mph?.toString() ?? "" };
    setSpecs((s) => Object.fromEntries(SPEC_ROWS.map(([k]) => [k, s[k].ok && s[k].v ? s[k] : { v: v[k], ok: false }])) as never);
  }

  async function save() {
    setError(null);
    if (!make.trim() || !model.trim()) { setError("Make and model are required."); setStep(0); return; }
    const supabase = createClient();
    const spec = (k: SpecKey) => (specs[k].ok && specs[k].v.trim() ? specs[k].v.trim() : null);
    const num = (k: SpecKey) => (spec(k) != null && Number.isFinite(+spec(k)!) ? +spec(k)! : null);
    const factoryHp = num("horsepower"), hpNow = powerNow ? +powerNow : factoryHp;
    const build: BuildSheet = {
      profile: style ? { status: style } : undefined,
      specs: { stockHp: factoryHp, weight: num("weight"), zero60: num("zero60"), top: num("top") },
      exterior: found.build.exterior, interior: { ...found.build.interior, ...(seat.material ? { material: [seat.name, seat.material.toLowerCase()].filter(Boolean).join(" ") } : {}) },
      looks: { headlights, interiorHex: seat.hex },
    };
    try {
      setSaving("Creating your car…");
      const { data: v, error: vErr } = await supabase.from("vehicles").insert({
        owner_id: userId, year: year ? +year : null, make: make.trim(), model: model.trim(), trim: trim.trim() || null, nickname: nickname.trim() || null,
        engine: spec("engine"), horsepower: hpNow, transmission: spec("transmission"), drivetrain: spec("drivetrain"),
        exterior_color: paintName, exterior_color_hex: config.paint ?? null, interior_color: seat.name, mileage: mileage ? +mileage : null,
        visibility, body_style: bodyStyle, model_config: config, build,
        model_source: "procedural", model_status: "ready", model_approved: true,
        ai_identification: result ? { ...result, identified_at: new Date().toISOString() } : null,
      }).select("id, slug").single();
      if (vErr) throw vErr;

      let cover: string | null = null;
      for (const [n, p] of photos.entries()) {
        setSaving(`Uploading photo ${n + 1} of ${photos.length}…`);
        const { blob } = await prepareImage(p.file, 2400, 0.88);
        const path = `${userId}/${v.id}/${p.id}.jpg`;
        const { error: upErr } = await supabase.storage.from("vehicle-photos").upload(path, blob, { contentType: "image/jpeg" });
        if (upErr) throw upErr;
        const url = supabase.storage.from("vehicle-photos").getPublicUrl(path).data.publicUrl;
        await supabase.from("vehicle_photos").insert({ vehicle_id: v.id, owner_id: userId, storage_path: path, url, angle: p.angle, caption: SHOTS.find((s) => s.angle === p.angle)?.label ?? null });
        if (p.angle === "front_3q" || (!cover && p.angle === "rear_3q")) cover = url;
      }
      if (cover) await supabase.from("vehicles").update({ cover_photo_url: cover }).eq("id", v.id);

      const kept = mods.filter((m) => m.name.trim());
      if (kept.length) {
        setSaving("Saving your mods…");
        const { error: mErr } = await supabase.from("modifications").insert(kept.map((m) => ({
          vehicle_id: v.id, owner_id: userId, category: m.category, name: m.name.trim().slice(0, 120), brand: m.brand, source: m.source,
          description: m.source === "photo" ? "Spotted in your photos and confirmed by you." : null,
        })));
        if (mErr) throw mErr;
      }
      const { data: prof } = await supabase.from("profiles").select("primary_vehicle_id").eq("id", userId).single();
      if (!prof?.primary_vehicle_id) await supabase.from("profiles").update({ primary_vehicle_id: v.id }).eq("id", userId);
      if (visibility !== "private") {
        await supabase.from("posts").insert({ author_id: userId, vehicle_id: v.id, kind: "new_vehicle", image_url: cover, visibility: visibility === "friends" ? "friends" : "public",
          body: `Added a ${[year, make, model, trim].filter(Boolean).join(" ")} to the garage.` });
      }
      if (source === "agent") {
        setSaving("Finding a real model of your car…");
        const r = await fetch("/api/models/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vehicleId: v.id }) });
        if (!r.ok) setError(`Saved, but finding a real model couldn't start: ${(await r.json()).error}`);
      }
      router.push(`/v/${v.slug}?new=1`);
      router.refresh();
    } catch (e) { setError((e as Error).message); setSaving(null); }
  }

  const Nav = ({ back, next, nextLabel = "Next", disabled }: { back?: () => void; next: () => void; nextLabel?: string; disabled?: boolean }) => (
    <div className="flex items-center justify-between gap-3 pt-2">
      {back ? <button type="button" className="btn-quiet" onClick={back}><ChevronLeft size={16} /> Back</button> : <span />}
      <button type="button" className="btn-primary" disabled={disabled} onClick={next}>{nextLabel} <ChevronRight size={16} /></button>
    </div>
  );
  const groups = (["Outside", "Inside", "Engine bay", "Mods"] as const).filter((g) => rows.some((r) => r.group === g));
  const suggested = brandColors(make);

  return (
    <AccentScope accent={accent}>
      <div className="mb-6">
        <div className="label text-accent">New car</div>
        <h1 className="h-display text-3xl sm:text-4xl">{step === 0 || !carName ? "Add to garage" : carName}</h1>
        <ol className="mt-5 flex gap-1.5" aria-label="Progress">
          {STEPS.map((s, i) => (
            <li key={s} className="flex-1" aria-current={i === step ? "step" : undefined}>
              <div className={`h-1 rounded-full transition-all duration-500 ${i <= step ? "bg-accent shadow-[0_0_10px_var(--accent)]" : "bg-surface-3"}`} />
              <div className={`mt-1.5 hidden font-mono text-[10px] uppercase tracking-widest md:block ${i === step ? "text-ink" : "text-dim"}`}>{s}</div>
            </li>
          ))}
        </ol>
      </div>

      {step === 0 && (
        <section className="space-y-5">
          <div className="panel grid gap-4 p-5 sm:grid-cols-[110px_1fr_1fr]">
            <label className="space-y-1.5"><span className="label">Year</span><input className="input" inputMode="numeric" maxLength={4} value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, ""))} placeholder="2012" /></label>
            <label className="space-y-1.5"><span className="label">Make *</span><input className="input" value={make} onChange={(e) => setMake(e.target.value)} placeholder="e.g. Volkswagen" autoComplete="off" /></label>
            <label className="space-y-1.5"><span className="label">Model *</span><input className="input" value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. Eos" autoComplete="off" /></label>
          </div>
          <div className="panel p-5">
            <div className="font-semibold">What&apos;s it built for?</div>
            <p className="text-sm text-muted">Pick the one that fits best. You can change it later.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {BUILD_STYLES.map((s) => <button key={s} type="button" aria-pressed={style === s} onClick={() => setStyle(style === s ? null : s)} className={`rounded-full border px-3 py-1.5 text-sm transition ${style === s ? "border-accent bg-accent/15 text-ink" : "border-line text-muted hover:text-ink"}`}>{s}</button>)}
            </div>
          </div>
          <Nav next={() => setStep(1)} disabled={!make.trim() || !model.trim() || (!!year && (+year < 1900 || +year > new Date().getFullYear() + 1))} />
        </section>
      )}

      {step === 1 && (
        <section className="space-y-5">
          <div>
            <h2 className="h-display text-2xl">Four photos, that&apos;s it</h2>
            <p className="text-sm text-muted">We&apos;ll work out the colours, lights, wheels, aero and what&apos;s under the hood. You check everything next. Photos also go in your car&apos;s gallery.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {SHOTS.map((s, n) => {
              const p = photos.find((x) => x.angle === s.angle);
              return (
                <label key={s.angle} className={`panel group relative block cursor-pointer overflow-hidden ${p ? "border-accent/50" : "border-dashed"}`}>
                  {p ? <img src={p.preview} alt={s.label} className="aspect-[4/3] w-full object-cover" /> : (
                    <div className="flex aspect-[4/3] flex-col justify-center gap-2 p-5">
                      <div className="flex items-center gap-2"><span className="grid h-6 w-6 place-items-center rounded-full bg-accent/15 font-mono text-xs text-accent">{n + 1}</span><span className="font-semibold">{s.label}</span></div>
                      <p className="text-sm text-muted">{s.hint}</p>
                      <span className="btn-ghost mt-1 w-fit !py-1.5"><Camera size={14} /> Add photo</span>
                    </div>
                  )}
                  {p && <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/70 px-3 py-2 text-xs"><span>{s.label}</span><span className="flex items-center gap-1 text-ok"><Check size={14} /> Tap to retake</span></div>}
                  <input type="file" accept="image/*" className="sr-only" aria-label={`${s.label} photo`} onChange={(e) => addPhoto(s.angle, e.target.files)} />
                </label>
              );
            })}
          </div>
          {!integrations.anthropic && <IntegrationNotice name="Reading photos with AI" envVar="ANTHROPIC_API_KEY">Your photos still go in the gallery; you&apos;ll pick the looks yourself.</IntegrationNotice>}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <button type="button" className="btn-quiet" onClick={() => setStep(0)}><ChevronLeft size={16} /> Back</button>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-quiet" onClick={() => setStep(3)}>{photos.length ? "Skip reading, set looks myself" : "Skip photos"}</button>
              {integrations.anthropic && <button type="button" className="btn-primary" disabled={!photos.length} onClick={readPhotos}><Sparkles size={16} /> Read my photos ({photos.length}/4)</button>}
            </div>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-5">
          {idState === "running" && (
            <div className="panel sweep relative overflow-hidden p-10 text-center">
              <Loader2 className="mx-auto animate-spin text-accent" size={32} />
              <div className="h-display mt-4 text-2xl">Reading {photos.length} photo{photos.length === 1 ? "" : "s"}</div>
              <p className="mt-1 text-sm text-muted">Paint, wheels, lights, aero, the cabin and the engine bay…</p>
            </div>
          )}
          {idState === "error" && <div className="rounded-xl border border-bad/40 bg-bad/10 p-4 text-sm text-bad" role="alert">{idError}</div>}
          {idState === "done" && result && (
            <>
              <div>
                <h2 className="h-display text-2xl">Did we get it right?</h2>
                <p className="text-sm text-muted">Untick anything that&apos;s wrong. Only ticked items are saved to your car.{result.make && result.model && `${result.make} ${result.model}`.toLowerCase() !== `${make} ${model}`.toLowerCase() && <> These photos look like a <b className="text-ink">{[result.make, result.model, result.trim].filter(Boolean).join(" ")}</b>; we&apos;ve kept what you typed.</>}</p>
              </div>
              {groups.map((g) => (
                <div key={g} className="panel divide-y divide-line">
                  <div className="label px-4 py-2.5">{g === "Mods" ? "Mods we could see" : g}</div>
                  {rows.filter((r) => r.group === g).map((r) => (
                    <label key={r.id} className={`flex cursor-pointer items-center gap-3 px-4 py-3 ${r.ok ? "" : "opacity-60"}`}>
                      <input type="checkbox" checked={r.ok} onChange={(e) => setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, ok: e.target.checked } : x)))} className="h-5 w-5 accent-[var(--accent)]" />
                      <span className="w-36 shrink-0 text-sm text-muted">{r.label}</span>
                      <span className="flex min-w-0 items-center gap-2">{r.hex && <span className="h-4 w-4 shrink-0 rounded-full border border-white/25" style={{ background: r.hex }} />}<span className="truncate">{r.value}</span></span>
                    </label>
                  ))}
                </div>
              ))}
            </>
          )}
          <div className="flex items-center justify-between gap-3 pt-2">
            <button type="button" className="btn-quiet" onClick={() => setStep(1)}><ChevronLeft size={16} /> Photos</button>
            <div className="flex gap-2">
              {idState === "error" && <button type="button" className="btn-ghost" onClick={readPhotos}>Try again</button>}
              <button type="button" className="btn-primary" disabled={idState === "running"} onClick={confirmSpotted}>{idState === "done" ? "Looks right" : "Set looks myself"} <ChevronRight size={16} /></button>
            </div>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
            <div className="panel overflow-hidden">
              <VehicleViewer bodyStyle={bodyStyle} config={config} accent={accent} showPins={false} className="relative h-[340px] w-full sm:h-[440px]" />
              <div className="border-t border-line p-3 text-xs text-muted">Preview on a stand-in body in your colours. Finding a real model of your car is the last step.</div>
            </div>
            <div className="panel max-h-[560px] space-y-5 overflow-y-auto p-5">
              {suggested.length > 0 && (
                <div className="space-y-2">
                  <div className="label">Popular {make} colours</div>
                  <div className="flex flex-wrap gap-2">
                    {suggested.map((c, n) => (
                      <button key={c.hex} type="button" title={c.name} onClick={() => { setConfig({ ...config, paint: c.hex }); setPaintName(c.name); }}
                        className={`flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs ${config.paint === c.hex ? "border-accent" : "border-line"}`}>
                        <span className="h-4 w-4 rounded-full border border-white/25" style={{ background: c.hex }} />{c.name}{n === 0 && <span className="text-accent">· signature</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <label className="block space-y-1.5"><span className="label">Colour name</span><input className="input" value={paintName ?? ""} onChange={(e) => setPaintName(e.target.value || null)} placeholder="e.g. Reflex Silver" /></label>
              <div className="space-y-2">
                <div className="label">Body style</div>
                <div className="flex flex-wrap gap-1.5">{BODY_STYLES.map(([b, l]) => <button key={b} type="button" onClick={() => setBodyStyle(b)} className={`rounded-md border px-2.5 py-1.5 text-xs ${bodyStyle === b ? "border-accent bg-accent/15" : "border-line text-muted"}`}>{l}</button>)}</div>
              </div>
              <div className="space-y-2">
                <div className="label">Headlights</div>
                <div className="flex flex-wrap gap-2">{HEADLIGHTS.map((h) => <button key={h.hex} type="button" onClick={() => setHeadlights(h.hex)} className={`flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs ${headlights === h.hex ? "border-accent" : "border-line"}`}><span className="h-3.5 w-3.5 rounded-full" style={{ background: h.hex }} />{h.name}</button>)}</div>
              </div>
              <div className="space-y-2">
                <div className="label">Seats</div>
                <div className="flex flex-wrap gap-2">{SEATS.map((c) => <button key={c.hex} type="button" title={c.name} onClick={() => setSeat({ ...seat, name: c.name, hex: c.hex })} className={`h-8 w-8 rounded-full border-2 ${seat.hex === c.hex ? "border-ink" : "border-transparent"}`} style={{ background: c.hex }} aria-label={`${c.name} seats`} />)}</div>
                <div className="flex flex-wrap gap-1.5">{MATERIALS.map((m) => <button key={m} type="button" onClick={() => setSeat({ ...seat, material: m })} className={`rounded-md border px-2.5 py-1.5 text-xs ${seat.material === m ? "border-accent bg-accent/15" : "border-line text-muted"}`}>{m}</button>)}</div>
              </div>
              <hr className="border-line" />
              <ModelConfigurator bodyStyle={bodyStyle} config={config} onBodyStyle={setBodyStyle} onChange={setConfig} />
            </div>
          </div>
          <Nav back={() => setStep(result ? 2 : 1)} next={() => setStep(4)} />
        </section>
      )}

      {step === 4 && (
        <section className="space-y-5">
          <div>
            <h2 className="h-display text-2xl">What have you done to it?</h2>
            <p className="text-sm text-muted">One mod per line, in your own words. Broad is fine: &ldquo;exhaust&rdquo;, &ldquo;lowered on coilovers&rdquo;, &ldquo;tuned&rdquo;. Stock so far? Leave it blank.</p>
          </div>
          <div className="space-y-2">
            {mods.map((m, n) => (
              <div key={m.id} className="flex flex-wrap items-center gap-2">
                <input className="input min-w-48 flex-1" value={m.name} maxLength={120} placeholder={n === 0 ? "e.g. Cold air intake" : "Another mod"} aria-label={`Mod ${n + 1}`}
                  onChange={(e) => { const name = e.target.value; setMods((ms) => ms.map((x) => (x.id === m.id ? { ...x, name, category: x.source === "photo" ? x.category : guessModCategory(name) } : x))); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (m.name.trim()) setMods((ms) => [...ms, { id: uid(), name: "", category: "other", brand: null, source: "owner" }]); } }} />
                <select className="input !w-auto !py-2 text-sm" value={m.category} aria-label={`Category for mod ${n + 1}`} onChange={(e) => setMods((ms) => ms.map((x) => (x.id === m.id ? { ...x, category: e.target.value as ModCategory } : x)))}>
                  {MOD_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                {m.source === "photo" && <span className="chip">from your photos</span>}
                {mods.length > 1 && <button type="button" className="btn-quiet !p-2" aria-label={`Remove mod ${n + 1}`} onClick={() => setMods((ms) => ms.filter((x) => x.id !== m.id))}><X size={16} /></button>}
              </div>
            ))}
          </div>
          <button type="button" className="btn-ghost" onClick={() => setMods((ms) => [...ms, { id: uid(), name: "", category: "other", brand: null, source: "owner" }])}><Plus size={16} /> Add another mod</button>
          <Nav back={() => setStep(3)} next={() => setStep(5)} />
        </section>
      )}

      {step === 5 && (
        <section className="space-y-5">
          <div>
            <h2 className="h-display text-2xl">The numbers</h2>
            <p className="text-sm text-muted">Fill in what you know. Suggested factory figures are only saved for the rows you tick.</p>
          </div>
          <div className="panel space-y-4 p-5">
            <div className="flex flex-wrap items-end gap-3">
              <label className="min-w-40 flex-1 space-y-1.5"><span className="label">Trim</span><input className="input" value={trim} onChange={(e) => setTrim(e.target.value)} placeholder="e.g. Komfort" /></label>
              {integrations.anthropic && <button type="button" className="btn-ghost" disabled={lookup.state === "running"} onClick={runLookup}>{lookup.state === "running" ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} Suggest factory specs</button>}
            </div>
            {lookup.state === "error" && <p className="text-sm text-bad">{lookup.error}</p>}
            {lookup.state === "done" && lookup.data && (
              lookup.data.trims.length ? (
                <div className="space-y-2">
                  <div className="label">Which version is yours? (AI suggestion)</div>
                  <div className="flex flex-wrap gap-2">{lookup.data.trims.map((t) => <button key={t.name} type="button" onClick={() => pickTrim(t)} className={`rounded-lg border px-3 py-2 text-left text-sm ${trim === t.name ? "border-accent bg-accent/10" : "border-line"}`}><b>{t.name}</b>{t.horsepower ? <span className="block text-xs text-muted">{t.horsepower} hp{t.engine ? ` · ${t.engine}` : ""}</span> : null}</button>)}</div>
                </div>
              ) : <p className="text-sm text-muted">We couldn&apos;t find factory figures for this car. Fill in what you know.</p>
            )}
            <div className="space-y-2">
              {SPEC_ROWS.map(([k, label, type]) => (
                <div key={k} className={`grid grid-cols-[auto_minmax(110px,0.6fr)_minmax(0,1.4fr)] items-center gap-3 rounded-lg border px-3 py-2 ${specs[k].ok ? "border-accent/50" : "border-line"}`}>
                  <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" aria-label={`${label} is right`} checked={specs[k].ok} onChange={(e) => setSpecs((s) => ({ ...s, [k]: { ...s[k], ok: e.target.checked && !!s[k].v.trim() } }))} />
                  <span className="text-sm text-muted">{label}</span>
                  <input className="input !py-1.5" type={type} min={type === "number" ? 0 : undefined} step="any" value={specs[k].v} aria-label={label} onChange={(e) => setSpecs((s) => ({ ...s, [k]: { v: e.target.value, ok: !!e.target.value.trim() } }))} />
                </div>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {mods.some((m) => m.name.trim() && ["intake", "forced_induction", "engine", "tune", "exhaust"].includes(m.category)) && (
                <label className="space-y-1.5"><span className="label">Power now, with mods (hp)</span><input className="input" inputMode="numeric" value={powerNow} onChange={(e) => setPowerNow(e.target.value.replace(/\D/g, ""))} placeholder="Optional" /></label>
              )}
              <label className="space-y-1.5"><span className="label">Mileage</span><input className="input" inputMode="numeric" value={mileage} onChange={(e) => setMileage(e.target.value.replace(/\D/g, ""))} placeholder="Optional" /></label>
              <label className="space-y-1.5"><span className="label">Nickname</span><input className="input" value={nickname} maxLength={40} onChange={(e) => setNickname(e.target.value)} placeholder="Optional" /></label>
            </div>
          </div>
          <Nav back={() => setStep(4)} next={() => setStep(6)} />
        </section>
      )}

      {step === 6 && (
        <section className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => setSource("procedural")} className={`panel p-4 text-left ${source === "procedural" ? "border-accent shadow-[0_0_0_1px_var(--accent)]" : ""}`}>
              <div className="font-semibold">Built-in model</div>
              <p className="mt-1 text-sm text-muted">Your colours and aero on a stand-in body. Instant. Your photos lead the car page.</p>
            </button>
            <button type="button" disabled={!canAgent} onClick={() => setSource("agent")} className={`panel p-4 text-left disabled:opacity-50 ${source === "agent" ? "border-accent shadow-[0_0_0_1px_var(--accent)]" : ""}`}>
              <div className="font-semibold">Find a real model of my car</div>
              <p className="mt-1 text-sm text-muted">Uses a model from our library when we have your car, otherwise finds or builds one. You approve it before anyone else sees it.</p>
              {!canAgent && <div className="mt-2 font-mono text-[10px] uppercase text-warn">Not set up on this server yet</div>}
            </button>
          </div>
          <div className="panel p-5">
            <label className="block space-y-1.5"><span className="label">Who can see this car</span>
              <select className="input" value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}>
                <option value="public">Public: anyone, including QR scans</option><option value="friends">Friends only</option><option value="private">Only me</option>
              </select>
            </label>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div><dt className="label">Photos</dt><dd className="num">{photos.length}</dd></div>
              <div><dt className="label">Mods</dt><dd className="num">{mods.filter((m) => m.name.trim()).length}</dd></div>
              <div><dt className="label">Confirmed specs</dt><dd className="num">{SPEC_ROWS.filter(([k]) => specs[k].ok).length}</dd></div>
              <div><dt className="label">3D</dt><dd>{source === "agent" ? "Real model" : "Built-in"}</dd></div>
            </dl>
          </div>
          {error && <div className="rounded-xl border border-bad/40 bg-bad/10 p-4 text-sm text-bad" role="alert">{error}</div>}
          <div className="flex justify-between">
            <button type="button" className="btn-quiet" disabled={!!saving} onClick={() => setStep(5)}><ChevronLeft size={16} /> Back</button>
            <button type="button" className="btn-primary" disabled={!!saving} onClick={save}>{saving ? <><Loader2 className="animate-spin" size={16} /> {saving}</> : "Add to garage"}</button>
          </div>
        </section>
      )}
    </AccentScope>
  );
}
