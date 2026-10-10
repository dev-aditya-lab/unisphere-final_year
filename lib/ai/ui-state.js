import "server-only";
import { cache } from "react";
import { aiAvailability } from "@/lib/ai/config";
import { embeddingStatus } from "@/lib/ai/embeddings";

/**
 * What the UI may offer this member right now. The composer and pages use it to show or hide AI
 * controls (never to "pretend" a feature exists): everything shown here really runs.
 */
export const getAiUiState = cache(async (profile) => {
  const [assist, discovery] = await Promise.all([aiAvailability("ai_post_assistant"), aiAvailability("ai_idea_discovery")]);
  const optedOut = profile?.ai_assist_enabled === false;
  return {
    assist: assist.ok && !optedOut,
    discovery: discovery.ok && !optedOut,
    optedOut,
    unavailableReason: !assist.ok ? assist.code : null,
    semantic: embeddingStatus().configured,
  };
});
