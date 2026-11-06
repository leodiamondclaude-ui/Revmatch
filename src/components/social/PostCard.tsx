"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useState } from "react";
import { Gauge, Heart, MessageCircle, Plus, Send, Trash2, Wrench } from "lucide-react";
import { useSupabase } from "@/lib/supabase/client";
import { accentFromPaint } from "@/lib/color";
import { distance, distanceUnit, duration, relTime, speed, speedUnit, type Units } from "@/lib/units";
import type { Post, Profile, Vehicle } from "@/lib/types";
import { Avatar } from "@/components/ui/Avatar";
import { AccentScope } from "@/components/ui/AccentScope";

export type FeedPost = Post & {
  author: Pick<Profile, "id" | "username" | "display_name" | "avatar_url">;
  vehicle: Pick<Vehicle, "id" | "slug" | "year" | "make" | "model" | "nickname" | "exterior_color_hex"> | null;
  likes: number; comments: number; liked: boolean;
};
type Comment = { id: string; body: string; created_at: string; author_id: string; author: { username: string; avatar_url: string | null; display_name: string | null } };

const KIND = { new_vehicle: { icon: Plus, label: "New in the garage" }, new_mod: { icon: Wrench, label: "Mod installed" }, drive: { icon: Gauge, label: "Drive logged" }, update: null, photo: null } as const;

