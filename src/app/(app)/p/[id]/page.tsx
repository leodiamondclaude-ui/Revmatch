import Link from "next/link";
import { requireViewer } from "@/lib/viewer";
import { loadPosts } from "@/lib/feed";
import { PostCard } from "@/components/social/PostCard";
import { Empty } from "@/components/ui/Empty";

export const metadata = { title: "Post" };

/** One post on its own page, so notifications and shared links have somewhere to land. */
export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, settings } = await requireViewer();
  const ok = /^[0-9a-f-]{36}$/i.test(id);
  const [post] = ok ? await loadPosts(supabase, { ids: [id], limit: 1 }) : [];
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/feed" className="btn-quiet">← Feed</Link>
      {post ? <PostCard post={post} viewerId={user.id} units={settings?.units ?? "imperial"} defaultOpen /> : <Empty title="Post not found" body="It was deleted, or you don't have permission to see it." />}
    </div>
  );
}
