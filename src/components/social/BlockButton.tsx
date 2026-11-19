"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Ban } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/** Block or unblock someone. Blocking ends any follow or friendship and hides each other's content. */
export function BlockButton({ me, target, username, blocked }: { me: string; target: string; username: string; blocked: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function toggle() {
    if (!blocked && !confirm(`Block @${username}? You'll stop following each other, and neither of you will see the other's cars, posts or comments.`)) return;
    setBusy(true); setErr(null);
    const sb = createClient();
    const { error } = blocked ? await sb.from("blocks").delete().eq("blocker_id", me).eq("blocked_id", target) : await sb.from("blocks").insert({ blocker_id: me, blocked_id: target });
    setBusy(false);
    if (error) setErr(error.message); else router.refresh();
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" className="btn-quiet !py-2" disabled={busy} onClick={toggle}><Ban size={14} /> {blocked ? "Unblock" : "Block"}</button>
      {err && <span className="text-xs text-bad">{err}</span>}
    </span>
  );
}
