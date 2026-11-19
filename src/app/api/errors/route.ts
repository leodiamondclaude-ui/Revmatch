import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/supabase/server";
import { reportError } from "@/lib/errors";

export const runtime = "nodejs";

// Light per-instance throttle so one broken page can't flood the table.
const seen = new Map<string, { n: number; at: number }>();
function allow(key: string) {
  const now = Date.now(), cur = seen.get(key);
  if (!cur || now - cur.at > 60_000) { seen.set(key, { n: 1, at: now }); if (seen.size > 5000) seen.clear(); return true; }
  return ++cur.n <= 10;
}

const Body = z.object({ message: z.string().max(2000), stack: z.string().max(8000).optional(), digest: z.string().max(200).optional(), path: z.string().max(500).optional() });

/** Crash reports from the browser's error boundaries. */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!allow(ip)) return NextResponse.json({ ok: false }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  const { user } = await getSessionUser().catch(() => ({ user: null }));
  const err = Object.assign(new Error(parsed.data.message), { stack: parsed.data.stack });
  await reportError("client", err, { path: parsed.data.path, digest: parsed.data.digest, userId: user?.id ?? null, ua: req.headers.get("user-agent")?.slice(0, 200) });
  return NextResponse.json({ ok: true });
}
