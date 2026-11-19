"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface QueueItem {
  id: string; target_kind: string; target_id: string; target_owner_id: string | null; reason: string; details: string | null; created_at: string;
  reporter: string | null; reasons: string[]; count: number;
  preview: { text?: string | null; image?: string | null; link?: string } | null;
  owner: { username: string; suspended: boolean } | null;
}

export function ModerationQueue({ items }: { items: QueueItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function act(id: string, action: "remove" | "suspend" | "remove_and_suspend" | "dismiss") {
    if (action !== "dismiss" && !confirm(action === "remove" ? "Remove this content?" : "Suspend this account? They won't be able to post, comment or send requests.")) return;
    setBusy(id); setErr(null);
    const { error } = await createClient().rpc("moderate", { report: id, action });
    setBusy(null);
    if (error) setErr(error.message); else router.refresh();
  }
  return (
    <div className="space-y-3">
      {err && <p className="text-sm text-bad" role="alert">{err}</p>}
      {items.map((it) => (
        <article key={it.id} className="panel space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="chip-accent">{it.target_kind}</span>
            {[...new Set(it.reasons)].map((r) => <span key={r} className="chip">{r}</span>)}
            {it.count > 1 && <span className="chip !border-warn/50 !text-warn">{it.count} reports</span>}
            <span className="text-muted">by @{it.owner?.username ?? "unknown"}{it.owner?.suspended && " (suspended)"} · {new Date(it.created_at).toLocaleString()}</span>
          </div>
          {it.preview ? (
            <div className="rounded-lg border border-line bg-surface-2 p-3 text-sm">
              {it.preview.text && <p className="whitespace-pre-line">{it.preview.text}</p>}
              {it.preview.image && <img src={it.preview.image} alt="Reported" className="mt-2 max-h-64 rounded" />}
              {it.preview.link && <Link href={it.preview.link} className="mt-2 inline-block text-accent" target="_blank">Open</Link>}
            </div>
          ) : <p className="text-sm text-muted">The content is gone already.</p>}
          {it.details && <p className="text-sm text-muted">Reporter: “{it.details}”</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary !py-2" disabled={busy === it.id || !it.preview} onClick={() => act(it.id, "remove")}>Remove</button>
            <button type="button" className="btn-ghost !py-2" disabled={busy === it.id || !it.owner || it.owner.suspended} onClick={() => act(it.id, "remove_and_suspend")}>Remove & suspend</button>
            <button type="button" className="btn-quiet !py-2" disabled={busy === it.id} onClick={() => act(it.id, "dismiss")}>Dismiss</button>
          </div>
        </article>
      ))}
    </div>
  );
}
