import { z } from "zod";

const reason = z.string().trim().max(1000);
const requiredReason = reason.min(3, "Please give a reason (at least 3 characters).");
export const id = z.uuid();

export const resolveReportSchema = z.discriminatedUnion("action", [
  z.object({ id, action: z.literal("dismiss"), reason: reason.optional() }),
  z.object({ id, action: z.enum(["warn", "remove_content", "restrict", "suspend"]), reason: requiredReason }),
]);
export const noteSchema = z.object({ id, note: requiredReason });
export const moderateUserSchema = z.object({
  userId: id,
  action: z.enum(["warn", "restrict", "suspend", "reinstate"]),
  reason: requiredReason,
  // Optional period for a restriction or suspension; without it the restriction lasts until staff reinstate the member.
  days: z.number().int().min(1).max(365).nullable().optional(),
});
export const userNoteSchema = z.object({ userId: id, note: requiredReason });
export const userProfileEditSchema = z
  .object({
    userId: id,
    fullName: z.string().trim().min(1, "A name is required").max(80).optional(),
    username: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$/, "3-30 letters, numbers, - or _").optional(),
    headline: z.string().trim().max(160).optional(),
    bio: z.string().trim().max(2000).optional(),
    reason: requiredReason.max(500),
  })
  .refine((v) => ["fullName", "username", "headline", "bio"].some((k) => v[k] !== undefined), { message: "Change at least one field." });
export const userSessionsSchema = z.object({ userId: id, reason: requiredReason.max(500) });
export const userRecoverySchema = z.object({ userId: id });

// Permanent deletion: a real reason, the item's address typed back, and the administrator's own password.
const purgeReason = z.string().trim().min(10, "Give a reason of at least 10 characters. It is kept in the audit log.").max(1000);
const confirmText = z.string().trim().min(1, "Type it to confirm.").max(120);
const password = z.string().min(1, "Enter your password.").max(200);
export const contentImpactSchema = z.object({ kind: z.enum(["post", "community", "event"]), id });
export const purgeContentSchema = z.object({ kind: z.enum(["post", "community", "event"]), id, reason: purgeReason, confirm: confirmText, password });
export const userImpactSchema = z.object({ userId: id });
export const purgeUserSchema = z.object({ userId: id, reason: purgeReason, confirm: confirmText, password, eraseMessages: z.boolean().default(false) });
export const moderateContentSchema = z.object({ id, action: z.enum(["remove", "restore"]), reason: requiredReason });
export const reviewAppealSchema = z.object({ id, decision: z.enum(["upheld", "denied"]), note: requiredReason });
export const submitAppealSchema = z.object({
  message: z.string().trim().min(10, "Please explain in at least 10 characters.").max(2000, "Keep it under 2000 characters."),
  actionId: id.nullable().optional(),
});
export const academicItemSchema = z.object({
  kind: z.enum(["department", "program"]),
  id,
  name: z.string().trim().min(2, "Enter at least 2 characters.").max(120, "Keep the name to 120 characters."),
  isActive: z.boolean(),
});
export const skillSchema = z.object({
  id: id.nullable().optional(),
  kind: z.enum(["skill", "interest"]),
  name: z.string().trim().min(1, "Enter a name.").max(40, "Keep the name to 40 characters."),
  category: z.string().trim().min(2, "Enter a category.").max(40, "Keep the category to 40 characters."),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(100000).nullable().optional(),
});
export const grantRoleSchema = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{3,30}$/, "Enter an exact username."),
  role: z.enum(["global_admin", "college_admin", "moderator", "support_agent", "privacy_officer"]),
  collegeId: id.nullable().optional(),
});
export const listingSchema = z.object({ kind: z.enum(["community", "event"]), id, removed: z.boolean(), reason: requiredReason.max(500) });

const optionalLine = (max) => z.string().trim().max(max).optional().or(z.literal(""));
export const collegeListingSchema = z.object({
  id,
  name: z.string().trim().min(3, "Enter the college name").max(160),
  shortName: optionalLine(24),
  city: optionalLine(80),
  state: optionalLine(80),
  country: optionalLine(80),
  website: optionalLine(300),
  description: optionalLine(500),
  listingStatus: z.enum(["community", "verified"]),
  isActive: z.boolean(),
});
export const collegeAliasSchema = z.object({ collegeId: id, alias: z.string().trim().min(2, "Enter an alias").max(120) });
export const collegeMergeSchema = z.object({ sourceId: id, targetId: id, reason: reason.optional() });
export const collegeReportDecisionSchema = z.object({ id, decision: z.enum(["accepted", "rejected"]), note: reason.max(500).optional() });
