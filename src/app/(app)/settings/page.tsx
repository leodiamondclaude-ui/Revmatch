import Link from "next/link";
import { requireViewer } from "@/lib/viewer";
import type { Vehicle } from "@/lib/types";
import { SettingsForm } from "./SettingsForm";

export const metadata = { title: "Settings" };

export default async function Settings() {
  const { supabase, user, profile, settings } = await requireViewer();
  const { data } = await supabase.from("vehicles").select("id, year, make, model, nickname, exterior_color_hex").eq("owner_id", user.id);
  return (
    <div className="space-y-6">
      <h1 className="h-display text-3xl sm:text-4xl">Settings</h1>
      <SettingsForm profile={profile} settings={settings} vehicles={(data ?? []) as Vehicle[]} email={user.email ?? ""} />
      <div className="flex flex-wrap gap-3">
        <Link href="/setup" className="btn-quiet">Integration status</Link>
        <form action="/auth/signout" method="post"><button className="btn-ghost">Sign out</button></form>
      </div>
    </div>
  );
}
