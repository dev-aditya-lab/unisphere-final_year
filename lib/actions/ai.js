"use server";

import { z } from "zod";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { parseInput } from "@/lib/actions/result";
import { getSetting } from "@/lib/settings";
import { runAiTask } from "@/lib/ai";
import { checkOriginality, discoverRelated, suggestImprovements } from "@/lib/ai/search/discover";
import { POST_CATEGORIES } from "@/lib/content/post-meta";

/**
 * AI entry points. Each one: requires a signed-in member, validates and bounds its input, and
 * returns a plain result object. AI failures come back as { ok:false, code, error } and never throw,
 * so the rest of the page keeps working.
 */

const text = (max, min = 1) => z.string().trim().min(min).max(max);
const categoryValues = POST_CATEGORIES.map((c) => c.value);

const discoverSchema = z.object({ text: text(2500, 1), excludePostId: z.uuid().nullable().optional() });

export async function discoverRelatedAction(input) {
  const { user } = await requireProfile();
  const { data, failure } = parseInput(discoverSchema, input);
  if (failure) return failure;
  return discoverRelated({ user, text: data.text, excludePostId: data.excludePostId ?? null });
}

const improvementsSchema = z.object({
  text: text(2500),
  related: z.array(z.object({ title: text(200) })).max(6).default([]),
});

export async function ideaImprovementsAction(input) {
  const { user } = await requireProfile();
  const { data, failure } = parseInput(improvementsSchema, input);
  if (failure) return failure;
  return suggestImprovements({ user, text: data.text, related: data.related });
}

export async function originalityCheckAction(input) {
  const { user } = await requireProfile();
  const { data, failure } = parseInput(discoverSchema, input);
  if (failure) return failure;
  return checkOriginality({ user, text: data.text, excludePostId: data.excludePostId ?? null });
}

const ASSIST_TASKS = ["improve_clarity", "generate_title", "suggest_tags", "classify_post", "structure_project", "sharpen_question"];
const assistSchema = z.object({
  task: z.enum(ASSIST_TASKS),
  category: z.enum(categoryValues).default("general"),
  title: z.string().trim().max(200).optional().default(""),
  body: text(8000, 10),
});

/** Writing assistant. The result is a suggestion: the member reviews and applies it themselves. */
export async function assistAction(input) {
  const { user } = await requireProfile();
  const { data, failure } = parseInput(assistSchema, input);
  if (failure) return failure;
  return runAiTask(data.task, { title: data.title, body: data.body, category: data.category }, { userId: user.id });
}

const summarizeSchema = z.object({ postId: z.uuid() });

/** Summarise a discussion the member can already see. Restricted-visibility posts are never sent to the provider. */
export async function summarizeDiscussionAction(input) {
  const { user } = await requireProfile();
  const { data, failure } = parseInput(summarizeSchema, input);
  if (failure) return failure;

  const supabase = await createClient();
  const { data: post } = await supabase.from("post_feed").select("id, title, body, visibility, comment_count").eq("id", data.postId).maybeSingle();
  if (!post) return { ok: false, code: "not_found", error: "That post is not available." };
  const shareCollege = (await getSetting("ai_share_college_content")) !== false;
  if (post.visibility === "public" || (post.visibility === "college" && shareCollege) || post.visibility === "private") {
    // Even the author's own private notes are only sent because the author explicitly asked.
    if (post.visibility === "private") {
      const { data: mine } = await supabase.from("posts").select("author_id").eq("id", post.id).maybeSingle();
      if (mine?.author_id !== user.id) return { ok: false, code: "blocked_input", error: "That discussion cannot be summarised." };
    }
  } else {
    return { ok: false, code: "blocked_input", error: "Discussions with restricted visibility cannot be summarised by AI." };
  }
  if ((post.comment_count ?? 0) < 3) return { ok: false, code: "too_short", error: "A discussion needs at least 3 comments to summarise." };

  const { data: comments } = await supabase.from("comment_feed").select("body").eq("post_id", post.id).eq("status", "published").order("created_at", { ascending: true }).limit(60);
  return runAiTask("summarize_discussion", { title: post.title ?? "", body: post.body, comments: (comments ?? []).map((c) => c.body.slice(0, 400)) }, { userId: user.id });
}
