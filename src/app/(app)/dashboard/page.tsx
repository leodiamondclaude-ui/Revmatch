import Link from "next/link";
import { Gauge, Plus, Route } from "lucide-react";
import { requireViewer } from "@/lib/viewer";
import { lifetime } from "@/lib/stats";
import { loadPosts, networkIds } from "@/lib/feed";
import { distance, distanceUnit, duration, speed, speedUnit, vehicleName } from "@/lib/units";
import type { Drive, Vehicle } from "@/lib/types";
import { Stat, StatPanel } from "@/components/ui/Stat";
import { PostCard } from "@/components/social/PostCard";
import { DashboardHero } from "./DashboardHero";

export const metadata = { title: "Dashboard" };

export default async function Dashboard() {
  const { supabase, user, profile, settings } = await requireViewer();
  const units = settings?.units ?? "imperial";
  const [{ data: vehicles }, { data: drives }, { count: requests }, posts] = await Promise.all([
    supabase.from("vehicles").select("*, modifications(id, category, name)").eq("owner_id", user.id).order("created_at"),
    supabase.from("drives").select("id, vehicle_id, title, started_at, duration_s, moving_s, distance_m, avg_speed_mps, max_speed_mps, status, acceleration, source").eq("owner_id", user.id).order("started_at", { ascending: false }).limit(500),
    supabase.from("friendships").select("requester_id", { count: "exact", head: true }).eq("addressee_id", user.id).eq("status", "pending"),
    networkIds(supabase, user.id).then((ids) => loadPosts(supabase, { authorIds: ids.filter((i) => i !== user.id), limit: 3 })),
  ]);
  const vs = (vehicles ?? []) as (Vehicle & { modifications: { id: string; category: string; name: string }[] })[];
  const primary = vs.find((v) => v.id === profile.primary_vehicle_id) ?? vs[0];
  const ds = (drives ?? []) as Drive[];
  const L = lifetime(ds);
  const month = L.monthly[L.monthly.length - 1];
  const hour = new Date().getHours();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="label text-accent">{hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"}</div>
          <h1 className="h-display text-3xl sm:text-4xl">{profile.display_name ?? profile.username}</h1>
        </div>
        <div className="flex gap-2">
          {(requests ?? 0) > 0 && <Link href="/friends" className="chip-accent">{requests} friend request{requests === 1 ? "" : "s"}</Link>}
          <Link href="/drive" className="btn-primary"><Gauge size={16} /> Start drive</Link>
        </div>
      </div>

      {primary ? (
        <DashboardHero vehicle={primary} mods={primary.modifications.map((m) => ({ id: m.id, category: m.category as never, name: m.name }))} />
      ) : (
        <Link href="/garage/new" className="panel carbon flex flex-col items-center gap-3 p-12 text-center transition hover:border-accent/50">
          <Plus className="text-accent" size={32} />
          <div className="h-display text-2xl">Add your first car</div>
          <p className="max-w-sm text-sm text-muted">Three photos is all it takes. The dashboard picks up your car&apos;s colour once it&apos;s added.</p>
        </Link>
      )}

      <StatPanel>
        <Stat big label="Lifetime tracked" value={distance(L.distance_m, units, 0)} unit={distanceUnit(units)} />
        <Stat big label="This month" value={distance(month?.distance_m ?? 0, units, 0)} unit={distanceUnit(units)} sub={`${month?.drives ?? 0} drives`} />
        <Stat big label="Top speed" value={speed(L.max_speed_mps, units)} unit={speedUnit(units)} />
        <Stat big label="Seat time" value={duration(L.duration_s)} />
      </StatPanel>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <section>
          <div className="mb-3 flex items-center justify-between"><h2 className="h-display text-xl">Recent drives</h2><Link href="/drives" className="label text-accent">All drives →</Link></div>
          {ds.length === 0 ? (
            <div className="panel p-6 text-sm text-muted">No drives yet. Tap <b className="text-ink">Start drive</b> before you set off. Phone GPS is all you need.</div>
          ) : (
            <div className="space-y-2">
              {ds.filter((d) => d.status === "complete").slice(0, 5).map((d) => (
                <Link key={d.id} href={`/drives/${d.id}`} className="panel flex items-center gap-4 p-3 transition hover:border-accent/50">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent"><Route size={18} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{d.title || new Date(d.started_at).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}</div>
                    <div className="truncate text-xs text-muted">{vs.find((v) => v.id === d.vehicle_id) ? vehicleName(vs.find((v) => v.id === d.vehicle_id)!) : "No vehicle"} · {d.source}</div>
                  </div>
                  <div className="text-right"><div className="num">{distance(d.distance_m, units)} {distanceUnit(units)}</div><div className="num text-xs text-muted">{duration(d.duration_s)}</div></div>
                </Link>
              ))}
            </div>
          )}
          {vs.length > 1 && (
            <>
              <div className="mb-3 mt-6 flex items-center justify-between"><h2 className="h-display text-xl">Garage</h2><Link href="/garage" className="label text-accent">Manage →</Link></div>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {vs.map((v) => (
                  <Link key={v.id} href={`/v/${v.slug}`} className="panel min-w-44 p-3 hover:border-accent/50">
                    <div className="h-1 w-10 rounded-full" style={{ background: v.exterior_color_hex ?? "#888" }} />
                    <div className="mt-2 truncate text-sm font-semibold">{v.nickname || `${v.make} ${v.model}`}</div>
                    <div className="label">{v.year} · {v.modifications.length} mods</div>
                  </Link>
                ))}
              </div>
            </>
          )}
        </section>
        <section className="space-y-3">
          <div className="flex items-center justify-between"><h2 className="h-display text-xl">From your network</h2><Link href="/feed" className="label text-accent">Feed →</Link></div>
          {posts.length === 0 ? <div className="panel p-6 text-sm text-muted">Follow other drivers to see their builds here. <Link href="/feed?tab=discover" className="text-accent">Discover</Link></div>
            : posts.map((p) => <PostCard key={p.id} post={p} viewerId={user.id} units={units} />)}
        </section>
      </div>
    </div>
  );
}
