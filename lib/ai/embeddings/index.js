import "server-only";
import { getEnv, getIntegrations } from "@/lib/env";
import { isFlagEnabled } from "@/lib/settings";
import { AiError, errorFromStatus } from "@/lib/ai/errors";
import { logAiUsage } from "@/lib/ai/usage";
import { maskPersonalData } from "@/lib/privacy/redact";
import { hasConsent } from "@/lib/privacy/consent";

/**
 * Embeddings are OPTIONAL. Groq provides chat models only, so semantic search is active only when a
 * real embedding provider is configured (EMBEDDING_PROVIDER + key/model). Otherwise every search
 * falls back to PostgreSQL full-text and the UI says so; nothing pretends semantic search is on.
 *
 * Supported providers:
 *   openai-compatible  POST {base}/embeddings (OpenAI, Jina, Together, Ollama, vLLM…)
 *   gemini             Google Generative Language API embedContent
 * Vectors must match the vector(768) column; they are L2-normalised so cosine distance is consistent.
 */

export function embeddingStatus() {
  const e = getEnv();
  const configured = getIntegrations().embeddings;
  return { configured, provider: configured ? e.EMBEDDING_PROVIDER : "none", model: configured ? e.EMBEDDING_MODEL : null, dimensions: e.EMBEDDING_DIMENSIONS };
}

export async function embeddingsActive() {
  return getIntegrations().embeddings && (await isFlagEnabled("semantic_search"));
}

function normalise(vec) {
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

async function callWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) throw errorFromStatus(res.status, `Embedding provider returned ${res.status}`, res.headers);
    return await res.json();
  } catch (err) {
    if (err instanceof AiError) throw err;
    if (err?.name === "AbortError") throw new AiError("timeout", "Embedding request timed out", { retryable: true });
    throw new AiError("unavailable", `Embedding request failed: ${String(err?.message ?? err).slice(0, 160)}`, { retryable: true });
  } finally {
    clearTimeout(timer);
  }
}

async function requestVector(text, { taskType }) {
  const e = getEnv();
  const dims = e.EMBEDDING_DIMENSIONS;
  const timeoutMs = Math.min(e.AI_REQUEST_TIMEOUT_MS, 15000);

  if (e.EMBEDDING_PROVIDER === "gemini") {
    const model = e.EMBEDDING_MODEL.replace(/^models\//, "");
    const json = await callWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": e.EMBEDDING_API_KEY },
        body: JSON.stringify({ content: { parts: [{ text }] }, taskType, outputDimensionality: dims }),
      },
      timeoutMs,
    );
    return json?.embedding?.values;
  }

  const json = await callWithTimeout(
    `${e.EMBEDDING_BASE_URL.replace(/\/$/, "")}/embeddings`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${e.EMBEDDING_API_KEY}` },
      body: JSON.stringify({ model: e.EMBEDDING_MODEL, input: text, dimensions: dims }),
    },
    timeoutMs,
  );
  return json?.data?.[0]?.embedding;
}

/**
 * Embed text. `purpose`: 'document' (stored content) or 'query' (a search). Always resolves.
 * @returns {Promise<{ok:true,vector:number[],model:string}|{ok:false,code:string}>}
 */
export async function embedText(text, { purpose = "document", userId = null } = {}) {
  if (!(await embeddingsActive())) return { ok: false, code: "not_configured" };
  const e = getEnv();
  // A search typed by a member is theirs to send only if they allowed AI features; stored content has its own check (jobs.js).
  if (purpose === "query" && userId && !(await hasConsent(userId, "ai_assist"))) return { ok: false, code: "consent_required" };
  const input = maskPersonalData(String(text ?? "").trim()).slice(0, 6000);
  if (!input) return { ok: false, code: "empty" };

  const started = Date.now();
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const raw = await requestVector(input, { taskType: purpose === "query" ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT" });
      if (!Array.isArray(raw) || raw.length !== e.EMBEDDING_DIMENSIONS || raw.some((v) => typeof v !== "number")) {
        // A dimension mismatch is a configuration error: retrying cannot fix it.
        logAiUsage({ userId, task: "embed", provider: e.EMBEDDING_PROVIDER, model: e.EMBEDDING_MODEL, status: "error", errorCode: "dimension_mismatch" });
        return { ok: false, code: "dimension_mismatch" };
      }
      logAiUsage({ userId, task: "embed", provider: e.EMBEDDING_PROVIDER, model: e.EMBEDDING_MODEL, status: "success", latencyMs: Date.now() - started });
      return { ok: true, vector: normalise(raw), model: e.EMBEDDING_MODEL };
    } catch (err) {
      const kind = err instanceof AiError ? err.kind : "unknown";
      logAiUsage({ userId, task: "embed", provider: e.EMBEDDING_PROVIDER, model: e.EMBEDDING_MODEL, status: kind === "timeout" ? "timeout" : kind === "rate_limited" ? "rate_limited" : "error", errorCode: kind, latencyMs: Date.now() - started });
      if (!(err instanceof AiError) || !err.retryable || attempt === 2) return { ok: false, code: kind === "auth" ? "auth" : "unavailable", permanent: !(err instanceof AiError && err.retryable) };
      await new Promise((r) => setTimeout(r, Math.min(err.retryAfterMs ?? 600, 2500)));
    }
  }
  return { ok: false, code: "unavailable" };
}

/** pgvector accepts the text form "[0.1,0.2,…]". */
export function toPgVector(vector) {
  return `[${vector.map((v) => Number(v.toFixed(6))).join(",")}]`;
}
