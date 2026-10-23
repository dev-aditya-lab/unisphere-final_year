import { prompts } from "@/lib/ai/prompts";
import { schemas } from "@/lib/ai/schemas";
import { findProblems, normalizeAiText } from "@/lib/ai/humanize";

/**
 * Registry of AI tasks. Each task states which admin feature flag gates it, which model tier it
 * needs, how much output it may produce, and whether identical requests can be cached.
 * Tasks never run unless a member (or a moderator tool) explicitly triggers them.
 */
const def = (name, feature, tier, { maxOutputTokens, temperature = 0.2, cacheTtlSec = 0, provider = null, timeoutMs = null, normalize = null, check = null }) => ({
  name,
  feature,
  tier,
  provider,
  timeoutMs,
  maxOutputTokens,
  temperature,
  cacheTtlSec,
  schema: schemas[name],
  build: prompts[name],
  // normalize(data, input) cleans a validated reply; check(data, input) returns { hard, soft } problems (see lib/ai/humanize.js)
  normalize,
  check,
});

// What the author gave the model: the facts the reply may use.
const sourceOf = (input) => `${input.title ?? ""}
${input.body ?? ""}`;
const writing = (field) => ({
  normalize: (data, input) => ({ ...data, [field]: normalizeAiText(data[field], sourceOf(input)) }),
  check: (data, input) => findProblems(data[field], sourceOf(input)),
});

export const TASKS = {
  classify_post: def("classify_post", "ai_post_assistant", "fast", { maxOutputTokens: 200, cacheTtlSec: 3600 }),
  suggest_tags: def("suggest_tags", "ai_post_assistant", "fast", { maxOutputTokens: 200, cacheTtlSec: 3600 }),
  generate_title: def("generate_title", "ai_post_assistant", "fast", { maxOutputTokens: 250, temperature: 0.5, cacheTtlSec: 600 }),
  improve_clarity: def("improve_clarity", "ai_post_assistant", "smart", { maxOutputTokens: 2600, temperature: 0.4, cacheTtlSec: 600, ...writing("improved") }),
  // Fresh every press (no cache): "try another" must give another caption. The caption's tags are cleaned separately.
  write_caption: def("write_caption", "ai_post_assistant", "smart", {
    maxOutputTokens: 700,
    temperature: 0.8,
    timeoutMs: 25000,
    normalize: (data, input) => {
      const caption = normalizeAiText(data.caption, sourceOf(input));
      const tags = input.hashtags ? data.tags.filter((t) => !new RegExp(`#${t}\\b`, "i").test(caption)).slice(0, 3) : [];
      return { caption, tags };
    },
    check: (data, input) => findProblems(data.caption, sourceOf(input)),
  }),
  structure_project: def("structure_project", "ai_post_assistant", "smart", { maxOutputTokens: 1500, temperature: 0.3, cacheTtlSec: 600 }),
  sharpen_question: def("sharpen_question", "ai_post_assistant", "fast", { maxOutputTokens: 700, temperature: 0.3, cacheTtlSec: 600 }),
  summarize_discussion: def("summarize_discussion", "ai_post_assistant", "fast", { maxOutputTokens: 700, cacheTtlSec: 900 }),
  // On demand only. The text is cached by the prompt itself (new messages change the prompt), identical concurrent requests share a call.
  summarize_channel: def("summarize_channel", "ai_post_assistant", "fast", { maxOutputTokens: 700, cacheTtlSec: 600 }),
  draft_community_text: def("draft_community_text", "ai_post_assistant", "smart", { maxOutputTokens: 900, temperature: 0.5 }),
  summarize_post: def("summarize_post", "ai_post_assistant", "fast", { maxOutputTokens: 450, cacheTtlSec: 86400 }),
  extract_requirements: def("extract_requirements", "ai_matching", "fast", { maxOutputTokens: 700, cacheTtlSec: 1800 }),

  extract_concepts: def("extract_concepts", "ai_idea_discovery", "fast", { maxOutputTokens: 350, cacheTtlSec: 1800 }),
  idea_improvements: def("idea_improvements", "ai_idea_discovery", "smart", { maxOutputTokens: 1100, temperature: 0.5 }),
  explain_related: def("explain_related", "ai_idea_discovery", "fast", { maxOutputTokens: 1400 }),
  originality_check: def("originality_check", "ai_idea_discovery", "smart", { maxOutputTokens: 1600, temperature: 0.3 }),

  explain_teammates: def("explain_teammates", "ai_matching", "fast", { maxOutputTokens: 900 }),
  // Admin-only and never cached: every press should produce a fresh question. NVIDIA only, gated by the master `ai_features` flag.
  draft_daily_question: def("draft_daily_question", null, "smart", { maxOutputTokens: 700, temperature: 0.9, provider: "nvidia", timeoutMs: 60000 }),
  moderation_assist: def("moderation_assist", "ai_moderation_assist", "smart", { maxOutputTokens: 400 }),
};
