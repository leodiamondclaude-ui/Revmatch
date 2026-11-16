import { after, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { buildEntry, claimNext, libraryConfigured, seedCatalog } from "@/lib/agent/library";

export const runtime = "nodejs";
export const maxDuration = 800; // each entry is a multi-minute agent run (longer when a model is generated)

/**
 * Scheduled job (Vercel Cron, see vercel.json): makes sure the catalogue is queued, then builds the
 * most-requested queued entries in the background. Protected by CRON_SECRET, which Vercel Cron sends
 * as a bearer token.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!libraryConfigured()) return NextResponse.json({ error: "Library agent is not configured (ANTHROPIC_API_KEY, SUPABASE_SERVICE_ROLE_KEY and SKETCHFAB_API_TOKEN or MESHY_API_KEY).", code: "not_configured" }, { status: 501 });
  const admin = createServiceClient()!;
  const seeded = await seedCatalog(admin);
  const batch = Math.max(1, Math.min(5, Number(process.env.LIBRARY_BATCH ?? 2) || 2));
  const claimed = await claimNext(admin, batch);
  after(async () => {
    for (const row of claimed) await buildEntry(admin, row); // one at a time keeps Sketchfab, Meshy and Claude rate limits comfortable
  });
  return NextResponse.json({ catalogue: seeded, building: claimed.map((r) => `${r.make} ${r.model}${r.generation ? ` (${r.generation})` : ""}`) });
}
