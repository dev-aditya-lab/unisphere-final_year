"use server";

import { z } from "zod";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fail, parseInput } from "@/lib/actions/result";
import { enforceRateLimit } from "@/lib/rate-limit";
import { dismissPost, restorePost } from "@/lib/services/feed";
import { withBlueTicks } from "@/lib/services/blue-tick-lookup";
import { getTrendingHashtags } from "@/lib/services/posts";
import { searchPeople } from "@/lib/services/social";
import { tagList } from "@/lib/validators/profile";

/**
 * Discovery entry points: composer suggestions, "not relevant" feedback and the member's interests.
 * All of them need a signed-in member, validate and bound their input, run under the member's own database
 * session (Row Level Security), and answer with plain data. None of them calls an AI model.
 */

const query = z.object({ query: z.string().max(40).default("") });

/** People for "@" in the composer and in comments. Followed people first; an empty query lists only them. */
export async function suggestMentionsAction(input) {
  const { user } = await requireProfile();
  const { data, failure } = parseInput(query, input);
  if (failure) return failure;
  const q = data.query.replace(/^@/, "").trim().toLowerCase();
  if (!/^[a-z0-9_-]*$/.test(q)) return { ok: true, people: [] }; // not a username: nothing to suggest, nothing to search
  const limited = await enforceRateLimit("mention-suggest", user.id, { limit: 120, windowSec: 60 });
  if (limited) return limited;

  const supabase = await createClient();
  const { data: rows, error } = await supabase.rpc("mention_suggestions", { p_query: q, p_limit: 6 });
  let people = rows;
  if (error) {
    // The database function is not there yet (deployed before the migration): fall back to the older people search.
    if (q.length < 2) return { ok: true, people: [] };
    people = await searchPeople({ query: q, limit: 6 });
  } else {
    people = await withBlueTicks(rows ?? []);
  }
  return {
    ok: true,
    people: (people ?? []).slice(0, 6).map((p) => ({
      id: p.id,
      username: p.username,
      full_name: p.full_name,
      avatar_key: p.avatar_key,
      headline: p.headline ?? null,
      verified: Boolean(p.verified),
      blue_tick: Boolean(p.blue_tick),
      followed: Boolean(p.followed),
    })),
  };
}

/**
 * Tags for "#": prefix matches among tags used by public posts (so a private post cannot leak a tag), most used first.
 * An empty prefix lists what is trending. Never returns more than a handful of rows.
 */
export async function suggestHashtagsAction(input) {
  const { user } = await requireProfile();
  const { data, failure } = parseInput(query, input);
  if (failure) return failure;
  const prefix = data.query.replace(/^#/, "").trim().toLowerCase();
  if (!/^[a-z0-9_]*$/.test(prefix)) return { ok: true, tags: [] };
  const limited = await enforceRateLimit("hashtag-suggest", user.id, { limit: 120, windowSec: 60 });
  if (limited) return limited;

  const supabase = await createClient();
  const { data: rows, error } = await supabase.rpc("suggest_hashtags", { p_prefix: prefix, p_limit: 6 });
  if (!error) return { ok: true, tags: (rows ?? []).map((r) => ({ tag: r.tag, uses: Number(r.uses) })) };
  // Fallback before the migration is applied: filter the trending list.
  const trending = await getTrendingHashtags(20);
  return { ok: true, tags: trending.filter((t) => t.tag.startsWith(prefix)).slice(0, 6).map((t) => ({ tag: t.tag, uses: Number(t.uses) })) };
}

const postRef = z.object({ postId: z.uuid() });

/** "Show less like this": hides the post from the member's feed and lowers its category and author for them only. */
export async function dismissPostAction(input) {
  const { user } = await requireProfile();
  const { data, failure } = parseInput(postRef, input);
  if (failure) return failure;
  const limited = await enforceRateLimit("feed-feedback", user.id, { limit: 60, windowSec: 60 });
  if (limited) return limited;
  const res = await dismissPost({ userId: user.id, postId: data.postId });
  return res.ok ? { ok: true } : fail("Could not save that. Please try again.");
}

export async function restorePostAction(input) {
  const { user } = await requireProfile();
  const { data, failure } = parseInput(postRef, input);
  if (failure) return failure;
  const res = await restorePost({ userId: user.id, postId: data.postId });
  return res.ok ? { ok: true } : fail("Could not undo that. Please try again.");
}

/** The member's interests: optional, edited at any time, used only to rank their own feed. */
export async function setInterestsAction(input) {
  const { user } = await requireProfile();
  const { data, failure } = parseInput(z.object({ interests: tagList(30, 40) }), input);
  if (failure) return failure;
  const limited = await enforceRateLimit("interests", user.id, { limit: 30, windowSec: 60 });
  if (limited) return limited;
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ interests: data.interests }).eq("id", user.id);
  return error ? fail("Could not save your interests. Please try again.") : { ok: true, interests: data.interests };
}
