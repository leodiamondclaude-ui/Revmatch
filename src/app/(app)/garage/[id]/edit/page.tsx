import { notFound } from "next/navigation";
import { integrations, requireViewer } from "@/lib/viewer";
import type { Vehicle } from "@/lib/types";
import { EditVehicle } from "./EditVehicle";

export const metadata = { title: "Edit vehicle" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, profile } = await requireViewer();
  const { data: v } = await supabase.from("vehicles").select("*").eq("id", id).eq("owner_id", user.id).maybeSingle<Vehicle>();
  if (!v) notFound();
  const { count } = await supabase.from("vehicle_photos").select("id", { count: "exact", head: true }).eq("vehicle_id", v.id).in("angle", ["front_3q", "rear_3q", "side"]);
  return <EditVehicle vehicle={v} isPrimary={profile.primary_vehicle_id === v.id} angleCount={count ?? 0} integrations={integrations()} />;
}
