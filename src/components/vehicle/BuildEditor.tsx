"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { getPath, RECORDS, SECTIONS, setPath, safeUrl, type BuildSheet, type Field, type RecordKind } from "@/lib/build";
import { uid } from "@/lib/image";

/** One input for a build-sheet field. */
function Input({ f, value, onChange, id }: { f: Field; value: unknown; onChange: (v: unknown) => void; id: string }) {
  const v = value == null ? "" : String(value);
  const common = { id, className: "input", value: v, placeholder: f.ph, "aria-label": f.label };
  if (f.type === "select") return (
    <select {...common} onChange={(e) => onChange(e.target.value || null)}><option value="">—</option>{f.opts!.map((o) => <option key={o}>{o}</option>)}</select>
  );
  if (f.type === "textarea") return <textarea {...common} className="input min-h-20" maxLength={f.max ?? 3000} onChange={(e) => onChange(e.target.value || null)} />;
  const input = (
    <input {...common} type={f.type === "number" ? "number" : f.type === "month" ? "month" : f.type === "date" ? "date" : f.type === "url" ? "url" : "text"}
      step={f.step} min={f.type === "number" ? 0 : undefined} maxLength={f.type === "text" ? f.max ?? 120 : undefined}
      onChange={(e) => onChange(e.target.value === "" ? null : f.type === "number" ? Number(e.target.value) : e.target.value)} />
  );
  return f.unit ? <div className="relative">{input}<span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[11px] text-muted">{f.unit}</span></div> : input;
}

