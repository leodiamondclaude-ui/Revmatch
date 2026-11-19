import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Everything RevMatch stores about the signed-in user, as one JSON download. */
export async function GET() {
  const { supabase, user } = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const own = async (table: string, col = "owner_id") => (await supabase.from(table).select("*").eq(col, user.id)).data ?? [];
  // Raw GPS samples can be large: page through them.
  const samples: unknown[] = [];
  for (let from = 0; from < 500_000; from += 1000) {
    const { data } = await supabase.from("drive_samples").select("*").eq("owner_id", user.id).order("t").range(from, from + 999);
    if (!data?.length) break;
    samples.push(...data);
    if (data.length < 1000) break;
  }
  const [profile, settings, vehicles, vehiclePrivate, mods, photos, events, drives, posts, comments, likes, follows, followers, friendships, blocks, reports] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle().then((r) => r.data),
    supabase.from("user_settings").select("*").eq("user_id", user.id).maybeSingle().then((r) => r.data),
    own("vehicles"), own("vehicle_private"), own("modifications"), own("vehicle_photos"), own("build_events"), own("drives"),
    own("posts", "author_id"), own("post_comments", "author_id"), own("post_likes", "user_id"),
    own("follows", "follower_id"), own("follows", "following_id"),
    supabase.from("friendships").select("*").or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`).then((r) => r.data ?? []),
    own("blocks", "blocker_id"), own("reports", "reporter_id"),
  ]);
  const body = JSON.stringify({
    exported_at: new Date().toISOString(), account: { id: user.id, email: user.email, created_at: user.created_at },
    profile, settings, vehicles, vehicle_private: vehiclePrivate, modifications: mods, photos, build_events: events, drives, drive_samples: samples,
    posts, comments, likes, following: follows, followers, friendships, blocks, reports_filed: reports,
    note: "Photo and model files are linked by URL in 'photos' and 'vehicles'.",
  }, null, 2);
  return new NextResponse(body, { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="revmatch-export-${new Date().toISOString().slice(0, 10)}.json"`, "Cache-Control": "no-store" } });
}
