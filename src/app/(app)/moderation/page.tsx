import { notFound } from "next/navigation";
import { requireViewer } from "@/lib/viewer";
import { relTime } from "@/lib/units";
import { ModerationQueue, type QueueItem } from "./ModerationQueue";

export const metadata = { title: "Moderation" };

/** Open reports with a preview of what was reported. Moderators only. */
export default async function Page() {
  const { supabase, profile } = await requireViewer();
  if (!profile.is_moderator) notFound();
  const { data: reports } = await supabase.from("reports").select("id, target_kind, target_id, target_owner_id, reason, details, created_at, reporter:profiles!reports_reporter_id_fkey(username)")
    .eq("status", "open").order("created_at").limit(100);
  const rows = (reports ?? []) as unknown as (Omit<QueueItem, "preview" | "owner" | "count"> & { reporter: { username: string } | null })[];
  // Group duplicates: one item per reported thing.
  const byTarget = new Map<string, QueueItem>();
  for (const r of rows) {
    const k = `${r.target_kind}:${r.target_id}`;
    const it = byTarget.get(k);
    if (it) { it.count++; it.reasons.push(r.reason); continue; }
    byTarget.set(k, { ...r, reporter: r.reporter?.username ?? null, reasons: [r.reason], count: 1, preview: null, owner: null });
  }
  const items = [...byTarget.values()];
  const ids = (kind: string) => items.filter((i) => i.target_kind === kind).map((i) => i.target_id);
  const [posts, comments, vehicles, photos, owners, errors, failedJobs] = await Promise.all([
    ids("post").length ? supabase.from("posts").select("id, body, image_url").in("id", ids("post")) : { data: [] },
    ids("comment").length ? supabase.from("post_comments").select("id, body").in("id", ids("comment")) : { data: [] },
    ids("vehicle").length ? supabase.from("vehicles").select("id, slug, year, make, model, nickname, description").in("id", ids("vehicle")) : { data: [] },
    ids("photo").length ? supabase.from("vehicle_photos").select("id, url").in("id", ids("photo")) : { data: [] },
    supabase.from("profiles").select("id, username, display_name, bio, suspended_at").in("id", [...new Set(items.map((i) => i.target_owner_id).filter(Boolean) as string[])]),
    supabase.from("error_events").select("id, at, source, message, path, digest").order("at", { ascending: false }).limit(25),
    supabase.from("jobs").select("id", { count: "exact", head: true }).eq("status", "failed"),
  ]);
  type Err = { id: string; at: string; source: string; message: string; path: string | null; digest: string | null };
  for (const it of items) {
    const find = <T extends { id: string }>(list: T[] | null) => list?.find((x) => x.id === it.target_id);
    const o = owners.data?.find((x) => x.id === it.target_owner_id);
    it.owner = o ? { username: o.username, suspended: !!o.suspended_at } : null;
    if (it.target_kind === "post") { const p = find(posts.data as { id: string; body: string | null; image_url: string | null }[]); it.preview = p ? { text: p.body, image: p.image_url } : null; }
    if (it.target_kind === "comment") { const c = find(comments.data as { id: string; body: string }[]); it.preview = c ? { text: c.body } : null; }
    if (it.target_kind === "vehicle") { const v = find(vehicles.data as { id: string; slug: string; year: number | null; make: string; model: string; nickname: string | null; description: string | null }[]); it.preview = v ? { text: `${v.nickname ?? ""} ${v.year ?? ""} ${v.make} ${v.model}\n${v.description ?? ""}`.trim(), link: `/v/${v.slug}` } : null; }
    if (it.target_kind === "photo") { const ph = find(photos.data as { id: string; url: string }[]); it.preview = ph ? { image: ph.url } : null; }
    if (it.target_kind === "profile") it.preview = o ? { text: [o.display_name, o.bio].filter(Boolean).join("\n"), link: `/u/${o.username}` } : null;
  }
  return (
    <div className="space-y-5">
      <div><div className="label text-accent">Moderation</div><h1 className="h-display text-3xl">Reports</h1><p className="text-sm text-muted">{items.length ? `${items.length} open` : "Nothing waiting."} Reporters stay anonymous to the people they report.</p></div>
      <ModerationQueue items={items} />
      <section className="panel">
        <div className="flex items-baseline justify-between px-5 py-3"><h2 className="h-display text-xl">Recent errors</h2><span className="text-xs text-muted">Last 30 days are kept{failedJobs.count ? ` · ${failedJobs.count} failed background jobs` : ""}</span></div>
        {!(errors.data ?? []).length ? <p className="px-5 pb-5 text-sm text-muted">No errors recorded. (Needs SUPABASE_SERVICE_ROLE_KEY on the server to record them.)</p> : (
          <ul className="divide-y divide-line">
            {(errors.data as Err[]).map((e) => (
              <li key={e.id} className="px-5 py-2.5 text-sm">
                <div className="flex items-baseline gap-2"><span className="chip !py-0">{e.source}</span><span className="min-w-0 flex-1 truncate font-medium">{e.message}</span><span className="shrink-0 font-mono text-[11px] text-dim">{relTime(e.at)}</span></div>
                {(e.path || e.digest) && <div className="mt-0.5 truncate font-mono text-[11px] text-muted">{[e.path, e.digest && `ref ${e.digest}`].filter(Boolean).join(" · ")}</div>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
