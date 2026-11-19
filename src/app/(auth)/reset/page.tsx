"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** Reached from the reset email (the callback signs the user in first). */
export default function Reset() {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) { setErr("Use at least 8 characters."); return; }
    if (pw !== pw2) { setErr("The two passwords don't match."); return; }
    setBusy(true); setErr(null);
    const { error } = await createClient().auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { setErr(error.message.includes("session") ? "This reset link has expired. Ask for a new one." : error.message); return; }
    router.replace("/dashboard");
    router.refresh();
  }
  return (
    <form onSubmit={save} className="panel panel-accent space-y-4 p-6">
      <h1 className="h-display text-3xl">Choose a new password</h1>
      <label className="block space-y-1.5"><span className="label">New password</span><input className="input" type="password" minLength={8} required value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></label>
      <label className="block space-y-1.5"><span className="label">Again</span><input className="input" type="password" minLength={8} required value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" /></label>
      {err && <p className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad" role="alert">{err}</p>}
      <button className="btn-primary w-full" disabled={busy}>{busy ? "Saving…" : "Save password"}</button>
    </form>
  );
}
