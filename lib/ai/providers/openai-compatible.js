import "server-only";
import { AiError, errorFromStatus } from "@/lib/ai/errors";

/**
 * Generic OpenAI-style /chat/completions provider (OpenRouter, Together, Ollama, vLLM, OpenAI…).
 * Used only as an optional fallback; it is configured with its own base URL, key and model, and
 * never assumed to support anything beyond plain chat + JSON output.
 */
export function createOpenAiCompatibleProvider({ baseUrl, apiKey }) {
  return {
    name: "openai-compatible",
    async complete({ model, system, user, maxTokens, temperature, timeoutMs }) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model,
            temperature,
            max_tokens: maxTokens,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
          }),
          signal: controller.signal,
        });
        if (!res.ok) throw errorFromStatus(res.status, `Fallback provider returned ${res.status}`, res.headers);
        const json = await res.json();
        const choice = json.choices?.[0];
        if (!choice?.message?.content) throw new AiError("unavailable", "Fallback provider returned no content", { retryable: true });
        return {
          text: choice.message.content,
          finishReason: choice.finish_reason ?? null,
          inputTokens: json.usage?.prompt_tokens ?? null,
          outputTokens: json.usage?.completion_tokens ?? null,
        };
      } catch (err) {
        if (err instanceof AiError) throw err;
        if (err?.name === "AbortError") throw new AiError("timeout", "Fallback provider timed out", { retryable: true });
        throw new AiError("unavailable", `Fallback provider failed: ${String(err?.message ?? err).slice(0, 200)}`, { retryable: true });
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
