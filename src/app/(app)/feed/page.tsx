import Link from "next/link";
import { requireViewer } from "@/lib/viewer";
import { loadPosts, networkIds } from "@/lib/feed";
import type { Vehicle } from "@/lib/types";
import { PostCard } from "@/components/social/PostCard";
import { VehicleCard } from "@/components/garage/VehicleCard";
import { Empty } from "@/components/ui/Empty";
import { Composer } from "./Composer";

export const metadata = { title: "Feed" };

export default async function Feed({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const tab = (await searchParams).tab === "discover" ? "discover" : "following";
  const { supabase, user, settings } = await requireViewer();
  const units = settings?.units ?? "imperial";
  const [posts, myVehicles, discover] = await Promise.all([
    tab === "following" ? networkIds(supabase, user.id).then((ids) => loadPosts(supabase, { authorIds: ids })) : loadPosts(supabase, { limit: 40 }),
    supabase.from("vehicles").select("id, year, make, model, nickname").eq("owner_id", user.id),
    tab === "discover" ? supabase.from("vehicles").select("*, owner:profiles!vehicles_owner_id_fkey(username), modifications(count)").eq("visibility", "public").neq("owner_id", user.id).order("updated_at", { ascending: false }).limit(9) : Promise.resolve({ data: null }),
  ]);
  type DV = Vehicle & { owner: { username: string }; modifications: { count: number }[] };
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="min-w-0 space-y-4">
        <div className="flex items-end justify-between">
          <h1 className="h-display text-3xl sm:text-4xl">Feed</h1>
          <nav className="flex gap-1">
            <Link href="/feed" className="tab" data-on={tab === "following"}>Following</Link>
            <Link href="/feed?tab=discover" className="tab" data-on={tab === "discover"}>Discover</Link>
          </nav>
        </div>
        <Composer userId={user.id} vehicles={(myVehicles.data ?? []) as Vehicle[]} />
        {tab === "discover" && (discover.data?.length ?? 0) > 0 && (
          <section>
            <div className="label mb-3">Fresh builds</div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {(discover.data as DV[]).map((v) => <VehicleCard key={v.id} v={v} owner={v.owner?.username} modCount={v.modifications?.[0]?.count} />)}
            </div>
          </section>
        )}
        {posts.length === 0 ? (
          <Empty title={tab === "following" ? "Quiet paddock" : "Nothing yet"} body={tab === "following" ? "Follow drivers or add friends to fill your feed, or check Discover." : "Be the first to post a build."}
            action={tab === "following" ? <Link href="/feed?tab=discover" className="btn-primary">Discover builds</Link> : undefined} />
        ) : posts.map((p) => <PostCard key={p.id} post={p} viewerId={user.id} units={units} />)}
      </div>
      <aside className="hidden space-y-4 lg:block">
        <div className="panel panel-accent p-5">
          <div className="label">Find drivers</div>
          <p className="mt-1 text-sm text-muted">Search by username and connect with your local scene.</p>
          <Link href="/friends" className="btn-ghost mt-3 w-full">Search people</Link>
        </div>
      </aside>
    </div>
  );
}
