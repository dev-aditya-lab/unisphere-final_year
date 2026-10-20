import "server-only";
import { AiError, errorFromStatus } from "@/lib/ai/errors";

/** gpt-oss models reason before answering. "low" cuts a draft from about a minute to about ten seconds; the headroom covers what is left. */
const isReasoningModel = (model) => model.startsWith("openai/gpt-oss");
const REASONING_HEADROOM = 1000;

/**
 * NVIDIA's hosted API (build.nvidia.com), which speaks the OpenAI chat-completions protocol. Only `content` is read:
 * the model's `reasoning_content` is never stored or shown. JSON is requested in the prompt and validated by the caller
 * against a zod schema, so no model-specific response_format is needed.
 */
export function createNvidiaProvider({ baseUrl, apiKey }) {
  return {
    name: "nvidia",
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
            top_p: 1,
            max_tokens: maxTokens + (isReasoningModel(model) ? REASONING_HEADROOM : 0),
            ...(isReasoningModel(model) ? { reasoning_effort: "low" } : {}),
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
          }),
          signal: controller.signal,
          cache: "no-store",
        });
        if (!res.ok) throw errorFromStatus(res.status, `NVIDIA returned ${res.status}`, res.headers);
        const json = await res.json();
        const choice = json.choices?.[0];
        const text = choice?.message?.content;
        // Cut off while still reasoning: there is no answer yet, and the runner retries with more room.
        if (!text && choice?.finish_reason === "length") return { text: "", finishReason: "length", inputTokens: json.usage?.prompt_tokens ?? null, outputTokens: json.usage?.completion_tokens ?? null };
        if (!text) throw new AiError("unavailable", "NVIDIA returned no content", { retryable: true });
        return {
          text,
          finishReason: choice.finish_reason ?? null,
          inputTokens: json.usage?.prompt_tokens ?? null,
          outputTokens: json.usage?.completion_tokens ?? null,
        };
      } catch (err) {
        if (err instanceof AiError) throw err;
        if (err?.name === "AbortError") throw new AiError("timeout", "NVIDIA request timed out", { retryable: true });
        throw new AiError("unavailable", `NVIDIA request failed: ${String(err?.message ?? err).slice(0, 200)}`, { retryable: true });
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
