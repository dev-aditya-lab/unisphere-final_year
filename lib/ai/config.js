import "server-only";
import { getEnv, getIntegrations } from "@/lib/env";
import { isFlagEnabled } from "@/lib/settings";
import { createGroqProvider } from "@/lib/ai/providers/groq";
import { createNvidiaProvider } from "@/lib/ai/providers/nvidia";
import { createOpenAiCompatibleProvider } from "@/lib/ai/providers/openai-compatible";

/**
 * Model tiers by task need, not marketing names:
 *   fast  → short structured tasks (tags, titles, classification, concept extraction)
 *   smart → reasoning-heavy tasks (improvement ideas, originality, explanations)
 *   safety→ optional policy model for moderation suggestions (falls back to smart)
 * All model ids come from the environment; /admin/ai shows which ones the key can actually use.
 */
export function aiModels() {
  const e = getEnv();
  return { fast: e.GROQ_MODEL_FAST, smart: e.GROQ_MODEL_SMART, safety: e.GROQ_MODEL_SAFETY || e.GROQ_MODEL_SMART };
}

/**
 * Ordered provider/model attempts for a tier: Groq first, then the optional compatible fallback.
 * A task can pin itself to one provider ("nvidia"); it then never falls through to the others.
 */
export function providerChain(tier, only = null) {
  const e = getEnv();
  const integrations = getIntegrations();
  const models = aiModels();
  if (only === "nvidia") {
    return integrations.nvidia ? [{ provider: createNvidiaProvider({ baseUrl: e.NVIDIA_AI_BASE_URL, apiKey: e.NVIDIA_AI_API_KEY }), model: e.NVIDIA_AI_MODEL }] : [];
  }
  const chain = [];
  if (integrations.groq) chain.push({ provider: createGroqProvider({ apiKey: e.GROQ_API_KEY }), model: models[tier] });
  if (integrations.aiFallback) {
    chain.push({
      provider: createOpenAiCompatibleProvider({ baseUrl: e.AI_FALLBACK_BASE_URL, apiKey: e.AI_FALLBACK_API_KEY }),
      model: e.AI_FALLBACK_MODEL,
    });
  }
  return chain;
}

/** Whether AI may run right now (environment, provider configuration and admin feature flags). */
export async function aiAvailability(feature, only = null) {
  const integrations = getIntegrations();
  if (!getEnv().AI_ENABLED) return { ok: false, code: "ai_disabled" };
  if (only === "nvidia" ? !integrations.nvidia : !integrations.groq && !integrations.aiFallback) return { ok: false, code: "not_configured" };
  if (!(await isFlagEnabled("ai_features"))) return { ok: false, code: "ai_disabled" };
  if (feature && !(await isFlagEnabled(feature))) return { ok: false, code: "ai_disabled" };
  return { ok: true };
}
