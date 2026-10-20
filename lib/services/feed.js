import "server-only";
import { createClient } from "@/lib/supabase/server";
import { normalizeInterests, rankCandidates } from "@/lib/feed/rank";
import { getFeedPage } from "@/lib/services/posts";

// The "For you" feed. Cost per page is fixed and small: one bounded candidate query, one affinity aggregate and one
// follows lookup, all in parallel; ranking is plain code. No model is called. Everything the member may see comes from
// `feed_candidates`, which reads the post_feed view (Row Level Security), so ranking can reorder posts but never
// reveal one.
//
// Paging: the first request ranks a window of the POOL most recent eligible posts as of `asOf`; following requests
// rank the same window (posts newer than `asOf` are excluded, so the window does not move) and return the next slice.
// Once the window is used up the feed continues newest-first ("tail"), so it never ends early and never loads more
// than POOL + PAGE rows at a time.

export const FOR_YOU_PAGE = 15;
export const FOR_YOU_POOL = 90;
const MAX_FOLLOWS = 500;

const isTail = (cursor) => Boolean(cursor && typeof cursor.ts === "string");

async function candidates(supabase, { limit, before = null, category = null }) {
  const { data, error } = await supabase.rpc("feed_candidates", {
    p_limit: limit,
    p_before_ts: before?.ts ?? null,
    p_before_id: before?.id ?? null,
    p_category: category,
  });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** @returns {Promise<{items: object[], nextCursor: object|null, error?: boolean}>} */
export async function getForYouPage({ profile, category = null, cursor = null, now = Date.now() }) {
  const supabase = await createClient();
  try {
    if (isTail(cursor)) {
      const rows = await candidates(supabase, { limit: FOR_YOU_PAGE + 1, before: cursor, category });
      const items = rows.slice(0, FOR_YOU_PAGE);
      const last = items[items.length - 1];
      return { items, nextCursor: rows.length > FOR_YOU_PAGE && last ? { ts: last.created_at, id: last.id } : null };
    }

    const asOf = cursor?.asOf ?? new Date(now).toISOString();
    const offset = cursor?.offset ?? 0;
    // A member who turned personalisation off gets the same ranking with every personal signal left out, and two
    // queries fewer.
    const personal = profile.personalize_feed !== false;
    const none = Promise.resolve(null);
    const [pool, affinity, follows] = await Promise.all([
      candidates(supabase, { limit: FOR_YOU_POOL, before: { ts: asOf, id: null }, category }),
      personal ? supabase.rpc("viewer_affinity", { p_days: 60 }).then((r) => (r.error ? null : r.data)) : none,
      personal ? supabase.from("follows").select("following_id").eq("follower_id", profile.id).limit(MAX_FOLLOWS).then((r) => r.data) : none,
    ]);

    const ranked = rankCandidates(pool, {
      interests: personal ? normalizeInterests(profile.interests) : [],
      following: new Set((follows ?? []).map((f) => f.following_id)),
      affinity: affinity ?? {},
      now,
      viewerId: profile.id,
    });
    const items = ranked.slice(offset, offset + FOR_YOU_PAGE);
    let nextCursor = null;
    if (offset + FOR_YOU_PAGE < ranked.length) nextCursor = { asOf, offset: offset + FOR_YOU_PAGE };
    else if (pool.length >= FOR_YOU_POOL) {
      const oldest = pool[pool.length - 1];
      nextCursor = { ts: oldest.created_at, id: oldest.id };
    }
    return { items, nextCursor };
  } catch (err) {
    // The ranking functions are missing (the app was deployed before migration 30) or the database failed: serve the plain
    // newest-first feed rather than an empty page, so the feed never depends on ranking.
    console.error("[feed] for-you failed, serving the chronological feed:", err.message);
    return getFeedPage({ scope: profile.college_id ? "college" : "public", category, cursor: isTail(cursor) ? cursor : null, limit: FOR_YOU_PAGE });
  }
}

/** Marks a post "not relevant" for the member (private; it only ever affects their own feed). */
export async function dismissPost({ userId, postId }) {
  const supabase = await createClient();
  const { error } = await supabase.from("post_feedback").upsert({ user_id: userId, post_id: postId, kind: "not_relevant" }, { onConflict: "user_id,post_id", ignoreDuplicates: true });
  return { ok: !error, error: error?.message };
}

export async function restorePost({ userId, postId }) {
  const supabase = await createClient();
  const { error } = await supabase.from("post_feedback").delete().eq("user_id", userId).eq("post_id", postId);
  return { ok: !error, error: error?.message };
}
