import { prompts } from "@/lib/ai/prompts";
import { schemas } from "@/lib/ai/schemas";

/**
 * Registry of AI tasks. Each task states which admin feature flag gates it, which model tier it
 * needs, how much output it may produce, and whether identical requests can be cached.
 * Tasks never run unless a member (or a moderator tool) explicitly triggers them.
 */
const def = (name, feature, tier, { maxOutputTokens, temperature = 0.2, cacheTtlSec = 0 }) => ({
  name,
  feature,
  tier,
  maxOutputTokens,
  temperature,
  cacheTtlSec,
  schema: schemas[name],
  build: prompts[name],
});

export const TASKS = {
  classify_post: def("classify_post", "ai_post_assistant", "fast", { maxOutputTokens: 200, cacheTtlSec: 3600 }),
  suggest_tags: def("suggest_tags", "ai_post_assistant", "fast", { maxOutputTokens: 200, cacheTtlSec: 3600 }),
  generate_title: def("generate_title", "ai_post_assistant", "fast", { maxOutputTokens: 250, temperature: 0.5, cacheTtlSec: 600 }),
  improve_clarity: def("improve_clarity", "ai_post_assistant", "smart", { maxOutputTokens: 2600, temperature: 0.3, cacheTtlSec: 600 }),
  structure_project: def("structure_project", "ai_post_assistant", "smart", { maxOutputTokens: 1500, temperature: 0.3, cacheTtlSec: 600 }),
  sharpen_question: def("sharpen_question", "ai_post_assistant", "fast", { maxOutputTokens: 700, temperature: 0.3, cacheTtlSec: 600 }),
  summarize_discussion: def("summarize_discussion", "ai_post_assistant", "fast", { maxOutputTokens: 700, cacheTtlSec: 900 }),
  summarize_post: def("summarize_post", "ai_post_assistant", "fast", { maxOutputTokens: 450, cacheTtlSec: 86400 }),
  extract_requirements: def("extract_requirements", "ai_matching", "fast", { maxOutputTokens: 700, cacheTtlSec: 1800 }),

  extract_concepts: def("extract_concepts", "ai_idea_discovery", "fast", { maxOutputTokens: 350, cacheTtlSec: 1800 }),
  idea_improvements: def("idea_improvements", "ai_idea_discovery", "smart", { maxOutputTokens: 1100, temperature: 0.5 }),
  explain_related: def("explain_related", "ai_idea_discovery", "fast", { maxOutputTokens: 1400 }),
  originality_check: def("originality_check", "ai_idea_discovery", "smart", { maxOutputTokens: 1600, temperature: 0.3 }),

  explain_teammates: def("explain_teammates", "ai_matching", "fast", { maxOutputTokens: 900 }),
  moderation_assist: def("moderation_assist", "ai_moderation_assist", "smart", { maxOutputTokens: 400 }),
};
