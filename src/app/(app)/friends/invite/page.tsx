import { requireViewer } from "@/lib/viewer";
import type { Invite } from "@/lib/types";
import { InviteManager } from "./InviteManager";

export const metadata = { title: "Invite friends" };

export default async function InvitePage() {
  const { supabase, user, profile } = await requireViewer();
  const [{ data }, { data: joined }] = await Promise.all([
    supabase.from("invites").select("*").eq("owner_id", user.id).order("created_at", { ascending: false }),
    supabase.from("profiles").select("username").eq("invited_by", user.id).limit(50),
  ]);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="h-display text-3xl sm:text-4xl">Invite friends</h1>
        <p className="mt-1 max-w-2xl text-muted">Send a link to a friend and you&apos;ll be friends the moment they join. Running a meet? Make a QR code for the event: anyone who scans it can sign up and follow you in one go.</p>
      </div>
      <InviteManager userId={user.id} username={profile.username} siteUrl={process.env.NEXT_PUBLIC_SITE_URL ?? ""} invites={(data ?? []) as Invite[]} joined={(joined ?? []).map((j) => j.username as string)} />
    </div>
  );
}
