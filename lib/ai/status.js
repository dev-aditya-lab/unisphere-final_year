import "server-only";
import { getEnv } from "@/lib/env";

/**
 * Asks Groq which models this API key can use right now (GET /models). Cached for a minute so the admin
 * page can be refreshed freely. Never throws; the admin page shows the error text instead.
 */
let cache = null;

export async function listProviderModels() {
  if (cache && Date.now() - cache.at < 60_000) return cache.value;
  const key = getEnv().GROQ_API_KEY;
  if (!key) return { ok: false, error: "No API key configured." };
  try {
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, error: `Groq answered ${res.status}.` };
    const body = await res.json();
    const models = (body.data ?? []).map((m) => m.id).filter(Boolean).sort();
    const value = { ok: true, models };
    cache = { at: Date.now(), value };
    return value;
  } catch (err) {
    return { ok: false, error: err?.name === "TimeoutError" ? "Timed out reaching Groq." : "Could not reach Groq." };
  }
}
