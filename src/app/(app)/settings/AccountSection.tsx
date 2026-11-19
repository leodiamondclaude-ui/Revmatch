"use client";
import { useState } from "react";
import { Download, Trash2 } from "lucide-react";

/** Download my data, and delete my account. */
export function AccountSection() {
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function del() {
    setBusy(true); setErr(null);
    const r = await fetch("/api/account/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: confirmText }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error ?? "Something went wrong."); setBusy(false); return; }
    window.location.href = "/?deleted=1";
  }
  return (
    <section className="panel space-y-5 p-5">
      <h2 className="h-display text-2xl">Your data</h2>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><div className="font-semibold">Download my data</div><div className="text-sm text-muted">Your profile, cars, mods, photos (as links), drives including raw GPS, posts, comments and connections, as a JSON file.</div></div>
        <a className="btn-ghost" href="/api/account/export" download><Download size={16} /> Download</a>
      </div>
      <div className="space-y-3 rounded-xl border border-bad/40 p-4">
        <div className="font-semibold text-bad">Delete my account</div>
        <p className="text-sm text-muted">Permanently deletes your account, cars, photos, 3D models, drives, posts, comments and connections. This can&apos;t be undone. Download your data first if you want a copy.</p>
        <div className="flex flex-wrap items-center gap-2">
          <input className="input !w-48" placeholder='Type "DELETE"' value={confirmText} onChange={(e) => setConfirmText(e.target.value)} aria-label="Type DELETE to confirm" />
          <button type="button" className="btn-ghost !border-bad/50 !text-bad" disabled={confirmText !== "DELETE" || busy} onClick={del}><Trash2 size={16} /> {busy ? "Deleting…" : "Delete everything"}</button>
        </div>
        {err && <p className="text-sm text-bad" role="alert">{err}</p>}
      </div>
    </section>
  );
}
