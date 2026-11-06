import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock, MapPin } from "lucide-react";
import { getViewer, supabaseConfigured } from "@/lib/viewer";
import { loadPosts } from "@/lib/feed";
import { accentFromPaint } from "@/lib/color";
import type { Profile, Vehicle } from "@/lib/types";
import { Avatar } from "@/components/ui/Avatar";
import { AccentScope } from "@/components/ui/AccentScope";
import { VehicleCard } from "@/components/garage/VehicleCard";
import { PostCard } from "@/components/social/PostCard";
import { RelationButtons, type Relation } from "@/components/social/RelationButtons";

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  return { title: `@${(await params).username}` };
}

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  if (!supabaseConfigured()) notFound();
  const { supabase, user, settings } = await getViewer();
  const { data: p } = await supabase!.from("profiles").select("*").eq("username", username.toLowerCase()).maybeSingle<Profile>();
  if (!p) notFound();
  const me = user?.id ?? null;
  const isMe = me === p.id;
  const [{ data: canView }, followers, following, friends, rel] = await Promise.all([
    supabase!.rpc("i_can_view_profile", { owner: p.id }),
    supabase!.from("follows").select("follower_id", { count: "exact", head: true }).eq("following_id", p.id).eq("status", "accepted"),
    supabase!.from("follows").select("following_id", { count: "exact", head: true }).eq("follower_id", p.id).eq("status", "accepted"),
    supabase!.from("friendships").select("requester_id", { count: "exact", head: true }).eq("status", "accepted").or(`requester_id.eq.${p.id},addressee_id.eq.${p.id}`),
    me && !isMe ? Promise.all([
      supabase!.from("follows").select("status").eq("follower_id", me).eq("following_id", p.id).maybeSingle(),
      supabase!.from("friendships").select("requester_id, status").or(`and(requester_id.eq.${me},addressee_id.eq.${p.id}),and(requester_id.eq.${p.id},addressee_id.eq.${me})`).maybeSingle(),
    ]) : Promise.resolve(null),
  ]);
  const relation: Relation | null = rel ? {
    following: (rel[0].data?.status as Relation["following"]) ?? "none",
    friend: !rel[1].data ? "none" : rel[1].data.status === "accepted" ? "accepted" : rel[1].data.requester_id === me ? "outgoing" : "incoming",
  } : null;
  const visible = !!canView;
  const [{ data: vehicles }, posts] = visible ? await Promise.all([
    supabase!.from("vehicles").select("*, modifications(count)").eq("owner_id", p.id).order("created_at"),
    loadPosts(supabase!, { authorIds: [p.id], limit: 20 }),
  ]) : [{ data: [] }, []];
  const vs = (vehicles ?? []) as (Vehicle & { modifications: { count: number }[] })[];
  const primary = vs.find((v) => v.id === p.primary_vehicle_id) ?? vs[0];
  const accent = p.accent_mode === "custom" ? p.accent_color : accentFromPaint(primary?.exterior_color_hex);

  return (
    <AccentScope accent={accent}>
      <header className="panel panel-accent relative overflow-hidden p-6 sm:p-8">
        <div className="speed-lines absolute inset-0" />
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-accent/20 blur-3xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
          <Avatar url={p.avatar_url} name={p.display_name ?? p.username} size={96} />
          <div className="min-w-0 flex-1">
            <h1 className="h-display text-4xl leading-none">{p.display_name ?? p.username}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-3 font-mono text-sm text-muted">
              <span>@{p.username}</span>
              {p.location && visible && <span className="flex items-center gap-1"><MapPin size={13} />{p.location}</span>}
              {p.is_private && <span className="chip"><Lock size={10} /> Private</span>}
            </div>
            {p.bio && <p className="mt-3 max-w-xl text-ink/90">{p.bio}</p>}
            <div className="mt-4 flex gap-6">
              {[["Followers", followers.count], ["Following", following.count], ["Friends", friends.count], ["Vehicles", visible ? vs.length : "—"]].map(([l, n]) => (
                <div key={l as string}><div className="num text-xl font-semibold">{n ?? 0}</div><div className="label">{l}</div></div>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {isMe && <Link href="/settings" className="btn-ghost">Edit profile</Link>}
            {relation && me && <RelationButtons me={me} target={p.id} targetPrivate={p.is_private} rel={relation} />}
            {!me && <Link href={`/login?next=/u/${p.username}`} className="btn-primary">Sign in to follow</Link>}
          </div>
        </div>
      </header>

      {!visible ? (
        <div className="panel carbon mt-6 p-10 text-center">
          <Lock className="mx-auto text-accent" />
          <h2 className="h-display mt-3 text-2xl">Private garage</h2>
          <p className="mt-1 text-sm text-muted">Follow @{p.username} or become friends to see their vehicles and activity.</p>
        </div>
      ) : (
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
          <section>
            <h2 className="h-display mb-4 text-2xl">Garage</h2>
            {vs.length === 0 ? <p className="text-sm text-muted">No vehicles shared.</p> : (
              <div className="grid gap-4 sm:grid-cols-2">{vs.map((v) => <VehicleCard key={v.id} v={v} modCount={v.modifications?.[0]?.count} />)}</div>
            )}
          </section>
          <section className="space-y-4">
            <h2 className="h-display text-2xl">Activity</h2>
            {posts.length === 0 ? <p className="text-sm text-muted">No recent activity.</p> : posts.map((x) => <PostCard key={x.id} post={x} viewerId={me} units={settings?.units ?? "imperial"} />)}
          </section>
        </div>
      )}
    </AccentScope>
  );
}
