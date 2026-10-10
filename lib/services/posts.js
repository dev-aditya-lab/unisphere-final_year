import "server-only";
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

  const usernames = extractMentions(text);
  await admin.from("mentions").delete().eq("entity_type", entityType).eq("entity_id", entityId);
  if (usernames.length) {
    const { data: people } = await admin.from("profiles").select("id").in("username", usernames).eq("status", "active");
    const ids = (people ?? []).map((p) => p.id).filter((id) => id !== authorId);
    if (ids.length) {
      await admin.from("mentions").insert(ids.map((id) => ({ entity_type: entityType, entity_id: entityId, mentioned_user_id: id })));
    }
  }
}

async function insertWithSlug(supabase, row, slugSource) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = uniqueSlug(slugSource, { fallback: "post" });
    const { data, error } = await supabase.from("posts").insert({ ...row, slug }).select("id, slug, category").single();
    if (!error) return { data };
    if (error.code !== "23505" || !String(error.message).includes("slug")) return { error };
  }
  return { error: { message: "slug_collision" } };
}

export async function createPost({ user, input }) {
  const limited = await enforceRateLimit("post-create", user.id, { limit: 20, windowSec: 600 });
  if (limited) return limited;

  const supabase = await createClient();
  const { data: post, error } = await insertWithSlug(
    supabase,
    {
      author_id: user.id,
      category: input.category,
      title: input.title ?? null,
      body: input.body,
      visibility: input.visibility,
      community_id: input.communityId ?? null,
    },
    input.title || excerpt(input.body, 60),
  );
  if (error) return dbError(error, "We could not publish your post. Please try again.");

  if (input.attachmentIds.length) {
    const { error: attachError } = await supabase.from("post_attachments").insert(
      input.attachmentIds.map((file_id, position) => ({ post_id: post.id, file_id, position })),
    );
    if (attachError) {
      await supabase.from("posts").update({ status: "deleted" }).eq("id", post.id);
      return fail("One of the images could not be attached. Please upload it again.", { code: "attachment_failed" });
    }
  }

  await syncTagsAndMentions({ entityType: "post", entityId: post.id, text: `${input.title ?? ""}\n${input.body}`, authorId: user.id });
  return ok({ id: post.id, slug: post.slug, category: post.category });
}

export async function updatePost({ user, input }) {
  const limited = await enforceRateLimit("post-update", user.id, { limit: 30, windowSec: 600 });
  if (limited) return limited;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("posts")
    .update({ category: input.category, title: input.title ?? null, body: input.body, visibility: input.visibility })
    .eq("id", input.postId)
    .eq("author_id", user.id)
    .select("id, slug, category")
    .maybeSingle();
  if (error) return dbError(error);
  if (!data) return fail("That post is not available to edit.", { code: "not_found" });

  await syncTagsAndMentions({ entityType: "post", entityId: data.id, text: `${input.title ?? ""}\n${input.body}`, authorId: user.id });
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
  const { data, error } = await supabase
    .from("comments")
    .insert({ post_id: input.postId, author_id: user.id, parent_id: input.parentId ?? null, body: input.body })
    .select("id")
    .single();
  if (error) {
    if (String(error.message).includes("reply_depth_exceeded")) return fail("Replies can only go one level deep.", { code: "depth" });
    return dbError(error, "Could not post your comment.");
  }
  await syncTagsAndMentions({ entityType: "comment", entityId: data.id, text: input.body, authorId: user.id });
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
