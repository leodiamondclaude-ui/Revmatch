import Link from "next/link";
import { requireViewer } from "@/lib/viewer";
import type { Profile } from "@/lib/types";
import { Avatar } from "@/components/ui/Avatar";
import { RequestActions } from "./RequestActions";

export const metadata = { title: "Friends" };
type P = Pick<Profile, "id" | "username" | "display_name" | "avatar_url" | "is_private">;
const COLS = "id, username, display_name, avatar_url, is_private";

function Person({ p, children }: { p: P; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line p-3">
      <Link href={`/u/${p.username}`}><Avatar url={p.avatar_url} name={p.display_name ?? p.username} size={40} /></Link>
      <Link href={`/u/${p.username}`} className="min-w-0 flex-1"><div className="truncate font-semibold">{p.display_name ?? p.username}</div><div className="truncate font-mono text-xs text-muted">@{p.username}</div></Link>
      {children}
    </div>
  );
}

export default async function Friends({ searchParams }: { searchParams: Promise<{ q?: string; tab?: string }> }) {
  const { q, tab = "friends" } = await searchParams;
  const { supabase, user } = await requireViewer();
  const me = user.id;
  const term = q?.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  const [results, fr, followReqs, followers, following] = await Promise.all([
    term ? supabase.from("profiles").select(COLS).ilike("username", `%${term}%`).neq("id", me).limit(20) : Promise.resolve({ data: null }),
    supabase.from("friendships").select("requester_id, addressee_id, status, requester:profiles!friendships_requester_id_fkey(" + COLS + "), addressee:profiles!friendships_addressee_id_fkey(" + COLS + ")").or(`requester_id.eq.${me},addressee_id.eq.${me}`),
    supabase.from("follows").select("follower_id, follower:profiles!follows_follower_id_fkey(" + COLS + ")").eq("following_id", me).eq("status", "pending"),
    supabase.from("follows").select("follower_id, follower:profiles!follows_follower_id_fkey(" + COLS + ")").eq("following_id", me).eq("status", "accepted"),
    supabase.from("follows").select("following_id, status, following:profiles!follows_following_id_fkey(" + COLS + ")").eq("follower_id", me),
  ]);
  type FR = { requester_id: string; addressee_id: string; status: string; requester: P; addressee: P };
  const rows = (fr.data ?? []) as unknown as FR[];
  const incoming = rows.filter((r) => r.status === "pending" && r.addressee_id === me);
  const outgoing = rows.filter((r) => r.status === "pending" && r.requester_id === me);
  const friends = rows.filter((r) => r.status === "accepted").map((r) => (r.requester_id === me ? r.addressee : r.requester));
  const fReqs = (followReqs.data ?? []) as unknown as { follower: P }[];
  const tabs = [["friends", `Friends · ${friends.length}`], ["followers", `Followers · ${followers.data?.length ?? 0}`], ["following", `Following · ${following.data?.length ?? 0}`]];

  return (
    <div className="space-y-6">
      <h1 className="h-display text-3xl sm:text-4xl">Friends &amp; network</h1>
      <form className="flex gap-2" action="/friends">
        <input name="q" defaultValue={q} className="input" placeholder="Search by username…" autoComplete="off" />
        <button className="btn-primary">Search</button>
      </form>
      {results.data && (
        <section className="panel p-4">
          <div className="label mb-3">Results</div>
          {results.data.length === 0 ? <p className="text-sm text-muted">No drivers match “{term}”.</p> : (
            <div className="grid gap-2 sm:grid-cols-2">{(results.data as P[]).map((p) => <Person key={p.id} p={p}><Link href={`/u/${p.username}`} className="btn-ghost !py-1.5">View</Link></Person>)}</div>
          )}
        </section>
      )}
      {(incoming.length > 0 || fReqs.length > 0) && (
        <section className="panel panel-accent p-4">
          <div className="label mb-3 text-accent">Requests</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {incoming.map((r) => <Person key={r.requester_id} p={r.requester}><RequestActions me={me} other={r.requester_id} kind="friend" /></Person>)}
            {fReqs.map((r) => <Person key={r.follower.id} p={r.follower}><span className="chip">wants to follow</span><RequestActions me={me} other={r.follower.id} kind="follow" /></Person>)}
          </div>
        </section>
      )}
      <nav className="flex gap-1 border-b border-line">
        {tabs.map(([id, l]) => <Link key={id} href={`/friends?tab=${id}`} className="tab" data-on={tab === id}>{l}</Link>)}
      </nav>
      <div className="grid gap-2 sm:grid-cols-2">
        {tab === "friends" && <>
          {friends.map((p) => <Person key={p.id} p={p} />)}
          {outgoing.map((r) => <Person key={r.addressee_id} p={r.addressee}><span className="chip">pending</span></Person>)}
          {!friends.length && !outgoing.length && <p className="text-sm text-muted">No friends yet. Search for drivers above.</p>}
        </>}
        {tab === "followers" && ((followers.data ?? []) as unknown as { follower: P }[]).map((r) => <Person key={r.follower.id} p={r.follower}><RequestActions me={me} other={r.follower.id} kind="remove-follower" /></Person>)}
        {tab === "following" && ((following.data ?? []) as unknown as { following: P; status: string }[]).map((r) => <Person key={r.following.id} p={r.following}>{r.status === "pending" && <span className="chip">requested</span>}</Person>)}
      </div>
    </div>
  );
}
