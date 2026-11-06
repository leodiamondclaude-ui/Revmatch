"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Check, X } from "lucide-react";
import { acceptFollower, acceptFriend, removeFollower, removeFriend } from "@/components/social/actions";

export function RequestActions({ me, other, kind }: { me: string; other: string; kind: "friend" | "follow" | "remove-follower" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const go = (fn: () => PromiseLike<unknown>) => start(async () => { await fn(); router.refresh(); });
  if (kind === "remove-follower") return <button type="button" className="btn-quiet !py-1.5 text-xs" disabled={pending} onClick={() => go(() => removeFollower(me, other))}>Remove</button>;
  return (
    <div className="flex gap-1">
      <button type="button" aria-label="Accept" className="btn-primary !p-2" disabled={pending} onClick={() => go(() => (kind === "friend" ? acceptFriend(me, other) : acceptFollower(me, other)))}><Check size={15} /></button>
      <button type="button" aria-label="Decline" className="btn-ghost !p-2" disabled={pending} onClick={() => go(() => (kind === "friend" ? removeFriend(me, other) : removeFollower(me, other)))}><X size={15} /></button>
    </div>
  );
}
