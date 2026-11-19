"use client";
/* eslint-disable @next/next/no-img-element */
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CalendarPlus, Pencil, Plus, QrCode, Wrench, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { accentFromPaint } from "@/lib/color";
import { vehicleName, type Units } from "@/lib/units";
import { MOD_CATEGORIES, type BuildEvent, type Drive, type ModCategory, type Modification, type Profile, type Vehicle, type VehiclePhoto } from "@/lib/types";
import { Avatar } from "@/components/ui/Avatar";
import { Modal } from "@/components/ui/Modal";
import { CATEGORY_PART, PART_LABEL, VIEWS, type ViewId, STUDIO_CAR_CREDIT } from "@/components/three/parts";
import type { ViewRequest } from "@/components/three/VehicleViewer";
import { ProofTab, SpecSheet, StoryPanel } from "@/components/vehicle/BuildShowcase";
import { ModEditor } from "./ModEditor";
import { QrCard } from "./QrCard";
import { LifetimeStats, type PublicStats } from "./LifetimeStats";
import { PhotoGallery } from "./PhotoGallery";
import { ModelStatus } from "./ModelStatus";

const VehicleViewer = dynamic(() => import("@/components/three/VehicleViewer"), {
  ssr: false, loading: () => <div className="grid h-full place-items-center font-mono text-xs tracking-widest text-muted">INITIALISING RENDERER…</div>,
});

const catLabel = (c: string) => MOD_CATEGORIES.find((m) => m.id === c)?.label ?? c;
// Which categories belong to a clicked part / pin.
const PART_CATS: Record<string, ModCategory[]> = {
  ...Object.fromEntries(Object.entries(CATEGORY_PART).map(([cat, part]) => [part, [cat as ModCategory]])),
  engine_bay: ["intake", "forced_induction", "engine", "tune"],
  interior: ["interior", "other"],
  drivetrain: ["drivetrain"],
};

interface Props {
  vehicle: Vehicle; owner: Profile; mods: Modification[]; photos: VehiclePhoto[]; events: BuildEvent[];
  publicStats: PublicStats | null; drives: Drive[] | null; isOwner: boolean; viewerId: string | null; units: Units; siteUrl: string;
  integrations: Record<string, boolean>;
}

