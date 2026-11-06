"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setNotice(null);
    const supabase = createClient();
    try {
      if (mode === "signup") {
        const clean = username.toLowerCase();
        if (!/^[a-z0-9_]{3,24}$/.test(clean)) throw new Error("Username: 3–24 characters, letters, numbers and underscores.");
        const { data: taken } = await supabase.from("profiles").select("id").eq("username", clean).maybeSingle();
        if (taken) throw new Error("That username is taken.");
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { data: { username: clean }, emailRedirectTo: `${window.location.origin}/auth/callback?next=/garage/new` },
        });
        if (error) throw error;
        if (!data.session) { setNotice("Check your inbox to confirm your email, then sign in."); return; }
        router.replace("/garage/new");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace(next);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function magicLink() {
    if (!email) { setError("Enter your email first."); return; }
    setBusy(true); setError(null);
    const { error } = await createClient().auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`, shouldCreateUser: false } });
    setBusy(false);
    if (error) setError(error.message); else setNotice("Sign-in link sent. Check your inbox.");
  }

  return (
    <form onSubmit={submit} className="panel panel-accent space-y-4 p-6">
      <div>
        <h1 className="h-display text-3xl">{mode === "login" ? "Welcome back" : "Open your garage"}</h1>
        <p className="mt-1 text-sm text-muted">{mode === "login" ? "Sign in to your garage and telemetry." : "Free account. Your data stays private until you choose to share it."}</p>
      </div>
      {mode === "signup" && (
        <label className="block space-y-1.5">
          <span className="label">Username</span>
          <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="apex_hunter" autoComplete="username" required />
        </label>
      )}
      <label className="block space-y-1.5">
        <span className="label">Email</span>
        <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
      </label>
      <label className="block space-y-1.5">
        <span className="label">Password</span>
        <input className="input" type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} required />
      </label>
      {error && <p className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad" role="alert">{error}</p>}
      {notice && <p className="rounded-lg border border-ok/40 bg-ok/10 px-3 py-2 text-sm text-ok">{notice}</p>}
      <button className="btn-primary w-full" disabled={busy}>{busy ? "…" : mode === "login" ? "Sign in" : "Create account"}</button>
      {mode === "login" && <button type="button" onClick={magicLink} className="btn-quiet w-full" disabled={busy}>Email me a sign-in link</button>}
      <p className="text-center text-sm text-muted">
        {mode === "login" ? <>New here? <Link className="text-accent" href="/signup">Create an account</Link></> : <>Have an account? <Link className="text-accent" href="/login">Sign in</Link></>}
      </p>
    </form>
  );
}
