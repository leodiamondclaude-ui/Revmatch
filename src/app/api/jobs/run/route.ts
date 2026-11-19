import { after, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { runJobs, settleAbandoned } from "@/lib/jobs";

export const runtime = "nodejs";
export const maxDuration = 800;

/**
 * Job worker (Vercel Cron, see vercel.json). Picks up queued jobs, retries ones whose worker died,
 * and trims old job and error rows. Protected by CRON_SECRET, which Vercel Cron sends as a bearer token.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createServiceClient();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set", code: "not_configured" }, { status: 501 });
  const { count } = await admin.from("jobs").select("id", { count: "exact", head: true }).eq("status", "queued").lte("run_after", new Date().toISOString());
  after(async () => {
    await runJobs(admin, Math.max(1, Math.min(3, Number(process.env.JOB_BATCH ?? 2) || 2)));
    await settleAbandoned(admin);
    const month = new Date(Date.now() - 30 * 86400e3).toISOString();
    await admin.from("error_events").delete().lt("at", month);
    await admin.from("jobs").delete().in("status", ["done", "cancelled"]).lt("created_at", month);
  });
  return NextResponse.json({ queued: count ?? 0 });
}
