"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { requireProfile } from "@/lib/auth/session";
import { fail, parseInput } from "@/lib/actions/result";
import { enforceRateLimit } from "@/lib/rate-limit";
import * as posts from "@/lib/services/posts";
import { enqueueAndProcess } from "@/lib/ai/embeddings/jobs";
import {
  commentSchema,
  createPostSchema,
  feedQuerySchema,
  reactionSchema,
  reportSchema,
  repostSchema,
  updatePostSchema,
} from "@/lib/validators/post";

export async function createPostAction(input) {
  const { user } = await requireProfile();
  const { data, failure } = parseInput(createPostSchema, input);
  if (failure) return failure;
  const res = await posts.createPost({ user, input: data });
  if (res.ok) {
    after(() => enqueueAndProcess("post", res.id));
    revalidatePath("/feed");
    revalidatePath(`/u/[username]`, "page");
  }
  return res;
}

export async function updatePostAction(input) {
  const { user } = await requireProfile();
  const { data, failure } = parseInput(updatePostSchema, input);
  if (failure) return failure;
  const res = await posts.updatePost({ user, input: data });
  if (res.ok) {
    after(() => enqueueAndProcess("post", data.postId));
    revalidatePath(`/posts/${res.slug}`);
  }
  return res;
}

export async function deletePostAction(postId) {
  const { user } = await requireProfile();
  if (!z.uuid().safeParse(postId).success) return fail("Invalid request.");
  const res = await posts.deletePost({ user, postId });
  if (res.ok) {
    after(() => enqueueAndProcess("post", postId)); // removes the vector for content that is no longer published
    revalidatePath("/feed");
  }
  return res;
}

export async function repostAction(input) {
  const { user } = await requireProfile();
  const { data, failure } = parseInput(repostSchema, input);
  if (failure) return failure;
  const res = await posts.repost({ user, postId: data.postId, comment: data.comment });
  if (res.ok) revalidatePath("/feed");
  return res;
}

export async function setReactionAction(input) {
  const { user } = await requireProfile();
  const { data, failure } = parseInput(reactionSchema, input);
  if (failure) return failure;
  return posts.setReaction({ user, postId: data.postId, reaction: data.reaction });
}

export async function setBookmarkAction({ postId, bookmarked }) {
  const { user } = await requireProfile();
  if (!z.uuid().safeParse(postId).success) return fail("Invalid request.");
  const res = await posts.setBookmark({ user, postId, bookmarked: Boolean(bookmarked) });
  if (res.ok) revalidatePath("/bookmarks");
  return res;
}

export async function addCommentAction(input) {
  const { user } = await requireProfile();
  const { data, failure } = parseInput(commentSchema, input);
  if (failure) return failure;
  return posts.addComment({ user, input: data });
}

export async function editCommentAction({ commentId, body }) {
  const { user } = await requireProfile();
  const { data, failure } = parseInput(z.object({ commentId: z.uuid(), body: commentSchema.shape.body }), { commentId, body });
  if (failure) return failure;
  return posts.editComment({ user, ...data });
}

export async function deleteCommentAction(commentId) {
  const { user } = await requireProfile();
  if (!z.uuid().safeParse(commentId).success) return fail("Invalid request.");
  return posts.deleteComment({ user, commentId });
}

export async function setCommentLikeAction({ commentId, liked }) {
  const { user } = await requireProfile();
  if (!z.uuid().safeParse(commentId).success) return fail("Invalid request.");
  return posts.setCommentLike({ user, commentId, liked: Boolean(liked) });
}

export async function loadFeedAction(input) {
  await requireProfile();
  const { data, failure } = parseInput(feedQuerySchema, input);
  if (failure) return failure;
  const page = await posts.getFeedPage({ scope: data.scope, category: data.category ?? null, cursor: data.cursor ?? null });
  return { ok: true, ...page };
}

export async function reportAction(input) {
  const { user } = await requireProfile();
  const { data, failure } = parseInput(reportSchema, input);
  if (failure) return failure;
  return posts.submitReport({ user, input: data });
}

/**
 * Tags for the composer's #hashtag suggestions: the ones trending in public posts, which is the same set the
 * sidebar already shows, so no private post can leak a tag. The client keeps the list and filters it as it types.
 */
export async function suggestHashtagsAction() {
  const { user } = await requireProfile();
  const limited = await enforceRateLimit("hashtag-suggest", user.id, { limit: 30, windowSec: 60 });
  if (limited) return limited;
  const tags = await posts.getTrendingHashtags(20);
  return { ok: true, tags: tags.map((t) => t.tag) };
}
