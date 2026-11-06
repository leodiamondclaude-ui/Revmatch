import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase/server";
import { meshyStatus, storeModel } from "@/lib/models3d";

export const maxDuration = 120;

export async function GET(req: Request) {
  const { supabase, user } = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("vehicleId");
  const { data: v } = await supabase.from("vehicles").select("id, model_status, model_task_id, model_url").eq("id", id ?? "").eq("owner_id", user.id).maybeSingle();
  if (!v) return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
  if (v.model_status !== "generating" || !v.model_task_id) return NextResponse.json({ status: v.model_status, url: v.model_url });
  if (!process.env.MESHY_API_KEY) return NextResponse.json({ status: "failed", error: "MESHY_API_KEY missing" });
  try {
    const t = await meshyStatus(v.model_task_id);
    if (t.status === "SUCCEEDED" && t.model_urls?.glb) {
      const file = await fetch(t.model_urls.glb);
      const url = await storeModel(user.id, v.id, new Uint8Array(await file.arrayBuffer()));
      await supabase.from("vehicles").update({
        model_url: url, model_status: "ready", model_approved: false,
        model_attribution: "AI-generated approximation from owner photos (Meshy). Not a scan.",
      }).eq("id", v.id);
      return NextResponse.json({ status: "ready", url });
    }
    if (t.status === "FAILED" || t.status === "CANCELED") {
      await supabase.from("vehicles").update({ model_status: "failed" }).eq("id", v.id);
      return NextResponse.json({ status: "failed", error: t.task_error?.message ?? "Generation failed" });
    }
    return NextResponse.json({ status: "generating", progress: t.progress });
  } catch (e) {
    return NextResponse.json({ status: "generating", error: (e as Error).message });
  }
}