export function PostCard({ post, viewerId, units }: { post: FeedPost; viewerId: string | null; units: Units }) {
  const [liked, setLiked] = useState(post.liked);
  const [likes, setLikes] = useState(post.likes);
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [count, setCount] = useState(post.comments);
  const [text, setText] = useState("");
  const [gone, setGone] = useState(false);
  const supabase = useSupabase();
  const accent = accentFromPaint(post.vehicle?.exterior_color_hex);
  const k = KIND[post.kind];
  const m = post.meta as { distance_m?: number; duration_s?: number; max_speed_mps?: number; avg_speed_mps?: number; hp_gain?: number };

  async function toggleLike() {
    if (!viewerId) return;
    const next = !liked;
    setLiked(next); setLikes((n) => n + (next ? 1 : -1));
    const { error } = next
      ? await supabase.from("post_likes").insert({ post_id: post.id, user_id: viewerId })
      : await supabase.from("post_likes").delete().eq("post_id", post.id).eq("user_id", viewerId);
    if (error) { setLiked(!next); setLikes((n) => n + (next ? -1 : 1)); }
  }
  async function loadComments() {
    setOpen((o) => !o);
    if (comments) return;
    const { data } = await supabase.from("post_comments").select("id, body, created_at, author_id, author:profiles!post_comments_author_id_fkey(username, avatar_url, display_name)").eq("post_id", post.id).order("created_at");
    setComments((data ?? []) as unknown as Comment[]);
  }
  async function addComment(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || !viewerId) return;
    const { data, error } = await supabase.from("post_comments").insert({ post_id: post.id, author_id: viewerId, body: text.trim() })
      .select("id, body, created_at, author_id, author:profiles!post_comments_author_id_fkey(username, avatar_url, display_name)").single();
    if (!error && data) { setComments((c) => [...(c ?? []), data as unknown as Comment]); setCount((n) => n + 1); setText(""); }
  }
  async function delComment(id: string) {
    await supabase.from("post_comments").delete().eq("id", id);
    setComments((c) => c?.filter((x) => x.id !== id) ?? null); setCount((n) => n - 1);
  }
  async function delPost() {
    if (!confirm("Delete this post?")) return;
    await supabase.from("posts").delete().eq("id", post.id);
    setGone(true);
  }
  if (gone) return null;

  return (
    <AccentScope accent={accent}>
      <article className="panel overflow-hidden">
        <header className="flex items-center gap-3 p-4">
          <Link href={`/u/${post.author.username}`}><Avatar url={post.author.avatar_url} name={post.author.display_name ?? post.author.username} size={40} /></Link>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <Link href={`/u/${post.author.username}`} className="font-semibold hover:text-accent">{post.author.display_name ?? post.author.username}</Link>
              <span className="font-mono text-xs text-muted">@{post.author.username} · {relTime(post.created_at)}</span>
            </div>
            {post.vehicle && <Link href={`/v/${post.vehicle.slug}`} className="text-xs text-accent hover:underline">{post.vehicle.nickname || `${post.vehicle.year ?? ""} ${post.vehicle.make} ${post.vehicle.model}`}</Link>}
          </div>
          {k && <span className="chip-accent hidden sm:inline-flex"><k.icon size={11} /> {k.label}</span>}
          {viewerId === post.author_id && <button type="button" onClick={delPost} className="btn-quiet !p-1.5" aria-label="Delete post"><Trash2 size={14} /></button>}
        </header>
        {post.body && <p className="whitespace-pre-line px-4 pb-3">{post.body}</p>}
        {post.kind === "drive" && m.distance_m != null && (
          <Link href={`/drives/${post.ref_id}`} className="mx-4 mb-3 grid grid-cols-4 gap-2 rounded-xl border border-line bg-surface-2 p-3 text-center hover:border-accent/50">
            <div><div className="label">Dist</div><div className="num">{distance(m.distance_m, units)}<span className="text-[10px] text-muted"> {distanceUnit(units)}</span></div></div>
            <div><div className="label">Time</div><div className="num">{duration(m.duration_s)}</div></div>
            <div><div className="label">Avg</div><div className="num">{speed(m.avg_speed_mps, units)}</div></div>
            <div><div className="label">Max</div><div className="num text-accent">{speed(m.max_speed_mps, units)}<span className="text-[10px] text-muted"> {speedUnit(units)}</span></div></div>
          </Link>
        )}
        {post.kind === "new_mod" && m.hp_gain ? <div className="px-4 pb-3"><span className="chip-accent">+{m.hp_gain} hp claimed</span></div> : null}
        {post.image_url && (
          <Link href={post.vehicle ? `/v/${post.vehicle.slug}` : "#"} className="block bg-black">
            <img src={post.image_url} alt="" loading="lazy" className="max-h-[520px] w-full object-cover" />
          </Link>
        )}
        <footer className="flex items-center gap-1 border-t border-line px-2 py-1.5">
          <button type="button" onClick={toggleLike} disabled={!viewerId} className={`btn-quiet !px-3 ${liked ? "!text-accent" : ""}`} aria-pressed={liked}>
            <Heart size={17} fill={liked ? "currentColor" : "none"} className={liked ? "drop-shadow-[0_0_6px_var(--accent)]" : ""} /> <span className="num">{likes}</span>
          </button>
          <button type="button" onClick={loadComments} className="btn-quiet !px-3"><MessageCircle size={17} /> <span className="num">{count}</span></button>
          <span className="ml-auto pr-2 font-mono text-[10px] uppercase text-dim">{post.visibility}</span>
        </footer>
        {open && (
          <div className="space-y-3 border-t border-line bg-surface-2/50 p-4">
            {comments?.map((c) => (
              <div key={c.id} className="flex gap-2.5 text-sm">
                <Avatar url={c.author.avatar_url} name={c.author.display_name ?? c.author.username} size={28} />
                <div className="min-w-0 flex-1"><Link href={`/u/${c.author.username}`} className="font-semibold">@{c.author.username}</Link> <span className="text-xs text-dim">{relTime(c.created_at)}</span><p className="text-ink/90">{c.body}</p></div>
                {(viewerId === c.author_id || viewerId === post.author_id) && <button type="button" onClick={() => delComment(c.id)} className="text-dim hover:text-bad" aria-label="Delete comment"><Trash2 size={13} /></button>}
              </div>
            ))}
            {comments?.length === 0 && <p className="text-sm text-muted">No comments yet.</p>}
            {viewerId && (
              <form onSubmit={addComment} className="flex gap-2">
                <input className="input" maxLength={1000} placeholder="Add a comment…" value={text} onChange={(e) => setText(e.target.value)} />
                <button className="btn-primary !px-3" aria-label="Send"><Send size={16} /></button>
              </form>
            )}
          </div>
        )}
      </article>
    </AccentScope>
  );
}