export function VehicleProfile({ vehicle: v, owner, mods, photos, events, publicStats, drives, isOwner, units, siteUrl }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<"mods" | "specs" | "proof" | "photos" | "stats" | "history">("mods");
  const [part, setPart] = useState<string | null>(null);
  const [view, setView] = useState<ViewRequest>({ id: "front3q", n: 0 });
  const [editMod, setEditMod] = useState<{ mod: Modification | null; cat?: ModCategory } | null>(null);
  const [qr, setQr] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const accent = accentFromPaint(v.model_config?.paint ?? v.exterior_color_hex);
  const name = vehicleName(v);
  const installed = useMemo(() => mods.filter((m) => m.status !== "planned"), [mods]);
  const wishlist = useMemo(() => mods.filter((m) => m.status === "planned"), [mods]);
  const totalHp = installed.reduce((s, m) => s + (m.hp_gain ?? 0), 0);
  const spend = installed.filter((m) => isOwner || m.show_cost).reduce((s, m) => s + Number(m.cost ?? 0), 0);
  // A real model is shown only once the owner approves it (the owner sees it while reviewing).
  const realModel = !!v.model_url && (v.model_approved || isOwner);
  const heroPhotos = useMemo(() => {
    const order = ["front_3q", "rear_3q", "side", "front", "rear", "interior", "engine", "detail", "other"];
    return photos.filter((p) => !p.modification_id).sort((a, b) => order.indexOf(a.angle) - order.indexOf(b.angle));
  }, [photos]);
  // Without an approved real model, the owner's own photos lead; the stand-in 3D is one tap away.
  const [stage, setStage] = useState<"photos" | "3d">(() => (!realModel && heroPhotos.length ? "photos" : "3d"));
  const [heroIdx, setHeroIdx] = useState(0);
  const tagline = v.build?.profile?.tagline as string | undefined, buildStyle = v.build?.profile?.status as string | undefined;

  const partMods = useMemo(() => (part ? mods.filter((m) => PART_CATS[part]?.includes(m.category)) : []), [part, mods]);
  const refresh = () => router.refresh();

  const timeline = useMemo(() => {
    const items: { date: string; kind: string; title: string; body?: string | null; mod?: Modification }[] = [
      ...events.map((e) => ({ date: e.event_date, kind: e.kind, title: e.title, body: e.description })),
      ...installed.map((m) => ({ date: m.installed_on ?? m.created_at.slice(0, 10), kind: "mod", title: [m.brand, m.name].filter(Boolean).join(" "), body: catLabel(m.category), mod: m })),
      { date: v.created_at.slice(0, 10), kind: "milestone", title: "Added to RevMatch" },
    ];
    return items.sort((a, b) => a.date.localeCompare(b.date));
  }, [events, installed, v.created_at]);

  return (
    <div className="-mx-4 -mt-5 lg:-mx-8 lg:-mt-8">
      {/* Magazine hero */}
      <header className="relative isolate overflow-hidden">
        {v.cover_photo_url ? (
          <img src={v.cover_photo_url} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover opacity-45" />
        ) : <div className="carbon absolute inset-0 -z-10" />}
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-bg via-bg/70 to-bg/20" />
        <div className="speed-lines absolute inset-0 -z-10" />
        <div className="mx-auto max-w-6xl px-4 pb-8 pt-16 sm:pt-24 lg:px-8">
          <div className="rise flex flex-wrap items-center gap-2">
            <span className="chip-accent">{v.year ?? "—"} · {v.make}</span>
            {v.visibility !== "public" && <span className="chip">{v.visibility === "friends" ? "Friends only" : "Private"}</span>}
            {buildStyle && <span className="chip">{buildStyle}</span>}
            {installed.length > 0 && <span className="chip">{installed.length} mods</span>}
          </div>
          <h1 className="rise rise-1 h-display mt-3 text-5xl leading-[0.9] sm:text-7xl">
            {v.nickname ? <>{v.nickname}<span className="block text-2xl text-muted sm:text-3xl">{name}</span></> : <>{v.model}{v.trim && <span className="text-accent glow-text"> {v.trim}</span>}</>}
          </h1>
          {tagline && <p className="rise rise-2 mt-3 max-w-2xl text-lg text-ink/90">{tagline}</p>}
          <div className="rise rise-2 mt-6 grid max-w-3xl grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
            {[["Power", v.horsepower ? `${v.horsepower + totalHp}` : "—", v.horsepower ? "hp" : ""], ["Engine", v.engine ?? "—", ""], ["Gearbox", v.transmission ?? "—", ""], ["Layout", v.drivetrain ?? "—", ""]].map(([l, val, u]) => (
              <div key={l} className="bg-surface/90 p-3 backdrop-blur"><div className="label">{l}</div><div className="num mt-0.5 truncate text-lg font-semibold">{val} <span className="text-xs text-muted">{u}</span></div></div>
            ))}
          </div>
          <div className="rise rise-3 mt-5 flex flex-wrap items-center gap-3">
            <Link href={`/u/${owner.username}`} className="flex items-center gap-2 rounded-full border border-line bg-black/40 py-1 pl-1 pr-3 text-sm hover:border-accent/50">
              <Avatar url={owner.avatar_url} name={owner.display_name ?? owner.username} size={28} /> @{owner.username}
            </Link>
            {isOwner && <>
              <Link href={`/garage/${v.id}/edit`} className="btn-ghost !py-2"><Pencil size={14} /> Edit</Link>
              <button type="button" className="btn-ghost !py-2" onClick={() => setEditMod({ mod: null })}><Plus size={14} /> Mod</button>
            </>}
            <button type="button" className="btn-ghost !py-2" onClick={() => setQr(true)}><QrCode size={14} /> QR</button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-4 lg:px-8">
        {isOwner && <ModelStatus vehicle={v} />}

        {heroPhotos.length > 0 && !realModel && (
          <div className="flex gap-1" role="tablist" aria-label="Show">
            <button type="button" role="tab" aria-selected={stage === "photos"} className="tab" data-on={stage === "photos"} onClick={() => setStage("photos")}>Photos</button>
            <button type="button" role="tab" aria-selected={stage === "3d"} className="tab" data-on={stage === "3d"} onClick={() => setStage("3d")}>3D preview (stand-in)</button>
          </div>
        )}
        {stage === "photos" && heroPhotos.length > 0 && (
          <section className="panel relative overflow-hidden" aria-label="Photos of this car">
            <img src={heroPhotos[heroIdx % heroPhotos.length].url} alt={heroPhotos[heroIdx % heroPhotos.length].caption ?? `${name} photo`} className="h-[58vh] min-h-[340px] w-full bg-black object-contain" />
            {heroPhotos.length > 1 && (
              <div className="absolute inset-x-0 bottom-0 flex gap-2 overflow-x-auto bg-gradient-to-t from-black/80 to-transparent p-3">
                {heroPhotos.map((p, i) => (
                  <button key={p.id} type="button" aria-label={`Photo ${i + 1}`} aria-current={i === heroIdx % heroPhotos.length} onClick={() => setHeroIdx(i)}
                    className={`h-14 w-20 shrink-0 overflow-hidden rounded-md border-2 ${i === heroIdx % heroPhotos.length ? "border-accent" : "border-transparent opacity-70"}`}>
                    <img src={p.url} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {/* 3D stage */}
        <section className={`panel relative overflow-hidden ${stage === "3d" ? "" : "hidden"}`}>
          <VehicleViewer bodyStyle={v.body_style} config={v.model_config ?? {}} accent={accent}
            modelUrl={realModel ? v.model_url : null} assembly={realModel ? v.model_assembly : null} mods={mods.map((m) => ({ id: m.id, category: m.category, name: m.name }))}
            selected={part} onSelect={(p) => setPart(p || null)} view={view} className="relative h-[58vh] min-h-[340px] w-full" />
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
            <div className="pointer-events-auto flex max-w-full gap-1 overflow-x-auto rounded-lg border border-line bg-black/60 p-1 backdrop-blur">
              {(Object.keys(VIEWS) as ViewId[]).map((id) => (
                <button key={id} type="button" onClick={() => setView({ id, n: view.n + 1 })} className="tab shrink-0 !px-2 !py-1" data-on={view.id === id}>{VIEWS[id].label}</button>
              ))}
            </div>
            <div className="chip hidden shrink-0 bg-black/60 sm:inline-flex">
              {realModel ? (v.model_source === "ai" ? "AI-generated approximation" : v.model_source === "agent" ? "Assembled from licensed models" : "Library model") + (v.model_approved ? "" : " · waiting for your review")
                : v.model_config?.representation === "parametric" ? "Parametric model" : "Studio stand-in · not exact shape"}
            </div>
          </div>
          <div className="pointer-events-none absolute bottom-3 left-3 hidden max-w-[48%] truncate font-mono sm:block text-[10px] uppercase tracking-widest text-muted">Drag to orbit · pinch or scroll to zoom · right-drag or two-finger drag to pan · tap a part</div>
          {(realModel ? v.model_attribution : v.model_config?.representation !== "parametric" ? STUDIO_CAR_CREDIT : null) && (
            <div className="absolute bottom-3 right-3 max-w-[48%] truncate text-right text-[10px] text-dim" title={(realModel ? v.model_attribution : STUDIO_CAR_CREDIT) ?? ""}>
              {realModel ? v.model_attribution : STUDIO_CAR_CREDIT}
            </div>
          )}

          {/* Part panel */}
          {part && (
            <aside className="rise absolute inset-x-2 bottom-2 z-20 max-h-[70%] overflow-y-auto rounded-xl border border-accent/40 bg-surface/95 p-4 backdrop-blur sm:inset-x-auto sm:right-3 sm:top-14 sm:bottom-auto sm:w-96">
              <div className="flex items-start justify-between gap-3">
                <div><div className="label text-accent">Selected part</div><div className="h-display text-2xl">{PART_LABEL[part] ?? part}</div></div>
                <button type="button" className="btn-quiet !p-1.5" aria-label="Close" onClick={() => setPart(null)}><X size={16} /></button>
              </div>
              {partMods.length === 0 ? (
                <p className="mt-3 text-sm text-muted">Factory spec, with no modifications logged for this part.</p>
              ) : partMods.map((m) => <ModDetail key={m.id} m={m} photos={photos.filter((p) => p.modification_id === m.id)} isOwner={isOwner} onEdit={() => setEditMod({ mod: m })} />)}
              {isOwner && <button type="button" className="btn-ghost mt-4 w-full" onClick={() => setEditMod({ mod: null, cat: PART_CATS[part]?.[0] })}><Wrench size={14} /> Log a mod here</button>}
            </aside>
          )}
        </section>

        {/* Tabs */}
        <nav className="flex gap-1 overflow-x-auto border-b border-line">
          {([["mods", `Mods · ${installed.length}`], ["specs", "Spec sheet"], ["proof", "Dyno & links"], ["photos", `Photos · ${photos.length}`], ["stats", "Stats"], ["history", "Build history"]] as const).map(([id, l]) => (
            <button key={id} type="button" className="tab shrink-0" data-on={tab === id} onClick={() => setTab(id)}>{l}</button>
          ))}
        </nav>

        <section className="pb-10">
          {tab === "specs" && (
            <div className="space-y-6">
              <StoryPanel vehicle={v} />
              <SpecSheet vehicle={v} totalHp={totalHp} />
            </div>
          )}
          {tab === "proof" && <ProofTab build={v.build ?? {}} />}

          {tab === "mods" && (
            <div className="space-y-4">
              {(totalHp > 0 || spend > 0) && (
                <div className="flex flex-wrap gap-6 text-sm">
                  {totalHp > 0 && <div><span className="label">Reported gains</span> <span className="num text-lg text-accent">+{totalHp} hp</span></div>}
                  {spend > 0 && <div><span className="label">{isOwner ? "Total invested" : "Disclosed spend"}</span> <span className="num text-lg">{spend.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 })}</span></div>}
                </div>
              )}
              {installed.length === 0 && <p className="text-sm text-muted">No modifications logged yet.</p>}
              <div className="grid gap-3 md:grid-cols-2">
                {installed.map((m) => (
                  <button key={m.id} type="button" onClick={() => { const p = CATEGORY_PART[m.category] ?? Object.entries(PART_CATS).find(([, cs]) => cs.includes(m.category))?.[0]; if (p) setPart(p); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                    className="panel group flex gap-4 p-4 text-left transition hover:border-accent/50">
                    {photos.find((p) => p.modification_id === m.id) ? <img src={photos.find((p) => p.modification_id === m.id)!.url} alt="" className="h-20 w-24 shrink-0 rounded-lg object-cover" /> : <div className="carbon grid h-20 w-24 shrink-0 place-items-center rounded-lg"><Wrench className="text-accent" size={20} /></div>}
                    <div className="min-w-0 flex-1">
                      <div className="label text-accent">{catLabel(m.category)}</div>
                      <div className="truncate font-semibold">{m.name}</div>
                      <div className="truncate text-sm text-muted">{[m.brand, m.product].filter(Boolean).join(" · ") || "—"}</div>
                      <div className="mt-1 flex gap-3 font-mono text-[11px] text-dim">
                        {m.installed_on && <span>{new Date(m.installed_on).toLocaleDateString()}</span>}
                        {m.hp_gain ? <span className="text-accent">+{m.hp_gain} hp</span> : null}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
          {tab === "mods" && wishlist.length > 0 && (
            <div className="mt-8">
              <div className="label mb-3">Wishlist · {wishlist.length}</div>
              <div className="panel divide-y divide-line">
                {wishlist.map((m) => (
                  <button key={m.id} type="button" disabled={!isOwner} onClick={() => setEditMod({ mod: m })} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left enabled:hover:bg-surface-2">
                    <div className="min-w-0"><div className="truncate font-medium">{m.name}</div><div className="truncate text-xs text-muted">{[catLabel(m.category), m.brand].filter(Boolean).join(" · ")}</div></div>
                    {(isOwner || m.show_cost) && m.cost != null && <span className="num text-sm">${Number(m.cost).toLocaleString()}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {tab === "photos" && <PhotoGallery photos={photos} vehicle={v} mods={mods} isOwner={isOwner} />}
          {tab === "stats" && <LifetimeStats drives={drives} publicStats={publicStats} units={units} />}

          {tab === "history" && (
            <div>
              {isOwner && <button type="button" className="btn-ghost mb-5" onClick={() => setEventOpen(true)}><CalendarPlus size={16} /> Add milestone</button>}
              <ol className="relative ml-3 border-l border-line">
                {timeline.map((t, i) => (
                  <li key={i} className="rise mb-6 ml-6" style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}>
                    <span className={`absolute -left-[7px] mt-1.5 h-3.5 w-3.5 rounded-full border-2 border-bg ${t.kind === "mod" || t.kind === "award" ? "bg-accent shadow-[0_0_10px_var(--accent)]" : "bg-surface-3"}`} />
                    <div className="font-mono text-[11px] text-muted">{new Date(t.date).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })} · {t.kind}</div>
                    <div className="font-semibold">{t.title}</div>
                    {t.body && <div className="text-sm text-muted">{t.body}</div>}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>
      </div>

      {editMod && <ModEditor open onClose={() => setEditMod(null)} vehicle={v} mod={editMod.mod} defaultCategory={editMod.cat} onSaved={refresh} />}
      <Modal open={qr} onClose={() => setQr(false)} title="Vehicle QR"><QrCard slug={v.slug} siteUrl={siteUrl} name={name} accent={accent} /></Modal>
      {isOwner && <EventModal open={eventOpen} onClose={() => setEventOpen(false)} vehicle={v} onSaved={refresh} />}
    </div>
  );
}

function ModDetail({ m, photos, isOwner, onEdit }: { m: Modification; photos: VehiclePhoto[]; isOwner: boolean; onEdit: () => void }) {
  return (
    <div className="mt-4 border-t border-line pt-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold">{m.name}</div>
          <div className="text-sm text-muted">{[m.brand, m.product].filter(Boolean).join(" · ")}</div>
        </div>
        {isOwner && <button type="button" className="btn-quiet !p-1.5" aria-label="Edit" onClick={onEdit}><Pencil size={14} /></button>}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div><dt className="label">Installed</dt><dd>{m.installed_on ? new Date(m.installed_on).toLocaleDateString() : "—"}</dd></div>
        {(isOwner || m.show_cost) && m.cost != null && <div><dt className="label">Cost</dt><dd className="num">${Number(m.cost).toLocaleString()}</dd></div>}
        {m.hp_gain != null && <div><dt className="label">Power</dt><dd className="num text-accent">+{m.hp_gain} hp</dd></div>}
      </dl>
      {m.performance_notes && <p className="mt-2 text-xs text-muted"><span className="label">Impact </span>{m.performance_notes}</p>}
      {m.description && <p className="mt-2 text-sm text-ink/85">{m.description}</p>}
      {photos.length > 0 && <div className="mt-3 flex gap-2 overflow-x-auto">{photos.map((p) => <img key={p.id} src={p.url} alt="" className="h-20 rounded-lg object-cover" />)}</div>}
    </div>
  );
}

function EventModal({ open, onClose, vehicle, onSaved }: { open: boolean; onClose: () => void; vehicle: Vehicle; onSaved: () => void }) {
  const [f, setF] = useState({ title: "", kind: "milestone", event_date: new Date().toISOString().slice(0, 10), description: "", mileage: "", is_private: false });
  const [err, setErr] = useState<string | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await createClient().from("build_events").insert({ ...f, mileage: f.mileage ? +f.mileage : null, description: f.description || null, vehicle_id: vehicle.id, owner_id: vehicle.owner_id });
    if (error) setErr(error.message); else { onSaved(); onClose(); setF({ ...f, title: "", description: "" }); }
  }
  return (
    <Modal open={open} onClose={onClose} title="Add milestone">
      <form onSubmit={save} className="space-y-3">
        <input className="input" required placeholder="Title (e.g. First track day at Laguna Seca)" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <div className="grid grid-cols-3 gap-2">
          <select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
            <option value="purchase">Purchase</option><option value="service">Service</option><option value="milestone">Milestone</option><option value="track">Track day / lap time</option><option value="show">Show / meet</option><option value="award">Award</option>
          </select>
          <input type="date" className="input" value={f.event_date} onChange={(e) => setF({ ...f, event_date: e.target.value })} />
          <input className="input" inputMode="numeric" placeholder="Mileage" value={f.mileage} onChange={(e) => setF({ ...f, mileage: e.target.value })} />
        </div>
        <textarea className="input min-h-20" placeholder="Details" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-[var(--accent)]" checked={f.is_private} onChange={(e) => setF({ ...f, is_private: e.target.checked })} /> Only me (keep off the public timeline)</label>
        {err && <p className="text-sm text-bad">{err}</p>}
        <button className="btn-primary w-full">Save</button>
      </form>
    </Modal>
  );
}
