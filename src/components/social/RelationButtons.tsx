"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, UserMinus, UserPlus, Users } from "lucide-react";
import { acceptFriend, follow, removeFriend, requestFriend, unfollow } from "./actions";

export interface Relation {
  following: "none" | "pending" | "accepted";
  friend: "none" | "outgoing" | "incoming" | "accepted";
}

export function RelationButtons({ me, target, targetPrivate, rel }: { me: string; target: string; targetPrivate: boolean; rel: Relation }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const run = (fn: () => PromiseLike<{ error: { message: string } | null }>) => start(async () => {
    const { error } = await fn();
    setErr(error?.message ?? null);
    router.refresh();
  });
  return (
    <div className="flex flex-wrap items-center gap-2">
      {rel.following === "none" ? (
        <button type="button" className="btn-primary !py-2" disabled={pending} onClick={() => run(() => follow(me, target, targetPrivate))}><UserPlus size={15} /> {targetPrivate ? "Request to follow" : "Follow"}</button>
      ) : (
        <button type="button" className="btn-ghost !py-2" disabled={pending} onClick={() => run(() => unfollow(me, target))}>{rel.following === "pending" ? "Requested" : <><Check size={15} /> Following</>}</button>
      )}
      {rel.friend === "none" && <button type="button" className="btn-ghost !py-2" disabled={pending} onClick={() => run(() => requestFriend(me, target))}><Users size={15} /> Add friend</button>}
      {rel.friend === "outgoing" && <button type="button" className="btn-ghost !py-2" disabled={pending} onClick={() => run(() => removeFriend(me, target))}>Friend request sent</button>}
      {rel.friend === "incoming" && <button type="button" className="btn-primary !py-2" disabled={pending} onClick={() => run(() => acceptFriend(me, target))}><Check size={15} /> Accept friend</button>}
      {rel.friend === "accepted" && <button type="button" className="btn-ghost !py-2" disabled={pending} onClick={() => { if (confirm("Remove friend?")) run(() => removeFriend(me, target)); }}><UserMinus size={15} /> Friends</button>}
      {err && <span className="text-xs text-bad">{err}</span>}
    </div>
  );
}
