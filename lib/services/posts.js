import "server-only";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/rate-limit";
import { dbError, fail, ok } from "@/lib/actions/result";
import { uniqueSlug } from "@/lib/slug";
import { excerpt, extractHashtags, extractMentions } from "@/lib/text";

const PAGE_SIZE = 15;

// ── Reading ─────────────────────────────────────────────────────────────────

export async function getFeedPage({ scope = "college", category = null, cursor = null, limit = PAGE_SIZE }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("feed_posts", {
    p_scope: scope,
    p_category: category,
    p_before_ts: cursor?.ts ?? null,
    p_before_id: cursor?.id ?? null,
    p_limit: limit + 1,
  });
  if (error) {
    console.error("[posts] feed failed:", error.message);
    return { items: [], nextCursor: null, error: true };
  }
  const rows = data ?? [];
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: rows.length > limit && last ? { ts: last.created_at, id: last.id } : null,
  };
}

/** How many posts the member has published (a repost counts). Zero is what shows the "write your first post" prompt. */
export async function getMyPostCount(userId) {
  const supabase = await createClient();
  const { count, error } = await supabase.from("posts").select("id", { count: "exact", head: true }).eq("author_id", userId).eq("status", "published");
  // If the count cannot be read, say the member has posted: a missing prompt is better than a wrong one.
  return error ? 1 : (count ?? 0);
}

export async function getPostBySlug(slug) {
  const supabase = await createClient();
  const { data } = await supabase.from("post_feed").select("*").eq("slug", slug).maybeSingle();
  return data ?? null;
}

export async function getPostsByAuthor(authorId, { limit = 15, cursor = null } = {}) {
  const supabase = await createClient();
  let q = supabase
    .from("post_feed")
    .select("*")
    .eq("author_id", authorId)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  if (cursor) q = q.or(`created_at.lt.${cursor.ts},and(created_at.eq.${cursor.ts},id.lt.${cursor.id})`);
  const { data } = await q;
  const rows = data ?? [];
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  return { items, nextCursor: rows.length > limit && last ? { ts: last.created_at, id: last.id } : null };
}

export async function getBookmarkedPosts({ limit = 50 } = {}) {
  const supabase = await createClient();
  const { data: marks } = await supabase.from("bookmarks").select("post_id, created_at").order("created_at", { ascending: false }).limit(limit);
  if (!marks?.length) return [];
  const { data: posts } = await supabase.from("post_feed").select("*").in("id", marks.map((m) => m.post_id));
  const byId = new Map((posts ?? []).map((p) => [p.id, p]));
  return marks.map((m) => byId.get(m.post_id)).filter(Boolean);
}

export async function getPostsByHashtag(tag, limit = 30) {
  const supabase = await createClient();
  // One bounded, newest-first query that applies the viewer's visibility (RLS). Falls back to the older two-step
  // lookup only while the database function from migration 30 is missing.
  const viaFunction = await supabase.rpc("posts_by_hashtag", { p_tag: tag, p_limit: limit });
  if (!viaFunction.error) return viaFunction.data ?? [];
  const { data: h } = await supabase.from("hashtags").select("id").eq("tag", tag).maybeSingle();
  if (!h) return [];
  // post_hashtags rows are only visible for posts the viewer may see (RLS), then re-checked by the view.
  const { data: links } = await supabase.from("post_hashtags").select("post_id").eq("hashtag_id", h.id).limit(200);
  const ids = (links ?? []).map((l) => l.post_id);
  if (!ids.length) return [];
  const { data } = await supabase
    .from("post_feed")
    .select("*")
    .in("id", ids)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function getComments(postId) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("comment_feed")
    .select("*")
    .eq("post_id", postId)
    .order("created_at", { ascending: true })
    .limit(300);
  return data ?? [];
}

export async function getTrendingHashtags(limit = 8) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("trending_hashtags", { p_days: 14, p_limit: limit });
  return data ?? [];
}

// ── Writing ─────────────────────────────────────────────────────────────────

