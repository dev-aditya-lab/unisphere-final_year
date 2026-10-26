import "server-only";
import { getEnv, getEmbeddingConfig, getIntegrations } from "@/lib/env";
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
 *   nvidia             NVIDIA hosted NIM (build.nvidia.com), e.g. nvidia/nemotron-3.5-embed-8b. Its vectors are longer than
 *                      the column (4096 / 2048), so the leading EMBEDDING_DIMENSIONS values are kept (Matryoshka truncation)
 * Vectors must match the vector(768) column; they are L2-normalised so cosine distance is consistent.
 *
 * One index, one model: vectors from different models are not comparable (the nemotron 8B and 1B models score ~0 against
 * each other on identical text). There is therefore no automatic cross-model fallback. Changing EMBEDDING_MODEL makes the
 * worker re-embed everything stored by the old model (see requeueStaleEmbeddings), and until then search is keyword-only.
 */

export function embeddingStatus() {
  const cfg = getEmbeddingConfig();
  const configured = getIntegrations().embeddings;
  return { configured, provider: configured ? cfg.provider : "none", model: configured ? cfg.model : null, dimensions: cfg.dimensions };
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

async function requestVector(text, { purpose }) {
  const e = getEnv();
  const cfg = getEmbeddingConfig();
  const dims = cfg.dimensions;
  // A member is waiting on a query; stored content is embedded in the background, where a slow answer is fine
  // (NVIDIA's hosted models take anywhere from 1 to 25 seconds).
  const timeoutMs = purpose === "query" ? Math.min(e.AI_REQUEST_TIMEOUT_MS, 10000) : Math.max(e.AI_REQUEST_TIMEOUT_MS, 30000);

  if (cfg.provider === "gemini") {
    const model = cfg.model.replace(/^models\//, "");
    const json = await callWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": cfg.apiKey },
        body: JSON.stringify({ content: { parts: [{ text }] }, taskType: purpose === "query" ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT", outputDimensionality: dims }),
      },
      timeoutMs,
    );
    return json?.embedding?.values;
  }

  if (cfg.provider === "nvidia") {
    // input_type makes the service add the model's own "query:" / "passage:" prefix.
    const json = await callWithTimeout(
      `${cfg.baseUrl.replace(/\/$/, "")}/embeddings`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({ model: cfg.model, input: [text], input_type: purpose === "query" ? "query" : "passage", truncate: "END", encoding_format: "float" }),
      },
      timeoutMs,
    );
    const full = json?.data?.[0]?.embedding;
    // Matryoshka models front-load meaning, so the leading values are a smaller embedding (re-normalised by the caller).
    return Array.isArray(full) && full.length > dims ? full.slice(0, dims) : full;
  }

  const json = await callWithTimeout(
    `${cfg.baseUrl.replace(/\/$/, "")}/embeddings`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ model: cfg.model, input: text, dimensions: dims }),
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
  const cfg = getEmbeddingConfig();
  // A search typed by a member is theirs to send only if they allowed AI features; stored content has its own check (jobs.js).
  if (purpose === "query" && userId && !(await hasConsent(userId, "ai_assist"))) return { ok: false, code: "consent_required" };
  const input = maskPersonalData(String(text ?? "").trim()).slice(0, 6000);
  if (!input) return { ok: false, code: "empty" };

  const started = Date.now();
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const raw = await requestVector(input, { purpose });
      if (!Array.isArray(raw) || raw.length !== cfg.dimensions || raw.some((v) => typeof v !== "number")) {
        // A dimension mismatch is a configuration error: retrying cannot fix it.
        logAiUsage({ userId, task: "embed", provider: cfg.provider, model: cfg.model, status: "error", errorCode: "dimension_mismatch" });
        return { ok: false, code: "dimension_mismatch" };
      }
      logAiUsage({ userId, task: "embed", provider: cfg.provider, model: cfg.model, status: "success", latencyMs: Date.now() - started });
      return { ok: true, vector: normalise(raw), model: cfg.model };
    } catch (err) {
      const kind = err instanceof AiError ? err.kind : "unknown";
      logAiUsage({ userId, task: "embed", provider: cfg.provider, model: cfg.model, status: kind === "timeout" ? "timeout" : kind === "rate_limited" ? "rate_limited" : "error", errorCode: kind, latencyMs: Date.now() - started });
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
