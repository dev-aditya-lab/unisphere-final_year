import "server-only";
import { ChatGroq } from "@langchain/groq";
import { AiError, errorFromStatus } from "@/lib/ai/errors";

/** Reasoning models spend part of max_tokens on hidden reasoning, so they need extra headroom. */
const isReasoningModel = (model) => model.startsWith("openai/gpt-oss");
const REASONING_HEADROOM = 1500;

/**
 * Groq through LangChain's ChatGroq. JSON mode is requested with response_format=json_object;
 * the result is validated against a zod schema by the caller, so models do not need to share
 * identical structured-output features.
 */
export function createGroqProvider({ apiKey }) {
  return {
    name: "groq",
    async complete({ model, system, user, maxTokens, temperature, timeoutMs }) {
      const llm = new ChatGroq({
        apiKey,
        model,
        temperature,
        maxTokens: maxTokens + (isReasoningModel(model) ? REASONING_HEADROOM : 0),
        maxRetries: 0, // retries are decided by the task runner, which knows which errors are permanent
        timeout: timeoutMs,
        modelKwargs: {
          response_format: { type: "json_object" },
          ...(isReasoningModel(model) ? { reasoning_effort: "low" } : {}),
        },
      });
      try {
        const res = await llm.invoke([
          ["system", system],
          ["human", user],
        ]);
        const usage = res.usage_metadata ?? {};
        return {
          text: typeof res.content === "string" ? res.content : JSON.stringify(res.content),
          finishReason: res.response_metadata?.finish_reason ?? null,
          inputTokens: usage.input_tokens ?? null,
          outputTokens: usage.output_tokens ?? null,
        };
      } catch (err) {
        if (err instanceof AiError) throw err;
        if (err?.name === "APIConnectionTimeoutError" || err?.name === "AbortError" || /timed? ?out/i.test(String(err?.message))) {
          throw new AiError("timeout", "Groq request timed out", { retryable: true });
        }
        if (typeof err?.status === "number") throw errorFromStatus(err.status, err.message, err.headers);
        throw new AiError("unavailable", `Groq request failed: ${String(err?.message ?? err).slice(0, 200)}`, { retryable: true });
      }
    },
  };
}
