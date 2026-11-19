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
  const { data: priv } = await supabase.from("vehicle_private").select("vin, plate, purchase_price, budget, notes, hidden").eq("vehicle_id", v.id).maybeSingle();
  return <EditVehicle vehicle={v} priv={priv ?? null} isPrimary={profile.primary_vehicle_id === v.id} integrations={integrations()} />;
}
