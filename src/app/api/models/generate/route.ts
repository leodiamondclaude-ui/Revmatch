import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/supabase/server";
import { meshyCreate } from "@/lib/models3d";

export async function POST(req: Request) {
  const { supabase, user } = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!process.env.MESHY_API_KEY) return NextResponse.json({ error: "AI 3D generation is not configured (MESHY_API_KEY)", code: "not_configured" }, { status: 501 });
  const body = z.object({ vehicleId: z.string().uuid() }).safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { data: v } = await supabase.from("vehicles").select("id").eq("id", body.data.vehicleId).eq("owner_id", user.id).maybeSingle();
  if (!v) return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
  const { data: photos } = await supabase.from("vehicle_photos").select("url, angle").eq("vehicle_id", v.id).in("angle", ["front_3q", "side", "rear_3q", "front", "rear"]);
  const order = ["front_3q", "side", "rear_3q", "front", "rear"];
  const urls = (photos ?? []).sort((a, b) => order.indexOf(a.angle) - order.indexOf(b.angle)).map((p) => p.url);
  if (urls.length < 3) return NextResponse.json({ error: "Upload front ¾, rear ¾ and side photos first." }, { status: 400 });
  try {
    const taskId = await meshyCreate(urls);
    await supabase.from("vehicles").update({ model_status: "generating", model_task_id: taskId, model_source: "ai" }).eq("id", v.id);
    return NextResponse.json({ taskId });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
