"use client";
import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function Forgot() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [err, setErr] = useState<string | null>(null);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    setState("sending"); setErr(null);
    const { error } = await createClient().auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/callback?next=/reset` });
    if (error) { setErr(error.message); setState("idle"); return; }
    setState("sent");
  }
  return (
    <form onSubmit={send} className="panel panel-accent space-y-4 p-6">
      <div><h1 className="h-display text-3xl">Reset your password</h1><p className="mt-1 text-sm text-muted">We&apos;ll email you a link to set a new one.</p></div>
      {state === "sent" ? <p className="rounded-lg border border-ok/40 bg-ok/10 px-3 py-2 text-sm text-ok">If an account uses that email, a reset link is on its way. Check your inbox.</p> : (
        <>
          <label className="block space-y-1.5"><span className="label">Email</span><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
          {err && <p className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad" role="alert">{err}</p>}
          <button className="btn-primary w-full" disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Send reset link"}</button>
        </>
      )}
      <p className="text-center text-sm text-muted"><Link href="/login" className="text-accent">Back to sign in</Link></p>
    </form>
  );
}
