import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { reportError } from "@/lib/errors";
import { failModelAgentJob, runModelAgentJob, type ModelAgentPayload } from "./modelAgent";

type Job = { id: string; kind: "model_agent"; owner_id: string | null; vehicle_id: string | null; payload: unknown; attempts: number; max_attempts: number };

const HANDLERS = {
  model_agent: {
    run: (admin: SupabaseClient, j: Job) => runModelAgentJob(admin, j.vehicle_id!, j.payload as ModelAgentPayload),
    fail: (admin: SupabaseClient, j: Job, msg: string) => failModelAgentJob(admin, j.vehicle_id!, j.payload as ModelAgentPayload, msg),
  },
} as const;

/** Queue a job. Returns false if the same job is already queued or running. */
export async function enqueue(admin: SupabaseClient, job: { kind: Job["kind"]; ownerId: string; vehicleId: string; payload: object; maxAttempts?: number }) {
  const { error } = await admin.from("jobs").insert({ kind: job.kind, owner_id: job.ownerId, vehicle_id: job.vehicleId, payload: job.payload, max_attempts: job.maxAttempts ?? 2 });
  if (error?.code === "23505") return false;
  if (error) throw error;
  return true;
}

/** Claim and run up to n jobs one after another. Failures retry after a short wait until max_attempts. */
export async function runJobs(admin: SupabaseClient, n = 1) {
  const { data, error } = await admin.rpc("claim_jobs", { n });
  if (error) { await reportError("job", error, { step: "claim" }); return { ran: 0 }; }
  const jobs = (data ?? []) as Job[];
  for (const j of jobs) {
    const h = HANDLERS[j.kind];
    try {
      await h.run(admin, j);
      await admin.from("jobs").update({ status: "done", finished_at: new Date().toISOString(), locked_at: null, last_error: null }).eq("id", j.id);
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      const last = j.attempts >= j.max_attempts;
      await admin.from("jobs").update(last
        ? { status: "failed", finished_at: new Date().toISOString(), locked_at: null, last_error: msg.slice(0, 2000) }
        : { status: "queued", locked_at: null, last_error: msg.slice(0, 2000), run_after: new Date(Date.now() + 2 * 60_000).toISOString() }).eq("id", j.id);
      await reportError("job", e, { jobId: j.id, kind: j.kind, attempt: j.attempts, final: last, userId: j.owner_id });
      if (last) await h.fail(admin, j, msg).catch(() => {});
    }
  }
  return { ran: jobs.length };
}

/** Jobs the database gave up on because the worker died (claim_jobs marks them failed) still need their cleanup. */
export async function settleAbandoned(admin: SupabaseClient) {
  const since = new Date(Date.now() - 24 * 3600e3).toISOString();
  const { data } = await admin.from("jobs").select("id, kind, owner_id, vehicle_id, payload, attempts, max_attempts, last_error")
    .eq("status", "failed").eq("last_error", "worker stopped before finishing").gte("finished_at", since);
  for (const j of (data ?? []) as (Job & { last_error: string })[]) {
    await HANDLERS[j.kind].fail(admin, j, "the run was interrupted. Try again.").catch(() => {});
    await admin.from("jobs").update({ last_error: "worker stopped before finishing (settled)" }).eq("id", j.id);
  }
}