/** Replace the hashtag links and mention rows for an entity from its saved text. Trusted server code. */
async function syncTagsAndMentions({ entityType, entityId, text, authorId }) {
  const admin = createAdminClient();

  if (entityType === "post") {
    const tags = extractHashtags(text);
    await admin.from("post_hashtags").delete().eq("post_id", entityId);
    if (tags.length) {
      await admin.from("hashtags").upsert(tags.map((tag) => ({ tag })), { onConflict: "tag", ignoreDuplicates: true });
      const { data: rows } = await admin.from("hashtags").select("id").in("tag", tags);
      if (rows?.length) await admin.from("post_hashtags").insert(rows.map((r) => ({ post_id: entityId, hashtag_id: r.id })));
    }
  }

  // Mentions are validated here, never trusted from the client: only the usernames that really appear in the saved text,
  // only active accounts, never the author, at most 10. Blocks and notification preferences are enforced by notify().
  // On an edit only the difference is written, so people who were already mentioned are not notified a second time.
  const usernames = extractMentions(text);
  const wanted = new Set();
  if (usernames.length) {
    const { data: people } = await admin.from("profiles").select("id").in("username", usernames).eq("status", "active");
    for (const p of people ?? []) if (p.id !== authorId) wanted.add(p.id);
  }
  const { data: existing } = await admin.from("mentions").select("mentioned_user_id").eq("entity_type", entityType).eq("entity_id", entityId);
  const had = new Set((existing ?? []).map((m) => m.mentioned_user_id));
  const removed = [...had].filter((id) => !wanted.has(id));
  const added = [...wanted].filter((id) => !had.has(id));
  if (removed.length) await admin.from("mentions").delete().eq("entity_type", entityType).eq("entity_id", entityId).in("mentioned_user_id", removed);
  if (added.length) {
    await admin.from("mentions").insert(added.map((id) => ({ entity_type: entityType, entity_id: entityId, mentioned_user_id: id })));
  }
}

/**
 * True when the database does not have the idempotency column yet (the app was deployed before migration 26 ran).
 * The write is then retried without the key, so deploy order can never block posting; duplicates are simply not
 * prevented until the migration is applied.
 */
function keyColumnMissing(error) {
  return Boolean(error) && /client_op_id/.test(`${error.message ?? ""} ${error.details ?? ""}`) && !/client_op_idx|duplicate key/.test(String(error.message));
}

/** True when a unique violation came from the idempotency index (a retry of a write that already succeeded). */
function isReplay(error, indexName) {
  return error?.code === "23505" && String(error.message).includes(indexName);
}

async function insertWithSlug(supabase, row, slugSource) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = uniqueSlug(slugSource, { fallback: "post" });
    let { data, error } = await supabase.from("posts").insert({ ...row, slug }).select("id, slug, category").single();
    if (keyColumnMissing(error)) {
      const { client_op_id: _unused, ...rest } = row;
      ({ data, error } = await supabase.from("posts").insert({ ...rest, slug }).select("id, slug, category").single());
    }
    if (!error) return { data };
    if (isReplay(error, "posts_client_op_idx")) {
      // The same submission arrived again (a retry after a lost response): hand back the post it already created.
      const { data: existing } = await supabase
        .from("posts")
        .select("id, slug, category")
        .eq("author_id", row.author_id)
        .eq("client_op_id", row.client_op_id)
        .maybeSingle();
      if (existing) return { data: existing, replayed: true };
    }
    if (error.code !== "23505" || !String(error.message).includes("slug")) return { error };
  }
  return { error: { message: "slug_collision" } };
}

export async function createPost({ user, input }) {
  const limited = await enforceRateLimit("post-create", user.id, { limit: 20, windowSec: 600 });
  if (limited) return limited;

  const supabase = await createClient();
  const { data: post, error, replayed } = await insertWithSlug(
    supabase,
    {
      author_id: user.id,
      category: input.category,
      title: input.title ?? null,
      body: input.body,
      visibility: input.visibility,
      community_id: input.communityId ?? null,
      client_op_id: input.clientOpId ?? null,
    },
    input.title || excerpt(input.body, 60),
  );
  if (error) return dbError(error, "We could not publish your post. Please try again.");
  // A retry of a post that was already published: everything below was done the first time.
  if (replayed) return ok({ id: post.id, slug: post.slug, category: post.category, replayed: true });

  if (input.attachmentIds.length) {
    const { error: attachError } = await supabase.from("post_attachments").insert(
      input.attachmentIds.map((file_id, position) => ({ post_id: post.id, file_id, position })),
    );
    if (attachError) {
      await supabase.from("posts").update({ status: "deleted" }).eq("id", post.id);
      return fail("One of the images could not be attached. Please upload it again.", { code: "attachment_failed" });
    }
  }

  // Hashtag and mention rows are derived data (trending tags, mention notifications). They take several sequential
  // queries, none of which the author is waiting on, so they run after the response instead of before it.
  after(() => syncTagsAndMentions({ entityType: "post", entityId: post.id, text: `${input.title ?? ""}\n${input.body}`, authorId: user.id }));
  return ok({ id: post.id, slug: post.slug, category: post.category });
}

