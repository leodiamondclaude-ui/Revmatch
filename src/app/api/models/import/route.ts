import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/supabase/server";
import { sketchfabDownloadGlb, storeModel } from "@/lib/models3d";

export const maxDuration = 120;

export async function POST(req: Request) {
  const { supabase, user } = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!process.env.SKETCHFAB_API_TOKEN) return NextResponse.json({ error: "Sketchfab is not configured", code: "not_configured" }, { status: 501 });
  const body = z.object({ vehicleId: z.string().uuid(), uid: z.string().regex(/^[a-f0-9]{32}$/) }).safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  // RLS: only the owner can update; verify ownership up front.
  const { data: v } = await supabase.from("vehicles").select("id, owner_id").eq("id", body.data.vehicleId).eq("owner_id", user.id).maybeSingle();
  if (!v) return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
  try {
    await supabase.from("vehicles").update({ model_status: "searching" }).eq("id", v.id);
    const { bytes, attribution } = await sketchfabDownloadGlb(body.data.uid);
    const url = await storeModel(user.id, v.id, bytes);
    await supabase.from("vehicles").update({ model_url: url, model_source: "library", model_status: "ready", model_attribution: attribution, model_approved: false }).eq("id", v.id);
    return NextResponse.json({ url, attribution });
  } catch (e) {
    await supabase.from("vehicles").update({ model_status: "failed" }).eq("id", v.id);
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
