import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase/server";
import { sketchfabSearch } from "@/lib/models3d";

export async function GET(req: Request) {
  const { user } = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const q = new URL(req.url).searchParams.get("q")?.slice(0, 120);
  if (!q) return NextResponse.json({ error: "Missing query" }, { status: 400 });
  try {
    return NextResponse.json(await sketchfabSearch(q));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
