import { z } from "zod";
import { emailSchema } from "@/lib/validators/auth";
import { CORRECTABLE_FIELDS, OPTIONAL_PURPOSES } from "@/lib/privacy/registry";

const text = (min, max, message) => z.string().trim().min(min, message).max(max, `Keep this under ${max} characters`);
export const id = z.uuid();

export const optionalPurposeKeys = OPTIONAL_PURPOSES.map((p) => p.key);

export const consentChoiceSchema = z.object({
  purpose: z.enum(optionalPurposeKeys),
  granted: z.boolean(),
  source: z.enum(["settings", "feature_prompt", "application"]).default("settings"),
});

export const reviewSchema = z.object({
  age: z.enum(["adult", "under_18"]),
  // Only meaningful for adults; ignored (and not required) when the member says they are under 18.
  acceptCore: z.boolean().optional(),
  next: z.string().max(512).optional(),
});

export const correctionSchema = z.object({
  field: z.enum(CORRECTABLE_FIELDS.map((f) => f.value)),
  current: z.string().trim().max(300).optional().default(""),
  requested: text(1, 300, "Say what it should be"),
  details: text(10, 3000, "Tell us a little more (at least a sentence)"),
});

export const otherRequestSchema = z.object({
  subject: text(3, 140, "Give the request a short title"),
  details: text(10, 4000, "Please write at least a sentence"),
});

export const grievanceSchema = z.object({
  subject: text(3, 140, "Give your grievance a short title"),
  details: text(20, 4000, "Please describe what happened (at least a couple of sentences)"),
  name: z.string().trim().max(120).optional().default(""),
  email: emailSchema.optional(),
  // Honeypot: a real person never sees or fills this.
  website: z.string().max(0).optional().default(""),
});

export const trackSchema = z.object({
  reference: z.string().trim().toUpperCase().regex(/^(GR|PR)-\d{4}-\d{6}$/, "That is not a valid reference, e.g. GR-2026-000123"),
  code: z.string().trim().min(8).max(40),
});

export const nominationSchema = z.object({
  name: text(2, 120, "Enter their name"),
  email: emailSchema,
  relationship: z.string().trim().max(80).optional().default(""),
});

export const deleteAccountSchema = z.object({
  password: z.string().min(1, "Enter your password").max(200),
  confirm: z.string().refine((v) => v.trim().toUpperCase() === "DELETE", "Type DELETE to confirm"),
  reason: z.string().trim().max(500).optional().default(""),
  eraseMessages: z.boolean().default(false),
});

export const replySchema = z.object({ id, message: text(2, 2000, "Write a message") });

// ── Staff ──
export const staffRequestSchema = z.object({
  id,
  status: z.enum(["verifying", "in_progress", "awaiting_requester", "completed", "partially_completed", "rejected"]).optional(),
  noteRequester: z.string().trim().max(2000).optional(),
  noteInternal: z.string().trim().max(2000).optional(),
  outcomeReason: z.string().trim().max(1000).optional(),
  assign: z.boolean().optional(),
});

export const incidentCreateSchema = z.object({
  title: text(3, 160, "Give the incident a short title"),
  severity: z.enum(["low", "medium", "high", "critical"]),
  detectedAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Enter when it was detected"),
  description: z.string().trim().max(4000).optional().default(""),
  systems: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  categories: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});

export const incidentPatchSchema = z.object({
  id,
  patch: z
    .object({
      title: z.string().trim().min(3).max(160),
      severity: z.enum(["low", "medium", "high", "critical"]),
      description: z.string().trim().max(4000),
      occurred_at: z.string().refine((v) => v === "" || !Number.isNaN(Date.parse(v))),
      occurred_note: z.string().trim().max(500),
      systems: z.array(z.string().trim().min(1).max(80)).max(20),
      data_categories: z.array(z.string().trim().min(1).max(40)).max(20),
      affected_count_estimate: z.union([z.number().int().min(0), z.literal("")]),
      containment: z.string().trim().max(4000),
      root_cause: z.string().trim().max(4000),
      remediation: z.string().trim().max(4000),
      findings_on_person: z.string().trim().max(2000),
      board_reference: z.string().trim().max(120),
      aware_at: z.string().refine((v) => !Number.isNaN(Date.parse(v))),
    })
    .partial()
    .refine((p) => Object.keys(p).length > 0, "Nothing to save"),
});

export const incidentStatusSchema = z.object({
  id,
  to: z.enum(["investigating", "contained", "confirmed", "notified", "resolved", "closed", "not_a_breach"]),
  note: text(5, 1000, "Say why (at least a few words)"),
});

export const incidentEventSchema = z.object({ id, kind: z.enum(["note", "evidence", "containment"]), body: text(3, 4000, "Write something") });

export const incidentAffectedSchema = z.object({
  id,
  // Usernames, one per line or separated by commas. Resolved to accounts on the server.
  usernames: z.string().trim().min(2).max(20000),
});

export const incidentNoticeSchema = z.object({
  id,
  audience: z.enum(["principals", "board_initial", "board_detailed"]),
  subject: text(3, 200, "Give the notice a subject"),
  body: text(40, 8000, "The notice needs a body (at least a few sentences)"),
});

export const noticeIdSchema = z.object({ noticeId: id });
export const noticeSentSchema = z.object({ noticeId: id, reference: z.string().trim().max(120).optional().default("") });
export const accessReviewSchema = z.object({ notes: z.string().trim().max(2000).optional().default("") });

export const privacySettingSchemas = {
  privacy_review_mode: z.enum(["soft", "required"]),
  privacy_minors_policy: z.enum(["adults_only"]),
  privacy_response_days: z.object({
    access: z.number().int().min(1).max(90), correction: z.number().int().min(1).max(90), erasure: z.number().int().min(1).max(90),
    nomination: z.number().int().min(1).max(90), grievance: z.number().int().min(1).max(90), other: z.number().int().min(1).max(90),
  }),
  privacy_grievance_max_days: z.number().int().min(1).max(90),
  privacy_retention: z.object({
    closed_request_days: z.number().int().min(30).max(3650), contact_message_days: z.number().int().min(7).max(3650),
    ai_usage_log_days: z.number().int().min(30).max(3650), erasure_ledger_days: z.number().int().min(30).max(3650),
    closed_report_days: z.number().int().min(30).max(3650),
  }),
  privacy_incident_self_approval: z.boolean(),
};
export const privacySettingSchema = z.object({ key: z.enum(Object.keys(privacySettingSchemas)), value: z.unknown() });
