import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getViewer, integrations, supabaseConfigured } from "@/lib/viewer";
import { createClient } from "@/lib/supabase/server";
import { accentFromPaint } from "@/lib/color";
import { vehicleName } from "@/lib/units";
import type { BuildEvent, Drive, Modification, Profile, Vehicle, VehiclePhoto } from "@/lib/types";
import { AccentScope } from "@/components/ui/AccentScope";
import { VehicleProfile } from "@/components/vehicle/VehicleProfile";
import { Lock } from "lucide-react";

type Params = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  if (!supabaseConfigured()) return null;
  const supabase = await createClient();
  const { data: v } = await supabase.from("vehicles").select("*").eq("slug", slug).maybeSingle<Vehicle>();
  return v ? { supabase, v } : null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const r = await load((await params).slug);
  if (!r) return { title: "Vehicle" };
  return { title: vehicleName(r.v), description: r.v.description ?? `Build sheet for ${vehicleName(r.v)} on RevMatch`, openGraph: r.v.cover_photo_url ? { images: [r.v.cover_photo_url] } : undefined };
}

export default async function VehiclePage({ params }: Params) {
  const { slug } = await params;
  const r = await load(slug);
  const { user, settings } = await getViewer();
  if (!r) {
    // RLS hides private/friends-only vehicles entirely; we can't tell "missing" from "private", by design.
    if (!/^[a-f0-9]{18}$/.test(slug)) notFound();
    return (
      <div className="panel carbon mx-auto mt-10 max-w-lg p-10 text-center">
        <Lock className="mx-auto text-accent" />
        <h1 className="h-display mt-4 text-3xl">Vehicle unavailable</h1>
        <p className="mt-2 text-sm text-muted">This vehicle doesn&apos;t exist, or its owner has made it private or visible to friends only.</p>
      </div>
    );
  }
  const { supabase, v } = r;
  const isOwner = user?.id === v.owner_id;
  const [{ data: owner }, { data: mods }, { data: photos }, { data: events }, statsRes, drivesRes] = await Promise.all([
    supabase.from("profiles").select("id, username, display_name, avatar_url, bio, location, is_private").eq("id", v.owner_id).single<Profile>(),
    supabase.from("modifications").select("*").eq("vehicle_id", v.id).order("installed_on", { ascending: true, nullsFirst: false }),
    supabase.from("vehicle_photos").select("*").eq("vehicle_id", v.id).order("created_at"),
    supabase.from("build_events").select("*").eq("vehicle_id", v.id).order("event_date"),
    supabase.rpc("vehicle_public_stats", { vid: v.id }),
    isOwner ? supabase.from("drives").select("*").eq("vehicle_id", v.id).eq("status", "complete").order("started_at", { ascending: false }) : Promise.resolve({ data: null }),
  ]);
  const accent = accentFromPaint(v.model_config?.paint ?? v.exterior_color_hex);
  const statsRow = Array.isArray(statsRes.data) ? statsRes.data[0] : null;
  return (
    <AccentScope accent={accent}>
      <VehicleProfile
        vehicle={v}
        owner={owner!}
        mods={(mods ?? []) as Modification[]}
        photos={(photos ?? []) as VehiclePhoto[]}
        events={(events ?? []) as BuildEvent[]}
        publicStats={statsRow && Number(statsRow.drives) > 0 ? statsRow : null}
        drives={(drivesRes.data ?? null) as Drive[] | null}
        isOwner={isOwner}
        viewerId={user?.id ?? null}
        units={settings?.units ?? "imperial"}
        siteUrl={process.env.NEXT_PUBLIC_SITE_URL ?? ""}
        integrations={integrations()}
      />
    </AccentScope>
  );
}
