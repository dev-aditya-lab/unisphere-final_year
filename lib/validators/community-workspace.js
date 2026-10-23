import { z } from "zod";
import { COMMUNITY_KINDS } from "@/lib/validators/campus";
import { CHANNEL_TYPES, REPORT_CATEGORIES, SLOW_MODE_OPTIONS, MAX_MESSAGE_CHARS, MAX_ATTACHMENTS } from "@/lib/community/rules";

const emptyToNull = (v) => (typeof v === "string" && v.trim() === "" ? null : v);
const optText = (max) => z.preprocess(emptyToNull, z.string().trim().max(max, `Keep this under ${max} characters`).nullable().optional());
const noControl = (s) => !/[\u0000-\u001f\u007f]/.test(s);
const name40 = z.string().trim().min(1, "Give it a name").max(40, "Keep the name under 40 characters").refine(noControl, "That name has characters we cannot use");
export const id = z.uuid();

export const categorySchema = z.object({ name: name40 });

export const channelSchema = z.object({
  name: name40,
  type: z.enum(CHANNEL_TYPES.map((t) => t.value)).default("text"),
  categoryId: z.preprocess(emptyToNull, z.uuid().nullable().optional()),
  description: optText(300),
  topic: optText(120),
  rules: optText(1000),
  minViewRole: z.enum(["member", "moderator", "admin"]).default("member"),
  minPostRole: z.enum(["member", "moderator", "admin", "owner"]).default("member"),
  slowModeSeconds: z.coerce.number().int().refine((n) => SLOW_MODE_OPTIONS.some((o) => o.value === n), "Choose one of the options").default(0),
  allowAttachments: z.boolean().default(true),
});

const TOPIC = /^[a-z0-9][a-z0-9-]{0,29}$/;
export const communityDetailsSchema = z.object({
  name: z.string().trim().min(3, "Name must be at least 3 characters").max(80),
  kind: z.enum(COMMUNITY_KINDS.map((k) => k.value)).default("community"),
  description: optText(1500),
  visibility: z.enum(["public", "college", "private"]).default("college"),
  joinPolicy: z.enum(["open", "request", "invite"]).default("open"),
  rules: optText(4000),
  topics: z.array(z.string().trim().toLowerCase().regex(TOPIC, "Topics are lowercase words, numbers and hyphens")).max(8, "Choose up to 8 topics").default([]),
  requireRulesAck: z.boolean().default(false),
  invitePolicy: z.enum(["staff", "members"]).default("staff"),
});

export const sendMessageSchema = z.object({
  body: z.string().max(MAX_MESSAGE_CHARS),
  fileIds: z.array(id).max(MAX_ATTACHMENTS).default([]),
  replyTo: id.nullable().optional(),
  clientOpId: id,
});

export const editMessageSchema = z.object({ body: z.string().max(MAX_MESSAGE_CHARS) });

export const reportSchema = z.object({
  communityId: id,
  targetType: z.enum(["channel_message", "member"]),
  targetId: id,
  category: z.enum(REPORT_CATEGORIES.map((c) => c.value)),
  details: optText(1000),
});

export const moderateSchema = z.object({
  communityId: id,
  userId: id,
  action: z.enum(["warn", "timeout", "clear_timeout", "remove", "ban", "unban", "note"]),
  reason: optText(1000),
  hours: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().min(1).max(672).nullable().optional()),
  reportId: z.preprocess(emptyToNull, id.nullable().optional()),
});

export const inviteSchema = z.object({
  communityId: id,
  hours: z.coerce.number().int().min(1).max(24 * 90).default(168),
  maxUses: z.preprocess((v) => (v === "" || v == null || Number(v) === 0 ? null : Number(v)), z.number().int().min(1).max(1000).nullable().optional()),
  inviteeId: z.preprocess(emptyToNull, id.nullable().optional()),
  note: optText(80),
});

export const inviteCode = z.string().trim().toLowerCase().regex(/^[0-9a-f]{24}$/, "That invite code is not valid");

export const appealSchema = z.object({ actionId: id, message: z.string().trim().min(10, "Tell the reviewers a little more (at least 10 characters)").max(2000) });
