import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEnv } from "@/lib/env";
import { getSetting } from "@/lib/settings";
import { rateLimit } from "@/lib/rate-limit";

/** Records one AI call (metadata only: never prompts or outputs). Failures here never affect the caller. */
export async function logAiUsage({ userId, task, provider, model, status, errorCode, latencyMs, inputTokens, outputTokens, cacheHit = false }) {
  try {
    await createAdminClient().from("ai_usage_logs").insert({
      user_id: userId ?? null,
      task,
      provider: provider ?? null,
      model: model ?? null,
      status,
      error_code: errorCode ?? null,
      latency_ms: latencyMs ?? null,
      input_tokens: inputTokens ?? null,
      output_tokens: outputTokens ?? null,
      cache_hit: cacheHit,
    });
  } catch (err) {
    console.error("[ai] usage log failed:", err?.message);
  }
}

function startOfUtcDay() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function aiUsageToday(userId) {
  const { count } = await createAdminClient()
    .from("ai_usage_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("cache_hit", false)
    .in("status", ["success", "invalid_output", "error", "timeout"])
    .gte("created_at", startOfUtcDay());
  return count ?? 0;
}

/**
 * Per-user guardrails: a short-window throttle (Redis, in-memory fallback) and a daily budget
 * (PostgreSQL is the source of truth). Both limits are admin-configurable.
 */
export async function checkAiLimits(userId) {
  const policy = (await getSetting("rate_limits"))?.ai ?? { limit: 20, windowSec: 300 };
  const throttle = await rateLimit({ key: `ai:${userId}`, limit: policy.limit, windowSec: policy.windowSec });
  if (!throttle.ok) return { ok: false, code: "rate_limited" };

  const dailyLimit = Number(await getSetting("ai_daily_limit_per_user")) || getEnv().AI_DAILY_LIMIT_PER_USER;
  const used = await aiUsageToday(userId);
  if (used >= dailyLimit) return { ok: false, code: "daily_limit", used, dailyLimit };
  return { ok: true, used, dailyLimit };
}
