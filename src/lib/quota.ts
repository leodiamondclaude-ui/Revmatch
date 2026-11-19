import "server-only";
import { createServiceClient } from "./supabase/server";

/**
 * Per-user daily limits on paid AI work (Claude calls, Meshy generations, agent runs), so one account
 * can't run up the bill. Limits can be changed with AI_LIMIT_<KIND> environment variables.
 */
export type AiKind = "identify" | "lookup" | "agent" | "generate";
const DEFAULTS: Record<AiKind, number> = { identify: 12, lookup: 30, agent: 3, generate: 2 };
const LABEL: Record<AiKind, string> = { identify: "photo readings", lookup: "car lookups", agent: "3D model builds", generate: "AI 3D generations" };

export const aiLimit = (kind: AiKind) => {
  const v = Number(process.env[`AI_LIMIT_${kind.toUpperCase()}`]);
  return Number.isFinite(v) && v >= 0 ? v : DEFAULTS[kind];
};

/** Check the caller's usage in the last 24 hours. Call record() once the paid call has succeeded. */
export async function aiQuota(userId: string, kind: AiKind) {
  const admin = createServiceClient();
  const limit = aiLimit(kind);
  // Without the service role there's nowhere trustworthy to count; allow (local development).
  if (!admin) return { ok: true as const, used: 0, limit, record: async () => {} };
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count } = await admin.from("ai_usage").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("kind", kind).gte("created_at", since);
  const used = count ?? 0;
  const record = async () => { await admin.from("ai_usage").insert({ user_id: userId, kind }); };
  if (used >= limit) return { ok: false as const, used, limit, message: `You've reached today's limit of ${limit} ${LABEL[kind]}. It resets within 24 hours.`, record };
  return { ok: true as const, used, limit, record };
}
