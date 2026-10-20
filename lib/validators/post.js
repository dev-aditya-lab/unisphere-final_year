import { z } from "zod";
import { CATEGORY_BY_VALUE, POST_CATEGORIES, POST_VISIBILITY, REACTIONS, REPORT_CATEGORIES } from "@/lib/content/post-meta";

const emptyToNull = (v) => (typeof v === "string" && v.trim() === "" ? null : v);
const categoryValues = POST_CATEGORIES.map((c) => c.value);

const titleField = z.preprocess(emptyToNull, z.string().trim().min(3, "Title must be at least 3 characters").max(140, "Keep the title under 140 characters").nullable().optional());

export const createPostSchema = z
  .object({
    category: z.enum(categoryValues).default("general"),
    title: titleField,
    body: z.string().trim().max(10000, "Posts can be up to 10,000 characters"),
    visibility: z.enum([...POST_VISIBILITY.map((v) => v.value), "community"]).default("college"),
    communityId: z.uuid().nullable().optional(),
    attachmentIds: z.array(z.uuid()).max(4, "You can attach up to 4 images").default([]),
    // Chosen by the client for each submission and kept for retries of the same content (see migration 26).
    clientOpId: z.uuid().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.body.length < 1) ctx.addIssue({ code: "custom", path: ["body"], message: "Write something first" });
    if (CATEGORY_BY_VALUE[v.category]?.titleRequired && !v.title) {
      ctx.addIssue({ code: "custom", path: ["title"], message: "Add a short title for this type of post" });
    }
  });

export const updatePostSchema = z
  .object({
    postId: z.uuid(),
    category: z.enum(categoryValues),
    title: titleField,
    body: z.string().trim().min(1, "Write something first").max(10000),
    visibility: z.enum(POST_VISIBILITY.map((v) => v.value)),
    // What the editor started from. When present, the save only applies if the post still has exactly these values.
    base: z
      .object({
        category: z.enum(categoryValues),
        title: z.string().max(140).nullable(),
        body: z.string().max(10000),
        visibility: z.enum(POST_VISIBILITY.map((v) => v.value)),
      })
      .optional(),
  })
  .superRefine((v, ctx) => {
    if (CATEGORY_BY_VALUE[v.category]?.titleRequired && !v.title) {
      ctx.addIssue({ code: "custom", path: ["title"], message: "Add a short title for this type of post" });
    }
  });

export const repostSchema = z.object({
  postId: z.uuid(),
  comment: z.string().trim().max(2000).optional(),
});

export const reactionSchema = z.object({
  postId: z.uuid(),
  reaction: z.enum(REACTIONS.map((r) => r.value)).nullable(),
});

export const commentSchema = z.object({
  postId: z.uuid(),
  parentId: z.uuid().nullable().optional(),
  body: z.string().trim().min(1, "Write a comment first").max(2000, "Comments can be up to 2,000 characters"),
  clientOpId: z.uuid().optional(),
});

export const feedQuerySchema = z.object({
  scope: z.enum(["for_you", "college", "following", "public"]).default("college"),
  category: z.enum(categoryValues).nullable().optional(),
  // Newest-first feeds page by (time, id). The "For you" feed pages by a ranked window: { asOf, offset }.
  cursor: z
    .union([
      z.object({ ts: z.iso.datetime({ offset: true }), id: z.uuid() }),
      z.object({ asOf: z.iso.datetime({ offset: true }), offset: z.number().int().min(0).max(300) }),
    ])
    .nullable()
    .optional(),
});

export const reportSchema = z.object({
  targetType: z.enum(["post", "comment", "user"]),
  targetId: z.uuid(),
  category: z.enum(REPORT_CATEGORIES.map((c) => c.value)),
  details: z.string().trim().max(1000, "Keep details under 1,000 characters").optional(),
});
