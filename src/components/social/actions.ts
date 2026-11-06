"use client";
import { createClient } from "@/lib/supabase/client";

const sb = () => createClient();

export async function follow(me: string, target: string, targetPrivate: boolean) {
  return sb().from("follows").insert({ follower_id: me, following_id: target, status: targetPrivate ? "pending" : "accepted" });
}
export async function unfollow(me: string, target: string) {
  return sb().from("follows").delete().eq("follower_id", me).eq("following_id", target);
}
export async function acceptFollower(me: string, follower: string) {
  return sb().from("follows").update({ status: "accepted" }).eq("follower_id", follower).eq("following_id", me);
}
export async function removeFollower(me: string, follower: string) {
  return sb().from("follows").delete().eq("follower_id", follower).eq("following_id", me);
}
export async function requestFriend(me: string, target: string) {
  // If they already asked us, accept instead of creating a duplicate pair.
  const { data } = await sb().from("friendships").select("status").eq("requester_id", target).eq("addressee_id", me).maybeSingle();
  if (data) return sb().from("friendships").update({ status: "accepted" }).eq("requester_id", target).eq("addressee_id", me);
  return sb().from("friendships").insert({ requester_id: me, addressee_id: target });
}
export async function acceptFriend(me: string, requester: string) {
  return sb().from("friendships").update({ status: "accepted" }).eq("requester_id", requester).eq("addressee_id", me);
}
export async function removeFriend(me: string, other: string) {
  const c = sb();
  await c.from("friendships").delete().eq("requester_id", me).eq("addressee_id", other);
  return c.from("friendships").delete().eq("requester_id", other).eq("addressee_id", me);
}
