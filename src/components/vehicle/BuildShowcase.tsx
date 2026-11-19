import { ExternalLink, Trophy } from "lucide-react";
import { getPath, SECTIONS, type BuildSheet } from "@/lib/build";
import type { Vehicle } from "@/lib/types";

/** Rows for one spec-sheet group, skipping anything not filled in. */
function rows(build: BuildSheet, sectionId: string) {
  const s = SECTIONS.find((x) => x.id === sectionId)!;
  return s.fields
    .filter((f) => f.type !== "textarea" && !["profile.tagline", "profile.status", "profile.insta", "profile.next"].includes(f.path))
    .map((f) => {
      const v = getPath(build, f.path);
      if (v == null || v === "") return null;
      const text = f.type === "month" ? new Date(`${v}-15`).toLocaleDateString(undefined, { year: "numeric", month: "long" }) : `${typeof v === "number" ? v.toLocaleString() : v}${f.unit && typeof v === "number" ? ` ${f.unit}` : ""}`;
      return [f.label, text] as const;
    })
    .filter(Boolean) as (readonly [string, string])[];
}

/** The full spec sheet: core details plus every build-sheet group the owner filled in. */
export function SpecSheet({ vehicle: v, totalHp }: { vehicle: Vehicle; totalHp: number }) {
  const b = v.build ?? {};
  const stock = b.specs?.stockHp as number | undefined;
  const core: [string, string | null][] = [
    ["Year", v.year?.toString() ?? null], ["Make", v.make], ["Model", v.model], ["Trim", v.trim], ["Engine", v.engine],
    ["Power", v.horsepower ? `${v.horsepower} hp${stock && v.horsepower > stock ? ` (factory ${stock} hp)` : totalHp ? ` (+${totalHp} hp from mods, owner-reported)` : ""}` : null],
    ["Transmission", v.transmission], ["Drivetrain", v.drivetrain], ["Exterior", v.exterior_color], ["Interior", v.interior_color],
    ["Mileage", v.mileage != null ? `${v.mileage.toLocaleString()} ${v.mileage_unit}` : null],
    ["Purchase price", b.price ? `$${Number(b.price).toLocaleString()}` : null],
  ];
  const groups = [{ title: "Overview", items: core.filter(([, x]) => x) as [string, string][] },
    ...SECTIONS.filter((s) => s.id !== "story").map((s) => ({ title: s.title, items: rows(b, s.id), note: (getPath(b, `${s.id}.notes`) as string | undefined) ?? null }))];
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {groups.filter((g) => g.items.length || ("note" in g && g.note)).map((g) => (
        <div key={g.title} className="panel p-5">
          <div className="label mb-3 text-accent">{g.title}</div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
            {g.items.map(([k, val]) => <div key={k}><dt className="label !text-[9px]">{k}</dt><dd className="font-medium">{val}</dd></div>)}
          </dl>
          {"note" in g && g.note && <p className="mt-3 whitespace-pre-line text-sm text-muted">{g.note}</p>}
        </div>
      ))}
      {b.flair?.length ? (
        <div className="panel p-5"><div className="label mb-3 text-accent">Custom touches</div><div className="flex flex-wrap gap-1.5">{b.flair.map((f) => <span key={f} className="chip">{f}</span>)}</div></div>
      ) : null}
    </div>
  );
}

/** Story and ownership, shown next to the spec sheet. */
export function StoryPanel({ vehicle: v }: { vehicle: Vehicle }) {
  const p = v.build?.profile ?? {};
  const own = rows(v.build ?? {}, "story");
  if (!v.description && !p.next && !own.length) return null;
  return (
    <div className="panel panel-accent space-y-4 p-6">
      {v.description && <div><div className="label mb-2">The story</div><p className="whitespace-pre-line leading-relaxed text-ink/90">{v.description}</p></div>}
      {p.next && <div><div className="label mb-1">What&apos;s next</div><p className="whitespace-pre-line text-sm text-ink/85">{String(p.next)}</p></div>}
      {own.length > 0 && <dl className="grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm">{own.map(([k, val]) => <div key={k}><dt className="label !text-[9px]">{k}</dt><dd>{val}</dd></div>)}</dl>}
    </div>
  );
}

/** Dyno runs (best highlighted), crew credits and links. */
export function ProofTab({ build }: { build: BuildSheet }) {
  const dyno = [...(build.dyno ?? [])].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  const best = Math.max(0, ...dyno.map((d) => d.whp));
  const nothing = !dyno.length && !build.crew?.length && !build.links?.length;
  if (nothing) return <p className="text-sm text-muted">No dyno sheets, credits or links yet.</p>;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {dyno.length > 0 && (
        <div className="panel p-5">
          <div className="mb-3 flex items-baseline justify-between"><div className="label text-accent">Dyno</div><div className="num text-sm">Best {best} whp</div></div>
          <ul className="space-y-3">
            {dyno.map((d) => (
              <li key={d.id}>
                <div className="flex items-baseline justify-between gap-3"><div className="min-w-0"><div className="truncate font-medium">{d.setup || "Dyno run"}</div><div className="truncate text-xs text-muted">{[d.date && new Date(d.date).toLocaleDateString(), d.shop, d.fuel].filter(Boolean).join(" · ")}</div></div><div className={`num shrink-0 text-xl ${d.whp === best ? "text-accent" : ""}`}>{d.whp} whp</div></div>
                <div className="mt-1.5 h-2 overflow-hidden rounded bg-surface-3" role="img" aria-label={`${d.whp} wheel horsepower`}><div className={`h-full ${d.whp === best ? "bg-accent shadow-[0_0_10px_var(--accent)]" : "bg-white/30"}`} style={{ width: `${best ? (d.whp / best) * 100 : 0}%` }} /></div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {build.links?.length ? (
        <div className="panel divide-y divide-line">
          <div className="label px-5 py-3 text-accent">Videos & links</div>
          {build.links.map((l) => (
            <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer nofollow ugc" className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-surface-2">
              <div className="min-w-0"><div className="truncate font-medium">{l.title}</div><div className="truncate text-xs text-muted">{[l.kind, new URL(l.url).hostname.replace(/^www\./, "")].filter(Boolean).join(" · ")}</div></div>
              <ExternalLink size={16} className="shrink-0 text-muted" />
            </a>
          ))}
        </div>
      ) : null}
      {build.crew?.length ? (
        <div className="panel p-5 lg:col-span-2">
          <div className="label mb-3 text-accent">The crew</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{build.crew.map((c) => <div key={c.id} className="rounded-lg border border-line p-3"><div className="label !text-[9px]">{c.role ?? "Shout-out"}</div><div className="font-semibold">{c.name}</div>{c.what && <div className="text-sm text-muted">{c.what}</div>}{c.handle && <div className="font-mono text-xs text-accent">{c.handle}</div>}</div>)}</div>
        </div>
      ) : null}
    </div>
  );
}

export const AwardIcon = Trophy;
