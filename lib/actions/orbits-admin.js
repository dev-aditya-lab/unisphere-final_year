"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth/session";
import { fail, ok, parseInput } from "@/lib/actions/result";
import { runAiTask } from "@/lib/ai";
import { CATEGORY_LABEL } from "@/lib/orbits/icons";
import { shuffleWithKey } from "@/lib/orbits/question-draft";
import { enforceRateLimit } from "@/lib/rate-limit";
import * as admin from "@/lib/services/admin";
import { discardStoredFile } from "@/lib/storage/uploads";

/**
 * Orbits administration. Thin, validated wrappers: the database functions check the global-administrator permission
 * (orbits.manage / orbits.ledger) on every call and write the audit entry, so a forged request fails there.
 */
const id = z.uuid();
const CATEGORIES = ["programming", "technology", "science", "aptitude", "general", "campus"];

async function run(schema, input, fn, { limit = 60 } = {}) {
  const { user } = await requireProfile();
  const { data, failure } = parseInput(schema, input);
  if (failure) return failure;
  const limited = await enforceRateLimit("orbit-admin", user.id, { limit, windowSec: 600 });
  if (limited) return limited;
  const res = await fn(data);
  if (res.ok) revalidatePath("/admin/orbits", "layout");
  return res;
}

const questionSchema = z.object({
  id: id.nullable().optional(),
  question: z.string().trim().min(10, "Write the question in at least 10 characters.").max(400),
  options: z.array(z.string().trim().min(1, "Every answer needs text.").max(200)).length(4, "Give four answers."),
  correct: z.number().int().min(0).max(3),
  explanation: z.string().trim().min(10, "Add a short explanation (10+ characters).").max(600),
  category: z.enum(CATEGORIES),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date."),
  status: z.enum(["draft", "scheduled", "published", "archived"]),
  source: z.enum(["manual", "ai_draft"]).default("manual"),
});
export const saveQuestionAction = async (input) =>
  run(questionSchema, input, async (d) => {
    const res = await admin.mutate("orbit_admin_save_question", { p_id: d.id ?? null, p_question: d.question, p_options: d.options, p_correct: d.correct, p_explanation: d.explanation, p_category: d.category, p_date: d.date, p_status: d.status, p_source: d.source });
    return res.ok ? ok({ message: "Question saved.", id: res.data }) : res;
  });

/**
 * Drafts a Daily Challenge question with NVIDIA's model for the form to fill in. Nothing is saved: the administrator must verify
 * the answer and the explanation and press Save, and the question is marked as an AI draft. The asking admin's permission is
 * checked by the same database function that lists the questions, whose newest titles are also sent so the model does not repeat them.
 */
export const draftQuestionAction = async (input) =>
  run(
    z.object({
      category: z.enum(CATEGORIES),
      topic: z.string().trim().max(120).optional().default(""),
      difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
    }),
    input,
    async (d) => {
      const recent = await admin.mutate("orbit_admin_questions", { p_status: null, p_limit: 30, p_offset: 0 });
      if (!recent.ok) return recent;
      const res = await runAiTask("draft_daily_question", {
        category: d.category,
        categoryLabel: CATEGORY_LABEL[d.category],
        topic: d.topic,
        difficulty: d.difficulty,
        recent: (recent.data ?? []).map((q) => q.question),
      });
      if (!res.ok) return fail(res.error);
      const q = res.data;
      return ok({ message: "Draft ready. Check the answer and the explanation before you save it.", draft: { question: q.question, explanation: q.explanation, ...shuffleWithKey(q.options, q.correct) } });
    },
    { limit: 20 },
  );

export const setConfigAction = async (input) =>
  run(z.object({ key: z.string().max(40), value: z.union([z.number().int().min(0).max(1000), z.record(z.string(), z.number().int().min(0).max(1000))]) }), input, async (d) => {
    const res = await admin.mutate("orbit_admin_set_config", { p_key: d.key, p_value: d.value });
    return res.ok ? ok({ message: "Reward setting saved." }) : res;
  });

export const updateAchievementAction = async (input) =>
  run(z.object({ id: z.string().max(40), title: z.string().trim().min(2).max(60), description: z.string().trim().min(5).max(200), bonus: z.number().int().min(0).max(1000), active: z.boolean() }), input, async (d) => {
    const res = await admin.mutate("orbit_admin_update_achievement", { p_id: d.id, p_title: d.title, p_description: d.description, p_bonus: d.bonus, p_active: d.active });
    return res.ok ? ok({ message: "Badge saved." }) : res;
  });

/**
 * Sets (or, with key = null, clears) a badge's own picture. The file was uploaded through /api/upload (type, size and permission are
 * checked there, and the database refuses a file that is not a ready orbit_badge upload). The picture it replaces is removed from storage,
 * and a picture that could not be attached is not left behind.
 */
export const setAchievementImageAction = async (input) =>
  run(z.object({ id: z.string().max(40), key: z.string().regex(/^orbit_badge\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg|webp)$/).nullable() }), input, async (d) => {
    const res = await admin.mutate("orbit_admin_set_achievement_image", { p_id: d.id, p_key: d.key });
    if (!res.ok) {
      if (d.key) await discardStoredFile(d.key);
      return res;
    }
    if (res.data.previous && res.data.previous !== d.key) await discardStoredFile(res.data.previous);
    return ok({ message: d.key ? "Badge picture saved." : "Using the built-in artwork again.", imageKey: d.key });
  }, { limit: 30 });

/** `key` is generated by the form once per attempt, so a double click or a retry cannot apply a correction twice. */
export const adjustOrbitsAction = async (input) =>
  run(z.object({ userId: id, amount: z.number().int().min(-1000).max(1000).refine((n) => n !== 0, "Enter an amount."), reason: z.string().trim().min(5, "Explain the correction (5+ characters).").max(500), key: z.string().min(8).max(80) }), input, async (d) => {
    const res = await admin.mutate("orbit_admin_adjust", { p_user: d.userId, p_amount: d.amount, p_reason: d.reason, p_key: d.key });
    if (!res.ok) return res;
    return res.data.applied ? ok({ message: `Applied ${res.data.amount > 0 ? "+" : ""}${res.data.amount} Orbits. New balance ${res.data.balance}.` }) : ok({ message: "That correction was already applied." });
  }, { limit: 30 });

export const reverseOrbitsAction = async (input) =>
  run(z.object({ id, reason: z.string().trim().min(5, "Explain the reversal (5+ characters).").max(500) }), input, async (d) => {
    const res = await admin.mutate("orbit_admin_reverse", { p_entry: d.id, p_reason: d.reason });
    return res.ok ? ok({ message: `Reversed ${res.data.amount} Orbits.` }) : res;
  }, { limit: 30 });

export const saveSeasonAction = async (input) =>
  run(z.object({ id: id.nullable().optional(), name: z.string().trim().min(2).max(60), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }), input, async (d) => {
    const res = await admin.mutate("orbit_admin_save_season", { p_id: d.id ?? null, p_name: d.name, p_from: d.from, p_to: d.to });
    return res.ok ? ok({ message: "Season saved." }) : res;
  });

export const finalizeSeasonAction = async (input) =>
  run(z.object({ id }), input, async (d) => {
    const res = await admin.mutate("orbit_admin_finalize_season", { p_id: d.id });
    return res.ok ? ok({ message: `Season finalised. ${res.data.badges} badge${res.data.badges === 1 ? "" : "s"} awarded.` }) : res;
  }, { limit: 10 });
