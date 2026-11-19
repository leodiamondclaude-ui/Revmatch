import Link from "next/link";
import { requireViewer } from "@/lib/viewer";
import { relTime } from "@/lib/units";
import type { AppNotification, NotificationKind } from "@/lib/types";
import { Avatar } from "@/components/ui/Avatar";
import { Empty } from "@/components/ui/Empty";
import { MarkRead } from "./MarkRead";

export const metadata = { title: "Notifications" };

type Row = AppNotification & { actor: { username: string; display_name: string | null; avatar_url: string | null } | null; post: { body: string | null } | null; comment: { body: string } | null };

const TEXT: Record<NotificationKind, string> = {
  like: "liked your post", comment: "commented on your post", friend_request: "sent you a friend request", friend_accept: "accepted your friend request",
  follow: "started following you", follow_request: "asked to follow you", invite_joined: "joined RevMatch with your invite",
};

function href(n: Row) {
  if (n.post_id) return `/p/${n.post_id}`;
  if (n.kind === "friend_request" || n.kind === "follow_request") return "/friends";
  return n.actor ? `/u/${n.actor.username}` : "/friends";
}

export default async function Notifications() {
  const { supabase, user } = await requireViewer();
  const { data } = await supabase.from("notifications")
    .select("*, actor:profiles!notifications_actor_id_fkey(username, display_name, avatar_url), post:posts(body), comment:post_comments(body)")
    .eq("user_id", user.id).order("created_at", { ascending: false }).limit(60);
  const rows = (data ?? []) as unknown as Row[];
  const unread = rows.some((r) => !r.read_at);
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-end justify-between gap-3">
        <h1 className="h-display text-3xl sm:text-4xl">Notifications</h1>
        <Link href="/settings#notifications" className="btn-quiet">Choose what you get</Link>
      </div>
      {unread && <MarkRead userId={user.id} />}
      {rows.length === 0 ? (
        <Empty title="All quiet" body="Likes, comments, friend requests and new followers show up here." action={<Link href="/friends/invite" className="btn-primary">Invite your friends</Link>} />
      ) : (
        <ul className="panel divide-y divide-line">
          {rows.map((n) => {
            const who = n.actor?.display_name ?? n.actor?.username ?? "Someone";
            const quote = n.comment?.body ?? (n.kind === "like" ? n.post?.body : null);
            return (
              <li key={n.id}>
                <Link href={href(n)} className={`flex items-start gap-3 px-4 py-3 transition hover:bg-surface-2 ${n.read_at ? "" : "bg-accent/[0.06]"}`}>
                  <Avatar url={n.actor?.avatar_url} name={who} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm"><b>{who}</b> {TEXT[n.kind]}</p>
                    {quote && <p className="mt-0.5 line-clamp-2 text-sm text-muted">“{quote}”</p>}
                    <p className="mt-0.5 font-mono text-[11px] text-dim">{relTime(n.created_at)}</p>
                  </div>
                  {!n.read_at && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="unread" />}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
