import { z } from "zod";
import { BUG_SEVERITIES, FEEDBACK_AREAS, RELEASE_KINDS } from "@/lib/feedback-meta";

const uuid = z.uuid();
const area = z.enum(FEEDBACK_AREAS.map((a) => a.value));

export const feedbackSchema = z.object({
  kind: z.enum(["bug", "feature", "feedback"]),
  title: z.string().trim().min(5, "Give it a short title (at least 5 characters)").max(120, "Keep the title under 120 characters"),
  body: z.string().trim().min(10, "Tell us a little more (at least 10 characters)").max(4000, "Keep it under 4000 characters"),
  severity: z.enum(BUG_SEVERITIES.map((s) => s.value)).optional(),
  area: area.default("other"),
  // What the page knew when the form opened. Free text from the browser is clipped, never trusted.
  context: z.object({
    path: z.string().max(200).optional(),
    standalone: z.boolean().optional(),
    viewport: z.string().max(20).optional(),
  }).optional(),
});

export const triageSchema = z.object({
  id: uuid,
  status: z.enum(["new", "triaged", "planned", "in_progress", "shipped", "declined", "duplicate"]),
  response: z.string().trim().max(1000).optional(),
  isPublic: z.boolean().optional(),
  duplicateOf: uuid.nullable().optional(),
  releaseId: uuid.nullable().optional(),
});

export const releaseSchema = z.object({
  id: uuid.nullable().optional(),
  version: z.string().trim().regex(/^\d{1,3}\.\d{1,3}\.\d{1,3}$/, "Use a version like 1.4.0"),
  title: z.string().trim().min(3, "Give the release a title").max(120),
  summary: z.string().trim().max(300).optional(),
  items: z.array(z.object({ kind: z.enum(RELEASE_KINDS.map((k) => k.value)), text: z.string().trim().min(3).max(240) })).min(1, "Add at least one change").max(60),
  publish: z.boolean().default(false),
});