export async function updatePost({ user, input }) {
  const limited = await enforceRateLimit("post-update", user.id, { limit: 30, windowSec: 600 });
  if (limited) return limited;

  const supabase = await createClient();
  let q = supabase
    .from("posts")
    .update({ category: input.category, title: input.title ?? null, body: input.body, visibility: input.visibility })
    .eq("id", input.postId)
    .eq("author_id", user.id);
  // Optimistic concurrency: when the editor says what it started from, only save if the post still has those
  // values, so an edit made elsewhere (another tab, another device) is never silently overwritten.
  if (input.base) {
    q = q.eq("category", input.base.category).eq("body", input.base.body).eq("visibility", input.base.visibility);
    q = input.base.title === null ? q.is("title", null) : q.eq("title", input.base.title);
  }
  const { data, error } = await q.select("id, slug, category").maybeSingle();
  if (error) return dbError(error);
  if (!data) {
    if (input.base) {
      const { data: current } = await supabase
        .from("posts")
        .select("category, title, body, visibility, status")
        .eq("id", input.postId)
        .eq("author_id", user.id)
        .maybeSingle();
      if (current && current.status === "published") {
        return fail("This post was changed somewhere else while you were editing it.", {
          code: "conflict",
          current: { category: current.category, title: current.title, body: current.body, visibility: current.visibility },
        });
      }
    }
    return fail("That post is not available to edit.", { code: "not_found" });
  }

  after(() => syncTagsAndMentions({ entityType: "post", entityId: data.id, text: `${input.title ?? ""}\n${input.body}`, authorId: user.id }));
  return ok({ slug: data.slug, category: data.category });
}

export async function deletePost({ user, postId }) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("posts")
    .update({ status: "deleted" })
    .eq("id", postId)
    .eq("author_id", user.id)
    .select("id")
    .maybeSingle();
  if (error) return dbError(error);
  if (!data) return fail("That post is not available.", { code: "not_found" });
  const admin = createAdminClient();
  await admin.from("post_hashtags").delete().eq("post_id", postId);
  await admin.from("mentions").delete().eq("entity_type", "post").eq("entity_id", postId);
  return ok();
}

export async function repost({ user, postId, comment }) {
  const limited = await enforceRateLimit("post-create", user.id, { limit: 20, windowSec: 600 });
  if (limited) return limited;
  const supabase = await createClient();
  const { data: original } = await supabase.from("post_feed").select("slug, title, body, visibility").eq("id", postId).maybeSingle();
  if (!original) return fail("That post is not available.", { code: "not_found" });

  const { data, error } = await insertWithSlug(
    supabase,
    { author_id: user.id, repost_of_id: postId, body: comment ?? "", visibility: original.visibility === "public" ? "public" : "college" },
    original.title || excerpt(original.body, 50),
  );
  if (error) {
    if (error.code === "23505") return fail("You have already reposted this.", { code: "duplicate" });
    if (String(error.message).includes("repost_not_allowed")) return fail("This post cannot be reposted.", { code: "not_allowed" });
    return dbError(error, "We could not repost. Please try again.");
  }
  if (comment) await syncTagsAndMentions({ entityType: "post", entityId: data.id, text: comment, authorId: user.id });
  return ok({ slug: data.slug });
}

// ── Reactions & bookmarks ───────────────────────────────────────────────────

export async function setReaction({ user, postId, reaction }) {
  const limited = await enforceRateLimit("react", user.id, { limit: 120, windowSec: 60 });
  if (limited) return limited;
  const supabase = await createClient();

  if (reaction === null) {
    const { error } = await supabase.from("post_reactions").delete().eq("post_id", postId).eq("user_id", user.id);
    if (error) return dbError(error);
  } else {
    // One row per (post, user) is enforced by the primary key. We update first (users may only change
    // the `reaction` column), and insert when there is nothing to update.
    const { data: updated, error: updError } = await supabase
      .from("post_reactions")
      .update({ reaction })
      .eq("post_id", postId)
      .eq("user_id", user.id)
      .select("post_id");
    if (updError) return dbError(updError, "Could not save your reaction.");
    if (!updated?.length) {
      const { error: insError } = await supabase.from("post_reactions").insert({ post_id: postId, user_id: user.id, reaction });
      if (insError && insError.code === "23505") {
        // Lost a race with a concurrent request: the row exists now, so update it.
        await supabase.from("post_reactions").update({ reaction }).eq("post_id", postId).eq("user_id", user.id);
      } else if (insError) {
        return dbError(insError, "Could not save your reaction.");
      }
    }
  }
  const { data } = await supabase.from("post_feed").select("reaction_count, reactions, my_reaction").eq("id", postId).maybeSingle();
  return ok({ reactionCount: data?.reaction_count ?? 0, reactions: data?.reactions ?? {}, myReaction: data?.my_reaction ?? null });
}

