import "server-only";
import { runAiTask } from "@/lib/ai";
import { getIntegrations } from "@/lib/env";
import { CATEGORY_LABEL } from "@/lib/orbits/icons";
import { categoryForDay, shuffleWithKey } from "@/lib/orbits/question-draft";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Daily Challenge automation, driven by the worker tick (see migration 20260128000036). Times are IST:
 *   - from 02:00 on the challenge day, an AI draft nobody approved is published when nothing else is live;
 *   - from 16:00, tomorrow's question is drafted (never scheduled: it waits for an administrator until 02:00).
 * The database decides when each step is due and throttles retries; these functions only do the work.
 */

/** Publishes today's unapproved AI draft if one is due. */
export async function publishDueDailyQuestion() {
  const { data, error } = await createAdminClient().rpc("orbit_auto_publish_due");
  if (error) throw new Error(error.message);
  return { published: Number(data ?? 0) };
}

/** Drafts the next missing day's question with the AI when the database says it is time. Never throws for an AI failure. */
export async function draftNextDailyQuestion() {
  if (!getIntegrations().nvidia) return { drafted: false, reason: "not_configured" };
  const db = createAdminClient();
  const claim = await db.rpc("orbit_auto_draft_claim");
  if (claim.error) throw new Error(claim.error.message);
  const day = claim.data;
  if (!day) return { drafted: false, reason: "not_due" };

  const noteError = (message) => db.rpc("orbit_auto_draft_note_error", { p_day: day, p_error: message });
  const category = categoryForDay(day);
  const { data: recent } = await db.from("orbit_questions").select("question").order("publish_date", { ascending: false }).limit(30);
  const res = await runAiTask("draft_daily_question", {
    category,
    categoryLabel: CATEGORY_LABEL[category],
    topic: "",
    difficulty: "medium",
    recent: (recent ?? []).map((q) => q.question),
  });
  if (!res.ok) {
    await noteError(`${res.code}: ${res.error}`);
    return { drafted: false, reason: res.code, day };
  }
  const q = res.data;
  const shuffled = shuffleWithKey(q.options, q.correct);
  const saved = await db.rpc("orbit_auto_draft_save", { p_day: day, p_question: q.question, p_options: shuffled.options, p_correct: shuffled.correct, p_explanation: q.explanation, p_category: category });
  if (saved.error) {
    await noteError(`save: ${saved.error.message}`);
    return { drafted: false, reason: "save_failed", day };
  }
  return { drafted: Boolean(saved.data), day, id: saved.data };
}
