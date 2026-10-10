/**
 * Provider-agnostic error type. `retryable` says whether another attempt can help
 * (rate limit, timeout, 5xx); permanent errors (auth, unknown model, bad request) are never retried.
 */
export class AiError extends Error {
  constructor(kind, message, { retryable = false, retryAfterMs = null, status = null } = {}) {
    super(message);
    this.name = "AiError";
    this.kind = kind; // rate_limited | timeout | unavailable | model_unavailable | auth | bad_request | unknown
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
    this.status = status;
  }
}

/** Maps an HTTP status (and optional headers) to an AiError. */
export function errorFromStatus(status, message, headers) {
  const retryAfter = Number(headers?.get?.("retry-after") ?? headers?.["retry-after"]);
  const retryAfterMs = Number.isFinite(retryAfter) ? Math.round(retryAfter * 1000) : null;
  if (status === 429) return new AiError("rate_limited", message, { retryable: true, retryAfterMs, status });
  if (status === 408 || status === 504) return new AiError("timeout", message, { retryable: true, status });
  if (status >= 500) return new AiError("unavailable", message, { retryable: true, status });
  if (status === 401 || status === 403) return new AiError("auth", message, { status });
  if (status === 404) return new AiError("model_unavailable", message, { status });
  if (status === 400 || status === 422) return new AiError("bad_request", message, { status });
  return new AiError("unknown", message, { status });
}

/** User-facing wording for every failure kind (never leaks provider details). */
export const AI_USER_MESSAGES = {
  ai_disabled: "AI features are turned off right now.",
  not_configured: "AI features are not configured on this server yet.",
  rate_limited: "You are using AI assist very quickly. Please wait a moment and try again.",
  daily_limit: "You have reached today's AI assist limit. It resets tomorrow.",
  provider_rate_limited: "The AI service is busy. Please try again in a minute.",
  provider_unavailable: "The AI service is temporarily unavailable. Everything else on UniSphere still works.",
  timeout: "The AI service took too long to respond. Please try again.",
  invalid_output: "The AI returned something we could not use. Please try again.",
  model_unavailable: "The configured AI model is not available. An administrator needs to update it.",
  blocked_input: "That text could not be processed.",
  opted_out: "You have turned off AI assist in your privacy settings.",
};
