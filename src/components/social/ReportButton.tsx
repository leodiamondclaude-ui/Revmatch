"use client";
import { useState } from "react";
import { Flag } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/ui/Modal";

const REASONS = [
  ["spam", "Spam or scam"], ["harassment", "Harassment or bullying"], ["hate", "Hate speech"], ["sexual", "Sexual content"],
  ["violence", "Violence or dangerous driving"], ["illegal", "Illegal activity"], ["impersonation", "Pretending to be someone else"], ["other", "Something else"],
] as const;

/** Report a post, comment, profile, car or photo to the moderators. */
export function ReportButton({ kind, targetId, ownerId, viewerId, compact = false }: { kind: "post" | "comment" | "profile" | "vehicle" | "photo"; targetId: string; ownerId: string; viewerId: string | null; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("spam");
  const [details, setDetails] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);
  if (!viewerId || viewerId === ownerId) return null;
  async function send(e: React.FormEvent) {
    e.preventDefault();
    setState("sending"); setErr(null);
    const { error } = await createClient().from("reports").insert({ reporter_id: viewerId, target_kind: kind, target_id: targetId, target_owner_id: ownerId, reason, details: details.trim() || null });
    if (error && error.code !== "23505") { setErr(error.message); setState("error"); return; } // 23505: already reported
    setState("sent");
  }
  return (
    <>
      <button type="button" onClick={() => { setOpen(true); setState("idle"); }} className={compact ? "text-dim hover:text-warn" : "btn-quiet !py-2"} aria-label={`Report this ${kind}`}>
        <Flag size={compact ? 13 : 14} />{!compact && " Report"}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Report this ${kind}`}>
        {state === "sent" ? (
          <div className="space-y-3"><p>Thanks. A moderator will look at it. We don&apos;t tell the person who reported them.</p><button type="button" className="btn-primary w-full" onClick={() => setOpen(false)}>Done</button></div>
        ) : (
          <form onSubmit={send} className="space-y-3">
            <fieldset className="space-y-1.5">
              <legend className="label mb-1">What&apos;s wrong?</legend>
              {REASONS.map(([v, l]) => <label key={v} className="flex items-center gap-2 text-sm"><input type="radio" name="reason" value={v} checked={reason === v} onChange={() => setReason(v)} className="accent-[var(--accent)]" /> {l}</label>)}
            </fieldset>
            <textarea className="input min-h-20" maxLength={1000} placeholder="Anything that would help (optional)" value={details} onChange={(e) => setDetails(e.target.value)} />
            {err && <p className="text-sm text-bad" role="alert">{err}</p>}
            <button className="btn-primary w-full" disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Send report"}</button>
          </form>
        )}
      </Modal>
    </>
  );
}
