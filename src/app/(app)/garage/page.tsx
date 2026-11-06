import Link from "next/link";
import { Plus } from "lucide-react";
import { requireViewer } from "@/lib/viewer";
import type { Vehicle } from "@/lib/types";
import { VehicleCard } from "@/components/garage/VehicleCard";
import { Empty } from "@/components/ui/Empty";
import { SectionTitle } from "@/components/ui/SectionTitle";

export const metadata = { title: "Garage" };

export default async function Garage() {
  const { supabase, user } = await requireViewer();
  const { data } = await supabase.from("vehicles").select("*, modifications(count)").eq("owner_id", user.id).order("created_at");
  const vehicles = (data ?? []) as (Vehicle & { modifications: { count: number }[] })[];
  return (
    <div>
      <SectionTitle kicker={`${vehicles.length} vehicle${vehicles.length === 1 ? "" : "s"}`} title="Your Garage"
        action={<Link href="/garage/new" className="btn-primary"><Plus size={16} /> Add vehicle</Link>} />
      {vehicles.length === 0 ? (
        <Empty title="Empty bay" body="Add your first car. Upload three photos, review what the AI identifies, and get an interactive 3D build sheet." action={<Link href="/garage/new" className="btn-primary">Add vehicle</Link>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {vehicles.map((v, i) => (
            <div key={v.id} className={`rise rise-${Math.min(i, 4)}`}><VehicleCard v={v} modCount={v.modifications?.[0]?.count ?? 0} /></div>
          ))}
        </div>
      )}
    </div>
  );
}