export async function setBookmark({ user, postId, bookmarked }) {
  const limited = await enforceRateLimit("react", user.id, { limit: 120, windowSec: 60 });
  if (limited) return limited;
  const supabase = await createClient();
  if (bookmarked) {
    const { error } = await supabase.from("bookmarks").upsert({ user_id: user.id, post_id: postId }, { onConflict: "user_id,post_id", ignoreDuplicates: true });
    if (error) return dbError(error, "Could not save the bookmark.");
  } else {
    const { error } = await supabase.from("bookmarks").delete().eq("user_id", user.id).eq("post_id", postId);
    if (error) return dbError(error);
  }
  return ok({ bookmarked });
}

// ── Comments ────────────────────────────────────────────────────────────────

export async function addComment({ user, input }) {
  const limited = await enforceRateLimit("comment", user.id, { limit: 20, windowSec: 120 });
  if (limited) return limited;
  const supabase = await createClient();
  let { data, error } = await supabase
    .from("comments")
    .insert({ post_id: input.postId, author_id: user.id, parent_id: input.parentId ?? null, body: input.body, client_op_id: input.clientOpId ?? null })
    .select("id")
    .single();
  let replayed = false;
  if (keyColumnMissing(error)) {
    ({ data, error } = await supabase
      .from("comments")
      .insert({ post_id: input.postId, author_id: user.id, parent_id: input.parentId ?? null, body: input.body })
      .select("id")
      .single());
  }
  if (isReplay(error, "comments_client_op_idx")) {
    // A retry of a comment that was already saved: return that comment instead of adding a second one.
    ({ data } = await supabase.from("comments").select("id").eq("author_id", user.id).eq("client_op_id", input.clientOpId).maybeSingle());
    if (data) {
      error = null;
      replayed = true;
    }
  }
  if (error) {
    if (String(error.message).includes("reply_depth_exceeded")) return fail("Replies can only go one level deep.", { code: "depth" });
    return dbError(error, "Could not post your comment.");
  }
  if (!replayed) after(() => syncTagsAndMentions({ entityType: "comment", entityId: data.id, text: input.body, authorId: user.id }));
  const { data: row } = await supabase.from("comment_feed").select("*").eq("id", data.id).maybeSingle();
  return ok({ comment: row });
}

export async function editComment({ user, commentId, body }) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("comments")
    .update({ body })
    .eq("id", commentId)
    .eq("author_id", user.id)
    .select("id")
    .maybeSingle();
  if (error) return dbError(error);
  if (!data) return fail("That comment is not available.", { code: "not_found" });
  await syncTagsAndMentions({ entityType: "comment", entityId: commentId, text: body, authorId: user.id });
  return ok();
}

export async function deleteComment({ user, commentId }) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("comments")
    .update({ status: "deleted" })
    .eq("id", commentId)
    .eq("author_id", user.id)
    .select("id")
    .maybeSingle();
  if (error) return dbError(error);
  if (!data) return fail("That comment is not available.", { code: "not_found" });
  return ok();
}

export async function setCommentLike({ user, commentId, liked }) {
  const limited = await enforceRateLimit("react", user.id, { limit: 120, windowSec: 60 });
  if (limited) return limited;
  const supabase = await createClient();
  if (liked) {
    const { error } = await supabase
      .from("comment_reactions")
      .upsert({ comment_id: commentId, user_id: user.id }, { onConflict: "comment_id,user_id", ignoreDuplicates: true });
    if (error) return dbError(error);
  } else {
    const { error } = await supabase.from("comment_reactions").delete().eq("comment_id", commentId).eq("user_id", user.id);
    if (error) return dbError(error);
  }
  const { data } = await supabase.from("comment_feed").select("like_count").eq("id", commentId).maybeSingle();
  return ok({ likeCount: data?.like_count ?? 0 });
}

// ── Reporting ───────────────────────────────────────────────────────────────

export async function submitReport({ user, input }) {
  const limited = await enforceRateLimit("report", user.id, { limit: 10, windowSec: 3600 });
  if (limited) return limited;
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_report", {
    p_target_type: input.targetType,
    p_target_id: input.targetId,
    p_category: input.category,
    p_details: input.details ?? null,
  });
  if (error) {
    const m = String(error.message);
    if (m.includes("already_reported")) return fail("You have already reported this. Thank you, a moderator will review it.", { code: "duplicate" });
    if (m.includes("cannot_report_self")) return fail("You cannot report your own content.", { code: "invalid" });
    if (m.includes("target_unavailable")) return fail("That content is no longer available.", { code: "not_found" });
    return dbError(error, "Could not submit your report.");
  }
  return ok({ message: "Thanks for letting us know. A moderator will review this." });
}
