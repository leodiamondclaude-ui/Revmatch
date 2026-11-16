import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase/server";

/** What's on standby: ready library models (readable by any signed-in user through RLS). */
export async function GET() {
  const { supabase, user } = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { data, error } = await supabase.from("model_library")
    .select("make, model, generation, year_from, year_to, body, source, thumbnail_url, look, built_at")
    .eq("status", "ready").order("make").order("model");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ready: data ?? [] });
}
