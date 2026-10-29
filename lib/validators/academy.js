import { z } from "zod";
import { percentToBps, toMinor } from "@/lib/academy/money";
import { parseVideoInput } from "@/lib/academy/video";
import { CERT_FONTS, CERT_VARIABLE_KEYS } from "@/lib/academy/cert-vars";
import { parseTimetable } from "@/lib/academy/timetable";

/**
 * Input rules for the Academy forms. These give a friendly message at the field; they are not the security boundary. Row Level
 * Security, the guard triggers and the database functions re-check everything (who may do it, the limits, the shapes).
 * Forms send strings; each schema turns them into the values the database stores (money in paise, lists from lines, dates as ISO).
 */

export const id = z.uuid("Choose one from the list.");
const text = (min, max, what = "This") => z.string().trim().min(min, `${what} needs at least ${min} characters.`).max(max, `${what} can be at most ${max} characters.`);
const optText = (max) => z.string().trim().max(max, `At most ${max} characters.`).optional().nullable().transform((v) => (v ? v : null));
const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens.").min(3, "At least 3 characters.").max(80);
const lines = (maxItems, maxLen) =>
  z.string().optional().nullable().transform((s) => String(s ?? "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean)).pipe(z.array(z.string().max(maxLen, `Each line can be at most ${maxLen} characters.`)).max(maxItems, `At most ${maxItems} lines.`));
const tags = z.string().optional().nullable().transform((s) => [...new Set(String(s ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean))]).pipe(z.array(z.string().max(30)).max(12, "At most 12 tags."));
const int = (min, max) => z.coerce.number({ message: "Enter a whole number." }).int("Enter a whole number.").min(min, `At least ${min}.`).max(max, `At most ${max}.`);
const optInt = (min, max) => z.union([z.literal(""), z.null(), int(min, max)]).optional().transform((v) => (v === "" || v == null ? null : Number(v)));
const date = z.union([z.literal(""), z.null(), z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Enter a valid date and time.")]).optional().transform((v) => (v ? new Date(v).toISOString() : null));
const bool = z.union([z.boolean(), z.literal("on"), z.literal("true"), z.literal("false")]).optional().transform((v) => v === true || v === "on" || v === "true");
const money = (what = "Price") =>
  z.string().trim().transform((v, ctx) => {
    const m = toMinor(v);
    if (m === null) ctx.addIssue({ code: "custom", message: `${what} must be an amount like 999 or 999.50.` });
    return m;
  });
const optMoney = z.union([z.literal(""), z.null(), money()]).optional().transform((v) => (v === "" || v == null ? null : v));
const url = (max = 300) => z.union([z.literal(""), z.null(), z.string().trim().max(max).regex(/^https:\/\/[^\s]+$/, "Use a full https:// link.")]).optional().transform((v) => (v ? v : null));

// ── Catalogue ──────────────────────────────────────────────────────────────
export const categorySchema = z.object({
  name: text(2, 60, "The name"),
  slug,
  code_prefix: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9]{1,7}$/, "2–8 capital letters or numbers, starting with a letter (for example WD)."),
  description: optText(300),
  position: int(0, 1000),
  active: bool,
});

export const courseSchema = z.object({
  title: text(3, 120, "The title"),
  slug,
  kind: z.enum(["course", "program", "internship"]),
  category_id: id,
  short_description: optText(280),
  description_md: optText(20000),
  syllabus_md: optText(20000),
  delivery_mode: z.enum(["recorded", "live", "hybrid"]).default("recorded"),
  timetable_text: z.string().optional().nullable(),
  timetable_note: optText(300),
  level: z.enum(["beginner", "intermediate", "advanced", "all"]),
  language: text(2, 40, "The language"),
  tags,
  objectives: lines(20, 200),
  prerequisites: lines(20, 200),
  skills: lines(30, 60),
  outcomes: lines(12, 200),
  duration_minutes: optInt(0, 600000),
  duration_label: optText(60),
  enrollment_limit: optInt(1, 100000),
  starts_at: date,
  ends_at: date,
  access_days: optInt(1, 3650),
  seo_title: optText(70),
  seo_description: optText(170),
  promo_video_url: url(500),
  cert_min_completion: int(0, 100),
  cert_min_score: int(0, 100),
  cert_require_assignments: bool,
  cert_manual_approval: bool,
}).transform((v, ctx) => {
  const parsed = parseTimetable(v.timetable_text);
  if (parsed.error) ctx.addIssue({ code: "custom", path: ["timetable_text"], message: parsed.error });
  return { ...v, timetable: parsed.rows ?? [] };
});
export const courseRow = (v) => {
  const { cert_min_completion, cert_min_score, cert_require_assignments, cert_manual_approval, timetable_text, ...rest } = v;
  return { ...rest, certificate_criteria: { min_completion_pct: cert_min_completion, min_score_pct: cert_min_score, require_assignments: cert_require_assignments, manual_approval: cert_manual_approval } };
};

export const coursePricingSchema = z.object({ price: z.union([z.literal(""), money()]).transform((v) => (v === "" ? null : v)), refund_days: optInt(0, 365) });

export const moduleSchema = z.object({ course_id: id, title: text(2, 120, "The title"), summary: optText(400), position: int(0, 1000) });
export const lessonSchema = z.object({
  course_id: id, module_id: id, title: text(2, 120, "The title"), kind: z.enum(["video", "text", "resource", "quiz", "assignment"]),
  duration_minutes: optInt(0, 1440), position: int(0, 1000), is_preview: bool, pass_pct: int(1, 100),
});
export const lessonContentSchema = z.object({
  lesson_id: id,
  body_md: optText(60000),
  video: z.string().trim().max(500).optional().nullable(),
}).transform((v, ctx) => {
  const parsed = v.video ? parseVideoInput(v.video) : null;
  if (v.video && !parsed) ctx.addIssue({ code: "custom", path: ["video"], message: "Paste a YouTube or Vimeo link." });
  return { lesson_id: v.lesson_id, body_md: v.body_md, video_provider: parsed?.provider ?? null, video_ref: parsed?.ref ?? null };
});
export const cohortSchema = z.object({ course_id: id, name: text(2, 80, "The name"), starts_at: date, ends_at: date, capacity: optInt(1, 100000), status: z.enum(["open", "closed", "archived"]) });
export const priceRuleSchema = z.object({
  course_id: id, kind: z.enum(["sale", "early_bird", "cohort", "promotion"]), label: text(2, 60, "The label"), price: money("The price"),
  starts_at: date, ends_at: date, cohort_id: z.union([z.literal(""), z.null(), id]).optional().transform((v) => v || null), max_uses: optInt(1, 100000), active: bool,
}).transform(({ price, ...rest }) => ({ ...rest, price_minor: price }));

export const couponSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{2,31}$/, "3–32 characters: capital letters, numbers, - or _."),
  description: optText(200),
  kind: z.enum(["percent", "fixed"]),
  percent: z.string().optional().nullable(),
  amount: z.string().optional().nullable(),
  max_discount: z.string().optional().nullable(),
  min_purchase: z.string().optional().nullable(),
  starts_at: date,
  expires_at: date,
  active: bool,
  usage_limit: optInt(1, 1000000),
  per_user_limit: int(1, 100),
  first_purchase_only: bool,
  kinds: z.array(z.enum(["course", "program", "internship"])).min(1, "Choose at least one."),
  stackable_with_sale: bool,
  auto_apply: bool,
  public_label: optText(60),
  internal_note: optText(500),
  course_ids: z.array(id).max(200).default([]),
  category_ids: z.array(id).max(50).default([]),
  usernames: z.string().optional().nullable(),
}).superRefine((v, ctx) => {
  if (v.kind === "percent" && percentToBps(v.percent) === null) ctx.addIssue({ code: "custom", path: ["percent"], message: "Enter a percentage like 20 or 12.5." });
  if (v.kind === "fixed" && !(toMinor(v.amount) > 0)) ctx.addIssue({ code: "custom", path: ["amount"], message: "Enter an amount like 500." });
  if (v.auto_apply && !v.public_label) ctx.addIssue({ code: "custom", path: ["public_label"], message: "An offer that applies by itself needs a name students will see, like \"Welcome offer\"." });
  if (v.max_discount && toMinor(v.max_discount) === null) ctx.addIssue({ code: "custom", path: ["max_discount"], message: "Enter an amount like 500." });
  if (v.min_purchase && toMinor(v.min_purchase) === null) ctx.addIssue({ code: "custom", path: ["min_purchase"], message: "Enter an amount like 500." });
}).transform((v) => ({
  couponRow: {
    code: v.code, description: v.description, kind: v.kind,
    percent_bps: v.kind === "percent" ? percentToBps(v.percent) : null,
    amount_minor: v.kind === "fixed" ? toMinor(v.amount) : null,
    max_discount_minor: v.kind === "percent" && v.max_discount ? toMinor(v.max_discount) : null,
    min_purchase_minor: v.min_purchase ? toMinor(v.min_purchase) : 0,
    starts_at: v.starts_at, expires_at: v.expires_at, active: v.active, usage_limit: v.usage_limit, per_user_limit: v.per_user_limit,
    first_purchase_only: v.first_purchase_only, kinds: v.kinds, stackable_with_sale: v.stackable_with_sale, auto_apply: v.auto_apply, public_label: v.auto_apply ? v.public_label : null, internal_note: v.internal_note,
  },
  courseIds: v.course_ids, categoryIds: v.category_ids,
  usernames: String(v.usernames ?? "").split(/[\s,]+/).map((u) => u.trim().toLowerCase().replace(/^@/, "")).filter(Boolean).slice(0, 200),
}));

