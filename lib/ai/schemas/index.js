import { z } from "zod";
import { POST_CATEGORIES, REPORT_CATEGORIES } from "@/lib/content/post-meta";

/**
 * Output contracts for every AI task. Models are asked for JSON; nothing is trusted until it
 * parses and validates here. Strings are bounded so a misbehaving model cannot flood the UI.
 */

const str = (max) => z.string().trim().min(1).max(max);
const softStr = (max) => z.string().trim().max(max);
const list = (item, max) => z.array(item).max(max);

const tag = z
  .string()
  .trim()
  .toLowerCase()
  .transform((v) => v.replace(/^#/, "").replace(/[^a-z0-9_]/g, ""))
  .pipe(z.string().min(2).max(40));

const categoryValues = POST_CATEGORIES.map((c) => c.value);
const reportCategoryValues = REPORT_CATEGORIES.map((c) => c.value);

export const schemas = {
  classify_post: z.object({
    category: z.enum(categoryValues),
    confidence: z.enum(["low", "medium", "high"]),
    reason: softStr(240),
  }),

  suggest_tags: z.object({ tags: list(tag, 8) }),

  generate_title: z.object({ titles: list(str(90), 4).min(1) }),

  improve_clarity: z.object({
    improved: str(10000),
    changes: list(softStr(200), 6),
  }),

  structure_project: z.object({
    name: str(100),
    tagline: softStr(160),
    problem: str(1200),
    goals: list(str(200), 6),
    solution: softStr(1500),
    techStack: list(str(40), 10),
    requiredSkills: list(str(40), 10),
    openRoles: list(z.object({ title: str(60), skills: list(str(40), 6) }), 5),
  }),

  sharpen_question: z.object({
    question: str(1500),
    missingContext: list(softStr(200), 5),
  }),

  summarize_discussion: z.object({
    summary: str(900),
    keyPoints: list(str(220), 6),
    openQuestions: list(str(220), 4),
  }),

  summarize_post: z.object({
    summary: str(500),
    keyPoints: list(str(200), 4),
  }),

  extract_concepts: z.object({
    concepts: list(str(40), 10),
    skillsNeeded: list(str(40), 8),
    domain: softStr(60),
  }),

  idea_improvements: z.object({
    directions: list(z.object({ title: str(90), description: str(400) }), 4),
    risks: list(softStr(240), 3),
    firstSteps: list(softStr(200), 4),
  }),

  explain_related: z.object({
    items: list(
      z.object({
        id: z.string().min(1).max(60),
        why: str(260),
        sharedConcepts: list(str(40), 4),
        difference: softStr(260),
      }),
      10,
    ),
  }),

  originality_check: z.object({
    items: list(
      z.object({
        id: z.string().min(1).max(60),
        overlap: list(softStr(200), 4),
        differences: list(softStr(200), 4),
      }),
      6,
    ),
    distinctiveAngles: list(softStr(240), 4),
    suggestions: list(softStr(240), 4),
  }),

  extract_requirements: z.object({
    requiredSkills: list(str(40), 10),
    techStack: list(str(40), 10),
    roles: list(z.object({ title: str(60), skills: list(str(40), 6) }), 5),
    teamSizeHint: z.number().int().min(1).max(30).nullable().optional(),
  }),

  explain_teammates: z.object({
    items: list(z.object({ id: z.string().min(1).max(60), why: str(240) }), 10),
  }),

  draft_daily_question: z
    .object({
      question: str(400),
      // Models like to number or letter the answers ("1) …", "B. …"); the form shows its own letters.
      options: z.array(str(200).transform((o) => o.replace(/^(?:[A-Da-d1-4][).:]|\([A-Da-d1-4]\))\s+/, "").trim()).pipe(str(200))).length(4),
      correct: z.number().int().min(0).max(3),
      explanation: str(600),
    })
    .refine((q) => new Set(q.options.map((o) => o.toLowerCase())).size === 4, { message: "answers must all differ", path: ["options"] }),

  moderation_assist: z.object({
    category: z.enum(reportCategoryValues),
    severity: z.enum(["low", "medium", "high", "critical"]),
    confidence: z.enum(["low", "medium", "high"]),
    rationale: softStr(400),
  }),
};
