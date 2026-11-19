import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

type Source = "server" | "client" | "job";
const clip = (s: unknown, n: number) => (s == null ? null : String(s).slice(0, n));

/**
 * Record an error: always to the server log, to the error_events table when the service role key is set,
 * and to ERROR_WEBHOOK_URL (Slack/Discord-style incoming webhook) when configured. Never throws.
 */
export async function reportError(source: Source, err: unknown, ctx: { path?: string | null; digest?: string | null; userId?: string | null; [k: string]: unknown } = {}) {
  const e = err instanceof Error ? err : new Error(typeof err === "string" ? err : JSON.stringify(err));
  const { path = null, digest = null, userId = null, ...rest } = ctx;
  console.error(`[${source}] ${e.message}${path ? ` (${path})` : ""}`, e.stack ?? "");
  try {
    const admin = createServiceClient();
    if (admin) {
      await admin.from("error_events").insert({
        source, message: clip(e.message || "Unknown error", 2000), digest: clip(digest, 200), path: clip(path, 500), stack: clip(e.stack, 8000),
        user_id: userId && /^[0-9a-f-]{36}$/i.test(userId) ? userId : null, context: JSON.parse(JSON.stringify(rest ?? {})),
      });
    }
    const hook = process.env.ERROR_WEBHOOK_URL;
    if (hook) {
      const text = `RevMatch ${source} error: ${clip(e.message, 300)}${path ? `\n${path}` : ""}`;
      await fetch(hook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, content: text }), signal: AbortSignal.timeout(4000) });
    }
  } catch (inner) {
    console.error("[errors] could not record error", inner);
  }
}
