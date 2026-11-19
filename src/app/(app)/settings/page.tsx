import Link from "next/link";
import { requireViewer } from "@/lib/viewer";
import type { Vehicle } from "@/lib/types";
import { BlockButton } from "@/components/social/BlockButton";
import { SettingsForm } from "./SettingsForm";
import { AccountSection } from "./AccountSection";

export const metadata = { title: "Settings" };

export default async function Settings() {
  const { supabase, user, profile, settings } = await requireViewer();
  const [{ data }, { data: blocks }] = await Promise.all([
    supabase.from("vehicles").select("id, year, make, model, nickname, exterior_color_hex").eq("owner_id", user.id),
    supabase.from("blocks").select("blocked_id, blocked:profiles!blocks_blocked_id_fkey(username)").eq("blocker_id", user.id),
  ]);
  const blocked = (blocks ?? []) as unknown as { blocked_id: string; blocked: { username: string } | null }[];
  return (
    <div className="space-y-6">
      <h1 className="h-display text-3xl sm:text-4xl">Settings</h1>
      {profile.suspended_at && <div className="rounded-xl border border-bad/40 bg-bad/10 p-4 text-sm" role="alert">Your account is suspended after a report, so you can&apos;t post, comment or send requests. Your garage and drives still work. Contact us if you think this is a mistake.</div>}
      <SettingsForm profile={profile} settings={settings} vehicles={(data ?? []) as Vehicle[]} email={user.email ?? ""} />
      <section className="panel space-y-3 p-5">
        <h2 className="h-display text-2xl">Blocked accounts</h2>
        {blocked.length === 0 ? <p className="text-sm text-muted">You haven&apos;t blocked anyone. You can block someone from their profile.</p> : (
          <ul className="divide-y divide-line">{blocked.map((b) => <li key={b.blocked_id} className="flex items-center justify-between py-2"><span>@{b.blocked?.username ?? "deleted account"}</span><BlockButton me={user.id} target={b.blocked_id} username={b.blocked?.username ?? ""} blocked /></li>)}</ul>
        )}
      </section>
      <AccountSection />
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/setup" className="btn-quiet">Integration status</Link>
        <Link href="/privacy" className="btn-quiet">Privacy policy</Link>
        <Link href="/terms" className="btn-quiet">Terms</Link>
        <form action="/auth/signout" method="post"><button className="btn-ghost">Sign out</button></form>
      </div>
    </div>
  );
}
