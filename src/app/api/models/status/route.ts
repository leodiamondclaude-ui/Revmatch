import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase/server";

/** Progress of a model being found or built for one of the caller's cars (polled by the car page). */
export async function GET(req: Request) {
  const { supabase, user } = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("vehicleId");
  const { data: v } = await supabase.from("vehicles").select("id, model_status, model_url, model_agent_log").eq("id", id ?? "").eq("owner_id", user.id).maybeSingle();
  if (!v) return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
  return NextResponse.json({ status: v.model_status, url: v.model_url, log: v.model_agent_log ?? [] });
}
