import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FeedPost } from "@/components/social/PostCard";

const SELECT = "*, author:profiles!posts_author_id_fkey(id, username, display_name, avatar_url), vehicle:vehicles(id, slug, year, make, model, nickname, exterior_color_hex)";

/** Loads posts visible to the caller (RLS-enforced) and decorates them with like/comment counts. */
export async function loadPosts(supabase: SupabaseClient, opts: { authorIds?: string[]; limit?: number; before?: string } = {}) {
  let q = supabase.from("posts").select(SELECT).order("created_at", { ascending: false }).limit(opts.limit ?? 30);
  if (opts.authorIds) q = q.in("author_id", opts.authorIds.length ? opts.authorIds : ["00000000-0000-0000-0000-000000000000"]);
  if (opts.before) q = q.lt("created_at", opts.before);
  const { data } = await q;
  const posts = (data ?? []) as FeedPost[];
  if (!posts.length) return posts;
  const { data: counts } = await supabase.rpc("post_counts", { ids: posts.map((p) => p.id) });
  const map = new Map<string, { likes: number; comments: number; liked: boolean }>(
    (counts ?? []).map((c: { post_id: string; likes: number; comments: number; liked: boolean }) => [c.post_id, { likes: Number(c.likes), comments: Number(c.comments), liked: c.liked }]),
  );
  return posts.map((p) => ({ ...p, ...(map.get(p.id) ?? { likes: 0, comments: 0, liked: false }) }));
}

export async function networkIds(supabase: SupabaseClient, me: string) {
  const [{ data: f }, { data: fr }] = await Promise.all([
    supabase.from("follows").select("following_id").eq("follower_id", me).eq("status", "accepted"),
    supabase.from("friendships").select("requester_id, addressee_id").eq("status", "accepted").or(`requester_id.eq.${me},addressee_id.eq.${me}`),
  ]);
  const ids = new Set<string>([me]);
  f?.forEach((x) => ids.add(x.following_id));
  fr?.forEach((x) => ids.add(x.requester_id === me ? x.addressee_id : x.requester_id));
  return [...ids];
}