export const mentorSchema = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{3,30}$/, "Enter an exact username."),
  display_name: text(2, 80, "The name"), headline: optText(120), bio: optText(1500), active: bool,
  expertise: z.string().optional().nullable().transform((s) => [...new Set(String(s ?? "").split(",").map((x) => x.trim()).filter(Boolean))]).pipe(z.array(z.string().max(40, "Each item can be at most 40 characters.")).max(8, "At most 8 items.")),
  experience_years: optInt(0, 60),
  linkedin_url: url(300),
  website_url: url(300),
});
export const courseMentorSchema = z.object({ course_id: id, user_id: id, role: z.enum(["lead", "mentor"]) });

export const assignmentSchema = z.object({
  course_id: id,
  lesson_id: z.union([z.literal(""), z.null(), id]).optional().transform((v) => v || null),
  title: text(3, 120, "The title"), summary: optText(400), instructions_md: optText(20000), objectives: lines(12, 200),
  due_at: date, max_score: int(1, 1000), pass_pct: int(1, 100),
  rubric_text: z.string().optional().nullable(),
  formats: z.array(z.enum(["repo", "demo", "file", "text"])).min(1, "Choose at least one."),
  allow_resubmission: bool, max_attempts: int(1, 20), allow_late: bool, required_for_certificate: bool,
  status: z.enum(["draft", "published", "archived"]),
}).transform((v, ctx) => {
  // One rubric line per criterion: "key | Label | points"
  const rubric = [];
  for (const [i, raw] of String(v.rubric_text ?? "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean).entries()) {
    const [key, label, max] = raw.split("|").map((x) => x.trim());
    if (!/^[a-z][a-z0-9_]{1,29}$/.test(key ?? "") || !label || !(Number(max) >= 1 && Number(max) <= 1000)) {
      ctx.addIssue({ code: "custom", path: ["rubric_text"], message: `Line ${i + 1}: write it as  key | Label | points  (for example  code_quality | Code quality | 30).` });
      continue;
    }
    rubric.push({ key, label: label.slice(0, 60), max: Number(max) });
  }
  const { rubric_text, ...rest } = v;
  return { ...rest, rubric };
});

export const quizQuestionSchema = z.object({
  lesson_id: id, position: int(0, 1000), prompt: text(3, 600, "The question"), options_text: z.string(), correct: z.string(), multiple: bool, explanation: optText(600),
}).transform((v, ctx) => {
  const options = v.options_text.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  if (options.length < 2 || options.length > 8) ctx.addIssue({ code: "custom", path: ["options_text"], message: "Give 2 to 8 answers, one per line." });
  const correct = [...new Set(v.correct.split(/[\s,]+/).filter(Boolean).map(Number))].sort();
  if (!correct.length || correct.some((n) => !Number.isInteger(n) || n < 1 || n > options.length)) ctx.addIssue({ code: "custom", path: ["correct"], message: "List the correct answer numbers, like 2 or 1,3." });
  if (!v.multiple && correct.length > 1) ctx.addIssue({ code: "custom", path: ["correct"], message: "Only one answer is correct unless you allow several." });
  return { lesson_id: v.lesson_id, position: v.position, prompt: v.prompt, options, multiple: v.multiple, explanation: v.explanation, correct: correct.map((n) => n - 1) };
});

export const liveSessionSchema = z.object({
  course_id: id,
  cohort_id: z.union([z.literal(""), z.null(), id]).optional().transform((v) => v || null),
  title: text(3, 120, "The title"), description: optText(1000),
  instructor_id: z.union([z.literal(""), z.null(), id]).optional().transform((v) => v || null),
  starts_at: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Enter a start time.").transform((v) => new Date(v).toISOString()),
  ends_at: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Enter an end time.").transform((v) => new Date(v).toISOString()),
  meeting_url: url(500), recording_url: url(500),
  status: z.enum(["scheduled", "live", "completed", "cancelled"]),
  recording_consent: bool, recording_available: bool, resources_note: optText(600), auto_meet: bool,
}).refine((v) => Date.parse(v.ends_at) > Date.parse(v.starts_at), { path: ["ends_at"], message: "The class must end after it starts." })
  .refine((v) => !v.recording_available || v.recording_consent, { path: ["recording_available"], message: "Confirm that participants were told before making a recording available." });

export const announcementSchema = z.object({ course_id: z.union([z.literal(""), z.null(), id]).optional().transform((v) => v || null), title: text(3, 100, "The title"), message: text(3, 2000, "The message") });

export const settingSchemas = {
  sales_enabled: bool,
  tax_mode: z.enum(["none", "inclusive", "exclusive"]),
  tax_rate_bps: z.string().transform((v, ctx) => { const b = v.trim() === "0" ? 0 : percentToBps(v); if (b === null) ctx.addIssue({ code: "custom", message: "Enter a percentage like 18." }); return b; }),
  tax_label: text(1, 30, "The tax name"),
  coupon_with_sale: z.enum(["allow", "block"]),
  refund_window_days: int(0, 365),
  order_hold_minutes: int(5, 1440),
  issuing_organization: text(2, 80, "The name"),
  support_email: z.union([z.literal(""), z.email("Enter an email address.")]),
  assignment_reminder_hours: int(1, 240),
  recording_retention_days: int(1, 3650),
  code_prefix: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9]{1,5}$/, "2–6 capital letters or numbers."),
  certificate_prefix: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9]{1,5}$/, "2–6 capital letters or numbers."),
};

