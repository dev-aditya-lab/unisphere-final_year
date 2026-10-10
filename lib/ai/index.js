import "server-only";
import { createHash } from "node:crypto";
import { AiError, AI_USER_MESSAGES } from "@/lib/ai/errors";
import { aiAvailability, providerChain } from "@/lib/ai/config";
import { TASKS } from "@/lib/ai/tasks";
import { checkAiLimits, logAiUsage } from "@/lib/ai/usage";
import { looksLikeInjection } from "@/lib/ai/safety/sanitize";
import { getEnv } from "@/lib/env";
import { cacheGetJson, cacheSetJson } from "@/lib/redis";
import { createAdminClient } from "@/lib/supabase/admin";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function failure(code, extra = {}) {
  return { ok: false, code, error: AI_USER_MESSAGES[code] ?? "AI is unavailable right now.", ...extra };
}

/** Extract the JSON object from a model reply (tolerates code fences and stray prose). */
export function parseModelJson(text) {
  const cleaned = String(text ?? "").replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object in reply");
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function memberOptedOut(userId) {
  if (!userId) return false;
  const { data } = await createAdminClient().from("profiles").select("ai_assist_enabled").eq("id", userId).maybeSingle();
  return data?.ai_assist_enabled === false;
}

/**
 * Run one AI task end to end:
 *   availability (env + admin flags) → opt-out → limits → cache → provider chain with bounded retries
 *   → JSON parse + zod validation (with one repair attempt) → usage log.
 * Always resolves; never throws. Social features must keep working whatever happens here.
 *
 * @returns {Promise<{ok:true,data:object,meta:object}|{ok:false,code:string,error:string}>}
 */
export async function runAiTask(taskName, input, { userId = null } = {}) {
  const task = TASKS[taskName];
  if (!task) throw new Error(`Unknown AI task: ${taskName}`);

  const availability = await aiAvailability(task.feature);
  if (!availability.ok) return failure(availability.code);

  if (userId) {
    if (await memberOptedOut(userId)) return failure("opted_out");
    const limits = await checkAiLimits(userId);
    if (!limits.ok) {
      logAiUsage({ userId, task: taskName, status: "rate_limited", errorCode: limits.code });
      return failure(limits.code);
    }
  }

  const { system, user } = task.build(input);
  const flagged = looksLikeInjection(user);

  const cacheKey = task.cacheTtlSec ? `ai:${taskName}:${createHash("sha256").update(system).update("\u0000").update(user).digest("hex")}` : null;
  if (cacheKey) {
    const hit = await cacheGetJson(cacheKey);
    if (hit) {
      logAiUsage({ userId, task: taskName, status: "success", cacheHit: true });
      return { ok: true, data: hit, meta: { cached: true, provider: null, model: null, latencyMs: 0 } };
    }
  }

  const chain = providerChain(task.tier);
  const timeoutMs = getEnv().AI_REQUEST_TIMEOUT_MS;
  let last = null;

  for (const { provider, model } of chain) {
    let userMessage = user;
    let maxTokens = task.maxOutputTokens;

    for (let attempt = 1; attempt <= 2; attempt++) {
      const started = Date.now();
      try {
        const res = await provider.complete({ model, system, user: userMessage, maxTokens, temperature: task.temperature, timeoutMs });
        const latencyMs = Date.now() - started;

        let parsed;
        let problem = null;
        if (res.finishReason === "length") problem = "the reply was cut off";
        else {
          try {
            const result = task.schema.safeParse(parseModelJson(res.text));
            if (result.success) parsed = result.data;
            else problem = result.error.issues.slice(0, 3).map((i) => `${i.path.join(".") || "root"}: ${i.message}`).join("; ");
          } catch (e) {
            problem = `not valid JSON (${e.message})`;
          }
        }

        if (parsed) {
          logAiUsage({ userId, task: taskName, provider: provider.name, model, status: "success", latencyMs, inputTokens: res.inputTokens, outputTokens: res.outputTokens });
          if (cacheKey) cacheSetJson(cacheKey, parsed, task.cacheTtlSec);
          return { ok: true, data: parsed, meta: { cached: false, provider: provider.name, model, latencyMs, flaggedInput: flagged } };
        }

        logAiUsage({ userId, task: taskName, provider: provider.name, model, status: "invalid_output", errorCode: "schema", latencyMs, inputTokens: res.inputTokens, outputTokens: res.outputTokens });
        last = { code: "invalid_output" };
        // One repair attempt: tell the model what was wrong (and allow more room if it was truncated).
        if (attempt === 1) {
          if (res.finishReason === "length") maxTokens = Math.round(maxTokens * 1.7);
          userMessage = `${user}\n\nYour previous reply was rejected because ${problem}. Reply again with ONLY the corrected JSON object.`;
          continue;
        }
        break;
      } catch (err) {
        const latencyMs = Date.now() - started;
        const e = err instanceof AiError ? err : new AiError("unknown", String(err?.message ?? err));
        logAiUsage({
          userId, task: taskName, provider: provider.name, model,
          status: e.kind === "timeout" ? "timeout" : e.kind === "rate_limited" ? "rate_limited" : "error",
          errorCode: e.kind, latencyMs,
        });
        last = {
          code: e.kind === "rate_limited" ? "provider_rate_limited" : e.kind === "timeout" ? "timeout" : e.kind === "model_unavailable" ? "model_unavailable" : "provider_unavailable",
        };
        // Permanent errors (auth, unknown model, bad request) are never retried on this provider.
        if (!e.retryable || attempt === 2) break;
        const wait = e.retryAfterMs ?? 700;
        if (wait > 3000) break; // too long to block a user request; try the next provider or give up
        await sleep(wait);
      }
    }
  }

  return failure(last?.code ?? "provider_unavailable");
}