export function BuildSections({ build, onChange }: { build: BuildSheet; onChange: (b: BuildSheet) => void }) {
  const [open, setOpen] = useState(SECTIONS[0].id);
  return (
    <div className="grid gap-5 lg:grid-cols-[200px_minmax(0,1fr)]">
      <nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="Build sheet sections">
        {SECTIONS.map((s) => {
          const filled = s.fields.filter((f) => getPath(build, f.path) != null).length;
          return (
            <button key={s.id} type="button" aria-current={open === s.id} onClick={() => setOpen(s.id)}
              className={`flex shrink-0 items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm ${open === s.id ? "bg-accent/15 text-ink" : "text-muted hover:text-ink"}`}>
              {s.title}{filled > 0 && <span className="font-mono text-[10px] text-accent">{filled}</span>}
            </button>
          );
        })}
      </nav>
      {SECTIONS.filter((s) => s.id === open).map((s) => (
        <div key={s.id} className="panel p-5">
          <h2 className="h-display text-2xl">{s.title}</h2>
          {s.hint && <p className="mt-1 text-sm text-muted">{s.hint}</p>}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {s.fields.map((f) => (
              <label key={f.path} htmlFor={`b-${f.path}`} className={`space-y-1.5 ${f.span ? "sm:col-span-2" : ""}`}>
                <span className="label">{f.label}</span>
                <Input id={`b-${f.path}`} f={f} value={getPath(build, f.path)} onChange={(v) => onChange(setPath(build, f.path, v))} />
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function RecordList({ kind, items, onChange }: { kind: RecordKind; items: Record<string, unknown>[]; onChange: (items: Record<string, unknown>[]) => void }) {
  const blank = () => ({ id: uid() });
  const [form, setForm] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  function submit() {
    const missing = kind.fields.find((f) => f.req && (form?.[f.path] == null || form?.[f.path] === ""));
    if (missing) { setErr(`Fill in “${missing.label}” first.`); return; }
    if (kind.id === "links" && !safeUrl(String(form!.url))) { setErr("Use a full link that starts with https://"); return; }
    const exists = items.some((x) => x.id === form!.id);
    onChange(exists ? items.map((x) => (x.id === form!.id ? form! : x)) : [...items, form!]);
    setForm(null); setErr(null);
  }
  const title = (r: Record<string, unknown>) => kind.id === "dyno" ? `${r.whp} whp` : String(r.name ?? r.title ?? "");
  const sub = (r: Record<string, unknown>) => kind.fields.filter((f) => !["whp", "name", "title"].includes(f.path)).map((f) => r[f.path]).filter(Boolean).join(" · ");
  return (
    <div className="panel space-y-3 p-5">
      <div className="flex items-center justify-between"><h3 className="h-display text-xl">{kind.title}</h3><span className="label">{items.length || ""}</span></div>
      {!items.length && !form && <p className="text-sm text-muted">{kind.empty}</p>}
      {items.map((r) => (
        <div key={String(r.id)} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2">
          <div className="min-w-0"><div className="truncate font-medium">{title(r)}</div><div className="truncate text-xs text-muted">{sub(r)}</div></div>
          <div className="flex shrink-0 gap-1">
            <button type="button" className="btn-quiet !px-2 !py-1 text-xs" onClick={() => { setForm({ ...r }); setErr(null); }}>Edit</button>
            <button type="button" className="btn-quiet !p-1.5" aria-label={`Remove ${title(r)}`} onClick={() => onChange(items.filter((x) => x.id !== r.id))}><Trash2 size={14} /></button>
          </div>
        </div>
      ))}
      {form ? (
        <div className="space-y-3 rounded-lg border border-accent/40 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {kind.fields.map((f) => (
              <label key={f.path} htmlFor={`r-${kind.id}-${f.path}`} className="space-y-1.5"><span className="label">{f.label}{f.req ? " *" : ""}</span>
                <Input id={`r-${kind.id}-${f.path}`} f={f} value={form[f.path]} onChange={(v) => setForm({ ...form, [f.path]: v })} />
              </label>
            ))}
          </div>
          {err && <p className="text-sm text-bad" role="alert">{err}</p>}
          <div className="flex gap-2"><button type="button" className="btn-primary !py-2" onClick={submit}>Save</button><button type="button" className="btn-quiet" onClick={() => { setForm(null); setErr(null); }}>Cancel</button></div>
        </div>
      ) : <button type="button" className="btn-ghost !py-2" onClick={() => setForm(blank())}><Plus size={14} /> {kind.add}</button>}
    </div>
  );
}

export function BuildRecords({ build, onChange }: { build: BuildSheet; onChange: (b: BuildSheet) => void }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {RECORDS.map((k) => (
        <RecordList key={k.id} kind={k} items={(build[k.id] ?? []) as Record<string, unknown>[]} onChange={(items) => onChange({ ...build, [k.id]: items })} />
      ))}
      <div className="panel p-5 text-sm text-muted lg:col-span-2">Milestones, service, track days, shows and awards go on the build timeline: use <b className="text-ink">Add milestone</b> on the car page.</div>
    </div>
  );
}

export interface PrivateDetails { vin: string | null; plate: string | null; purchase_price: number | null; budget: number | null; notes: string | null }

export function PrivacyCosts({ build, onBuild, priv, onPriv }: { build: BuildSheet; onBuild: (b: BuildSheet) => void; priv: PrivateDetails; onPriv: (p: PrivateDetails) => void }) {
  const p = build.privacy ?? {};
  const setP = (k: keyof NonNullable<BuildSheet["privacy"]>, v: boolean) => onBuild({ ...build, privacy: { ...p, [k]: v } });
  const num = (v: string) => (v === "" ? null : Number(v));
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="panel space-y-4 p-5">
        <h3 className="h-display text-xl">Private details</h3>
        <p className="text-sm text-muted">Only you can see these. They&apos;re stored separately from your car page.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5"><span className="label">VIN</span><input className="input font-mono uppercase" maxLength={17} value={priv.vin ?? ""} onChange={(e) => onPriv({ ...priv, vin: e.target.value.toUpperCase() || null })} /></label>
          <label className="space-y-1.5"><span className="label">Licence plate</span><input className="input uppercase" maxLength={12} value={priv.plate ?? ""} onChange={(e) => onPriv({ ...priv, plate: e.target.value.toUpperCase() || null })} /></label>
          <label className="space-y-1.5"><span className="label">Purchase price (USD)</span><input className="input" type="number" min={0} value={priv.purchase_price ?? ""} onChange={(e) => onPriv({ ...priv, purchase_price: num(e.target.value) })} /></label>
          <label className="space-y-1.5"><span className="label">Build budget (USD)</span><input className="input" type="number" min={0} value={priv.budget ?? ""} onChange={(e) => onPriv({ ...priv, budget: num(e.target.value) })} /></label>
          <label className="space-y-1.5 sm:col-span-2"><span className="label">Private notes</span><textarea className="input min-h-20" maxLength={4000} value={priv.notes ?? ""} onChange={(e) => onPriv({ ...priv, notes: e.target.value || null })} /></label>
        </div>
      </div>
      <div className="panel space-y-3 p-5">
        <h3 className="h-display text-xl">What people can see</h3>
        <p className="text-sm text-muted">Who can see the car at all is on the Details tab. Mod costs are shown per mod, when you tick &ldquo;public&rdquo; on each one.</p>
        {([["showPrice", "Show the purchase price on the car page"], ["hideLocation", "Hide where it's based"], ["hideMileage", "Hide mileage"]] as const).map(([k, l]) => (
          <label key={k} className="flex items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={!!p[k]} onChange={(e) => setP(k, e.target.checked)} /> {l}</label>
        ))}
        <p className="pt-2 text-xs text-dim">Your VIN and plate are never shown publicly.</p>
      </div>
    </div>
  );
}
