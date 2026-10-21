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
  // AI runs only after the member said yes (purpose ai_assist). If the consent tables cannot be read, fall back to the
  // stored switch, which the consent function keeps in step; either way the server re-checks before anything is sent.
  const allowed = profile?.consents ? profile.consents.ai_assist?.status === "granted" : profile?.ai_assist_enabled === true;
  const available = assist.ok || discovery.ok;
  return {
    assist: assist.ok && allowed,
    discovery: discovery.ok && allowed,
    optedOut: !allowed,
    needsConsent: available && !allowed,
    unavailableReason: !assist.ok ? assist.code : null,
    semantic: embeddingStatus().configured,
  };
});
