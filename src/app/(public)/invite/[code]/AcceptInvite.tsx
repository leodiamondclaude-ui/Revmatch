"use client";
import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** For people who already have an account: add the friend or follow the host. */
export function AcceptInvite({ code, kind, host }: { code: string; kind: "personal" | "meet"; host: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "own" | "error">("idle");
  async function go() {
    setState("busy");
    const { data, error } = await createClient().rpc("accept_invite", { c: code });
    setState(error || data === "invalid" ? "error" : data === "own" ? "own" : "done");
  }
  if (state === "own") return <p className="text-sm text-muted">This is your own invite. Share it with someone else.</p>;
  if (state === "done") return <div className="space-y-2"><p className="text-ok">{kind === "meet" ? `You're following @${host}.` : `You and @${host} are friends.`}</p><Link href={`/u/${host}`} className="btn-primary w-full">See their garage</Link></div>;
  return (
    <div className="space-y-2">
      <button type="button" className="btn-primary w-full" onClick={go} disabled={state === "busy"}>{state === "busy" ? "…" : kind === "meet" ? `Follow @${host}` : `Add @${host} as a friend`}</button>
      {state === "error" && <p className="text-sm text-bad" role="alert">That didn&apos;t work. The invite may have just expired.</p>}
    </div>
  );
}