// ── Student ────────────────────────────────────────────────────────────────
export const checkoutSchema = z.object({ courseId: id, cohortId: z.union([z.literal(""), z.null(), id]).optional().transform((v) => v || null), coupon: z.string().trim().max(40).optional().nullable().transform((v) => v || null), consent: z.boolean().optional() });
export const submissionSchema = z.object({
  assignmentId: id,
  repo: url(300), demo: url(300), notes: optText(4000),
  fileId: z.union([z.literal(""), z.null(), id]).optional().transform((v) => v || null),
});
export const profileSchema = z.object({
  certificate_name: z.string().trim().max(80).optional().nullable().transform((v) => (v ? v : null)).refine((v) => v === null || (v.length >= 2 && !/[\u0000-\u001f<>{}]/.test(v)), "Use 2–80 characters, without < > { }."),
  share_score: bool, share_project: bool,
});

// ── Certificates ───────────────────────────────────────────────────────────
const fieldBase = { id: z.string().regex(/^[a-z0-9_-]{1,24}$/), page: int(0, 19), x: z.number().min(0).max(1), y: z.number().min(0).max(1), w: z.number().min(0.01).max(1) };
export const certFieldSchema = z.discriminatedUnion("kind", [
  z.object({ ...fieldBase, kind: z.literal("qr") }),
  z.object({
    ...fieldBase, kind: z.literal("text"), text: z.string().min(1).max(400), font: z.enum(CERT_FONTS.map((f) => f.value)), size: z.number().min(6).max(120),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/), align: z.enum(["left", "center", "right"]), uppercase: z.boolean().optional(), required: z.boolean().optional(),
    h: z.number().min(0.01).max(1).optional(), max_lines: z.number().int().min(1).max(6).optional(), min_size: z.number().min(6).max(120).optional(),
  }),
]);
export const certFieldsSchema = z.array(certFieldSchema).max(40);
export const templateSchema = z.object({ name: text(2, 80, "The name"), description: optText(300), is_default: bool, active: bool });
export const revokeSchema = z.object({ id, reason: text(5, 500, "The reason"), publicNote: z.string().trim().max(200).optional().nullable().transform((v) => v || null) });

export { CERT_VARIABLE_KEYS };
