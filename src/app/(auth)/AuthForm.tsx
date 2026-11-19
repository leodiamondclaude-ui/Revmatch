"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";
  const inviteParam = params.get("invite");
  const invite = inviteParam && /^[A-Za-z0-9]{6,16}$/.test(inviteParam) ? inviteParam : null;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setNotice(null);
    try {
      const clean = username.toLowerCase();
      if (mode === "signup" && !/^[a-z0-9_]{3,24}$/.test(clean)) throw new Error("Username: 3–24 characters, letters, numbers and underscores.");
      const supabase = createClient();
      if (mode === "signup") {
        const { data: taken } = await supabase.from("profiles").select("id").eq("username", clean).maybeSingle();
        if (taken) throw new Error("That username is taken.");
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { data: { username: clean, ...(invite ? { invite } : {}) }, emailRedirectTo: `${window.location.origin}/auth/callback?next=/garage/new` },
        });
        if (error) throw /database error/i.test(error.message) ? new Error(invite ? "That invite stopped working. Ask for a new link." : "Sign-ups are invite-only right now. Ask a member for an invite link.") : error;
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
      {mode === "signup" && invite && <p className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm">You&apos;re signing up with an invite. You&apos;ll be connected with the person who sent it.</p>}
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
      {mode === "signup" && <p className="text-xs text-muted">By creating an account you agree to the <Link href="/terms" className="text-accent">terms</Link> and <Link href="/privacy" className="text-accent">privacy policy</Link>, and confirm you&apos;re 16 or older.</p>}
      <button className="btn-primary w-full" disabled={busy}>{busy ? "…" : mode === "login" ? "Sign in" : "Create account"}</button>
      {mode === "login" && <div className="flex flex-wrap justify-between gap-2"><button type="button" onClick={magicLink} className="btn-quiet" disabled={busy}>Email me a sign-in link</button><Link href="/forgot" className="btn-quiet">Forgot password?</Link></div>}
      <p className="text-center text-sm text-muted">
        {mode === "login" ? <>New here? <Link className="text-accent" href="/signup">Create an account</Link></> : <>Have an account? <Link className="text-accent" href="/login">Sign in</Link></>}
      </p>
    </form>
  );
}
