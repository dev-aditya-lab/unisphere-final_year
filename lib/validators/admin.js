import { z } from "zod";

const reason = z.string().trim().max(1000);
const requiredReason = reason.min(3, "Please give a reason (at least 3 characters).");
export const id = z.uuid();

export const resolveReportSchema = z.discriminatedUnion("action", [
  z.object({ id, action: z.literal("dismiss"), reason: reason.optional() }),
  z.object({ id, action: z.enum(["warn", "remove_content", "restrict", "suspend"]), reason: requiredReason }),
]);
export const noteSchema = z.object({ id, note: requiredReason });
export const moderateUserSchema = z.object({ userId: id, action: z.enum(["warn", "restrict", "suspend", "reinstate"]), reason: requiredReason });
export const moderateContentSchema = z.object({ id, action: z.enum(["remove", "restore"]), reason: requiredReason });
export const reviewAppealSchema = z.object({ id, decision: z.enum(["upheld", "denied"]), note: requiredReason });
export const submitAppealSchema = z.object({
  message: z.string().trim().min(10, "Please explain in at least 10 characters.").max(2000, "Keep it under 2000 characters."),
  actionId: id.nullable().optional(),
});
export const grantRoleSchema = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{3,30}$/, "Enter an exact username."),
  role: z.enum(["global_admin", "college_admin", "moderator", "verification_staff", "support_agent"]),
  collegeId: id.nullable().optional(),
});
export const listingSchema = z.object({ kind: z.enum(["community", "event"]), id, removed: z.boolean(), reason: requiredReason.max(500) });
export const verificationReviewSchema = z.object({
  id,
  decision: z.enum(["approved", "rejected", "needs_info"]),
  reason: reason.max(500).optional(),
  notes: reason.optional(),
});
export const collegeSchema = z.object({
  id,
  name: z.string().trim().min(2).max(160),
  shortName: z.string().trim().max(24).optional(),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().max(80).optional(),
  verificationMode: z.enum(["email_domain", "manual", "invite"]),
  isActive: z.boolean(),
});
export const domainSchema = z.object({
  collegeId: id,
  domain: z.string().trim().toLowerCase().regex(/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/, "Enter a valid domain such as students.college.edu"),
  audiences: z.array(z.enum(["student", "alumni", "faculty", "staff"])).min(1, "Choose at least one"),
});
