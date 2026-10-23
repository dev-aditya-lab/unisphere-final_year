"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth/session";
import { deleteOwnedFile } from "@/lib/storage/uploads";
import { fail, parseInput } from "@/lib/actions/result";
import { enforceRateLimit, getClientIp } from "@/lib/rate-limit";
import { isFlagEnabled } from "@/lib/settings";
import * as ws from "@/lib/services/community-workspace";
import * as communityAi from "@/lib/services/community-ai";
import {
  appealSchema, categorySchema, channelSchema, communityDetailsSchema, id, inviteCode, inviteSchema, moderateSchema, reportSchema,
} from "@/lib/validators/community-workspace";

/**
 * Server Actions for everything that is not the hot message path (that is /api/community-channels). Each one:
 * a signed-in, onboarded member -> the feature switch -> a rate limit -> validation -> a database function that checks
 * the caller's role itself. The member id is never taken from the arguments.
 */

const bad = () => fail("Invalid request.", { code: "validation" });

async function gate(scope, { limit = 60, windowSec = 60 } = {}) {
  const ctx = await requireProfile();
  if (!(await isFlagEnabled("communities"))) return { off: fail("Communities are turned off right now.", { code: "disabled" }) };
  const limited = await enforceRateLimit(scope, ctx.user.id, { limit, windowSec });
  if (limited) return { off: limited };
  return ctx;
}

const refresh = (slug) => {
  revalidatePath("/communities", "layout");
  if (slug) revalidatePath(`/communities/${slug}`, "layout");
};

// ── Structure ───────────────────────────────────────────────────────────────

export async function createCategoryAction({ communityId, name }) {
  const ctx = await gate("community-structure");
  if (ctx.off) return ctx.off;
  const parsed = parseInput(categorySchema, { name });
  if (parsed.failure || !id.safeParse(communityId).success) return parsed.failure ?? bad();
  const res = await ws.createCategory({ communityId, name: parsed.data.name });
  if (res.ok) refresh();
  return res;
}

export async function renameCategoryAction({ categoryId, name }) {
  const ctx = await gate("community-structure");
  if (ctx.off) return ctx.off;
  const parsed = parseInput(categorySchema, { name });
  if (parsed.failure || !id.safeParse(categoryId).success) return parsed.failure ?? bad();
  const res = await ws.updateCategory({ categoryId, name: parsed.data.name });
  if (res.ok) refresh();
  return res;
}

export async function archiveCategoryAction({ categoryId, archived }) {
  const ctx = await gate("community-structure");
  if (ctx.off) return ctx.off;
  if (!id.safeParse(categoryId).success || typeof archived !== "boolean") return bad();
  const res = await ws.updateCategory({ categoryId, name: null, archived });
  if (res.ok) refresh();
  return res;
}

const idArray = z.array(id).max(100);

export async function reorderCategoriesAction({ communityId, ids }) {
  const ctx = await gate("community-structure");
  if (ctx.off) return ctx.off;
  if (!id.safeParse(communityId).success || !idArray.safeParse(ids).success) return bad();
  const res = await ws.reorderCategories({ communityId, ids });
  if (res.ok) refresh();
  return res;
}

export async function createChannelAction({ communityId, input }) {
  const ctx = await gate("community-structure");
  if (ctx.off) return ctx.off;
  const parsed = parseInput(channelSchema, input);
  if (parsed.failure || !id.safeParse(communityId).success) return parsed.failure ?? bad();
  const res = await ws.createChannel({ communityId, input: parsed.data });
  if (res.ok) refresh();
  return res.ok ? { ...res, channelId: res.data } : res;
}

export async function updateChannelAction({ channelId, input, archived = null }) {
  const ctx = await gate("community-structure");
  if (ctx.off) return ctx.off;
  const parsed = parseInput(channelSchema, input);
  if (parsed.failure || !id.safeParse(channelId).success || ![null, true, false].includes(archived)) return parsed.failure ?? bad();
  const res = await ws.updateChannel({ channelId, input: parsed.data, archived });
  if (res.ok) refresh();
  return res;
}

export async function reorderChannelsAction({ communityId, ids }) {
  const ctx = await gate("community-structure");
  if (ctx.off) return ctx.off;
  if (!id.safeParse(communityId).success || !idArray.safeParse(ids).success) return bad();
  const res = await ws.reorderChannels({ communityId, ids });
  if (res.ok) refresh();
  return res;
}

export async function moveChannelAction({ channelId, categoryId }) {
  const ctx = await gate("community-structure");
  if (ctx.off) return ctx.off;
  if (!id.safeParse(channelId).success || (categoryId != null && !id.safeParse(categoryId).success)) return bad();
  const res = await ws.moveChannel({ channelId, categoryId });
  if (res.ok) refresh();
  return res;
}

// ── Details, branding, rules ────────────────────────────────────────────────

export async function updateCommunityDetailsAction({ communityId, input }) {
  const ctx = await gate("community-settings");
  if (ctx.off) return ctx.off;
  const parsed = parseInput(communityDetailsSchema, input);
  if (parsed.failure || !id.safeParse(communityId).success) return parsed.failure ?? bad();
  const res = await ws.updateDetails({ communityId, input: parsed.data });
  if (res.ok) refresh(res.slug);
  return res;
}

export async function setBrandingAction({ communityId, kind, fileId }) {
  const ctx = await gate("community-branding", { limit: 20 });
  if (ctx.off) return ctx.off;
  if (!id.safeParse(communityId).success || !["icon", "banner"].includes(kind) || (fileId != null && !id.safeParse(fileId).success)) return bad();
  const res = await ws.setBranding({ communityId, kind, fileId });
  if (res.ok) refresh();
  return res;
}

/** An upload that succeeded but was not used (the next step failed, or the member changed their mind) is removed at once, not left for the daily sweep. */
export async function discardUploadAction(fileId) {
  const ctx = await gate("community-branding", { limit: 30 });
  if (ctx.off) return ctx.off;
  if (!id.safeParse(fileId).success) return bad();
  return deleteOwnedFile({ user: ctx.user, fileId });
}

export async function acknowledgeRulesAction(communityId) {
  const ctx = await gate("community-rules");
  if (ctx.off) return ctx.off;
  if (!id.safeParse(communityId).success) return bad();
  const res = await ws.acknowledgeRules(communityId);
  if (res.ok) refresh();
  return res;
}

export async function setNotifyPrefAction({ communityId, channelId = null, level, muteHours = null }) {
  const ctx = await gate("community-notify");
  if (ctx.off) return ctx.off;
  const ok = id.safeParse(communityId).success && (channelId == null || id.safeParse(channelId).success)
    && ["all", "mentions", "none"].includes(level) && (muteHours == null || (Number.isInteger(muteHours) && muteHours > 0 && muteHours <= 24 * 365));
  if (!ok) return bad();
  const res = await ws.setNotifyPref({ communityId, channelId, level, muteHours });
  if (res.ok) refresh();
  return res;
}

// ── Invitations ─────────────────────────────────────────────────────────────

export async function createInviteAction(input) {
  const ctx = await gate("community-invite", { limit: 20, windowSec: 600 });
  if (ctx.off) return ctx.off;
  const parsed = parseInput(inviteSchema, input);
  if (parsed.failure) return parsed.failure;
  const res = await ws.createInvite(parsed.data);
  return res.ok ? { ok: true, code: res.data.code, id: res.data.id, expiresInHours: res.data.expires_in_hours } : res;
}

export async function revokeInviteAction(inviteId) {
  const ctx = await gate("community-invite");
  if (ctx.off) return ctx.off;
  if (!id.safeParse(inviteId).success) return bad();
  return ws.revokeInvite(inviteId);
}

/** Looking up an invite is rate-limited per person AND per network address, so a code cannot be guessed at speed. */
async function inviteGate() {
  const ctx = await requireProfile();
  if (!(await isFlagEnabled("communities"))) return { off: fail("Communities are turned off right now.", { code: "disabled" }) };
  const ip = await getClientIp();
  const limited = (await enforceRateLimit("invite-lookup", ctx.user.id, { limit: 10, windowSec: 300 })) ?? (await enforceRateLimit("invite-lookup-ip", ip, { limit: 30, windowSec: 300 }));
  return limited ? { off: limited } : ctx;
}

export async function previewInviteAction(code) {
  const ctx = await inviteGate();
  if (ctx.off) return ctx.off;
  const parsed = inviteCode.safeParse(code);
  // A malformed code gets the same answer as a wrong one.
  if (!parsed.success) return { ok: true, data: { valid: false } };
  return ws.previewInvite(parsed.data);
}

export async function redeemInviteAction(code) {
  const ctx = await inviteGate();
  if (ctx.off) return ctx.off;
  const parsed = inviteCode.safeParse(code);
  if (!parsed.success) return fail("That invite link is not valid any more.", { code: "invite_invalid" });
  const res = await ws.redeemInvite(parsed.data);
  if (res.ok) refresh(res.data);
  return res.ok ? { ok: true, slug: res.data } : res;
}

// ── People ──────────────────────────────────────────────────────────────────

export async function setMemberRoleAction({ communityId, userId, role }) {
  const ctx = await gate("community-roles", { limit: 30 });
  if (ctx.off) return ctx.off;
  if (!id.safeParse(communityId).success || !id.safeParse(userId).success || !["admin", "moderator", "member"].includes(role)) return bad();
  const res = await ws.setMemberRole({ communityId, userId, role });
  if (res.ok) refresh();
  return res;
}

export async function transferOwnershipAction({ communityId, userId, confirm }) {
  const ctx = await gate("community-owner", { limit: 5, windowSec: 3600 });
  if (ctx.off) return ctx.off;
  if (!id.safeParse(communityId).success || !id.safeParse(userId).success || typeof confirm !== "string" || confirm.length > 100) return bad();
  const res = await ws.transferOwnership({ communityId, userId, confirm });
  if (res.ok) refresh();
  return res;
}

export async function moderateMemberAction(input) {
  const ctx = await gate("community-moderate", { limit: 30 });
  if (ctx.off) return ctx.off;
  const parsed = parseInput(moderateSchema, input);
  if (parsed.failure) return parsed.failure;
  const res = await ws.moderateMember(parsed.data);
  if (res.ok) refresh();
  return res;
}

/** Members, searchable and paged. Row level security decides who sees pending and banned people (staff only); this only validates and bounds the request. */
export async function listMembersAction({ communityId, query = "", status = "active", page = 0 }) {
  const ctx = await gate("community-members", { limit: 120 });
  if (ctx.off) return ctx.off;
  if (!id.safeParse(communityId).success || !["active", "pending", "banned"].includes(status) || !Number.isInteger(page) || page < 0 || page > 500 || String(query ?? "").length > 40) return bad();
  const res = await ws.listMembers(communityId, { query, status, page });
  return { ok: true, ...res };
}

// ── Reports and appeals ─────────────────────────────────────────────────────

export async function submitReportAction(input) {
  const ctx = await gate("community-report", { limit: 10, windowSec: 3600 });
  if (ctx.off) return ctx.off;
  const parsed = parseInput(reportSchema, input);
  if (parsed.failure) return parsed.failure;
  return ws.submitReport(parsed.data);
}

export async function updateReportAction({ reportId, status, resolution }) {
  const ctx = await gate("community-moderate", { limit: 60 });
  if (ctx.off) return ctx.off;
  if (!id.safeParse(reportId).success || !["reviewing", "dismissed", "action_taken"].includes(status) || (resolution != null && String(resolution).length > 1000)) return bad();
  const res = await ws.updateReport({ reportId, status, resolution });
  if (res.ok) refresh();
  return res;
}

export async function escalateReportAction(reportId) {
  const ctx = await gate("community-moderate", { limit: 30 });
  if (ctx.off) return ctx.off;
  if (!id.safeParse(reportId).success) return bad();
  const res = await ws.escalateReport(reportId);
  if (res.ok) refresh();
  return res;
}

export async function removeMessageAction({ messageId, reason, reportId = null }) {
  const ctx = await gate("community-moderate", { limit: 60 });
  if (ctx.off) return ctx.off;
  if (!id.safeParse(messageId).success || (reportId != null && !id.safeParse(reportId).success) || String(reason ?? "").length > 1000) return bad();
  const res = await ws.deleteMessage({ messageId, reason: reason ? String(reason).trim() : null, reportId });
  if (res.ok) refresh();
  return res;
}

export async function submitAppealAction(input) {
  const ctx = await gate("community-appeal", { limit: 5, windowSec: 3600 });
  if (ctx.off) return ctx.off;
  const parsed = parseInput(appealSchema, input);
  if (parsed.failure) return parsed.failure;
  const res = await ws.submitAppeal(parsed.data);
  if (res.ok) refresh();
  return res;
}

export async function reviewAppealAction({ appealId, decision, note }) {
  const ctx = await gate("community-moderate", { limit: 30 });
  if (ctx.off) return ctx.off;
  if (!id.safeParse(appealId).success || !["upheld", "denied"].includes(decision) || String(note ?? "").length > 1000) return bad();
  const res = await ws.reviewAppeal({ appealId, decision, note });
  if (res.ok) refresh();
  return res;
}

// ── Platform administration (the database function checks the staff permission) ─

export async function adminResolveCommunityReportAction({ reportId, status, resolution, removeMessage = false }) {
  const ctx = await gate("admin-community", { limit: 60 });
  if (ctx.off) return ctx.off;
  if (!id.safeParse(reportId).success || !["reviewing", "dismissed", "action_taken"].includes(status) || String(resolution ?? "").length > 1000) return bad();
  const res = await ws.adminResolveReport({ reportId, status, resolution, removeMessage: removeMessage === true });
  if (res.ok) revalidatePath("/admin/community-safety");
  return res;
}

export async function adminReviewCommunityAppealAction({ appealId, decision, note }) {
  const ctx = await gate("admin-community", { limit: 60 });
  if (ctx.off) return ctx.off;
  if (!id.safeParse(appealId).success || !["upheld", "denied"].includes(decision) || String(note ?? "").length > 1000) return bad();
  const res = await ws.adminReviewAppeal({ appealId, decision, note });
  if (res.ok) revalidatePath("/admin/community-safety");
  return res;
}

// ── AI (on request only; see lib/services/community-ai.js for what is and is not sent) ──

export async function summarizeChannelAction(channelId) {
  const ctx = await gate("community-ai", { limit: 8, windowSec: 600 });
  if (ctx.off) return ctx.off;
  if (!id.safeParse(channelId).success) return bad();
  return communityAi.summarizeChannel({ user: ctx.user, channelId });
}

export async function draftCommunityTextAction({ communityId, kind, name, brief }) {
  const ctx = await gate("community-ai", { limit: 10, windowSec: 600 });
  if (ctx.off) return ctx.off;
  const ok = id.safeParse(communityId).success && ["description", "rules", "channel_description"].includes(kind)
    && typeof name === "string" && name.length <= 80 && typeof brief === "string" && brief.trim().length >= 5 && brief.length <= 1200;
  if (!ok) return bad();
  return communityAi.draftCommunityText({ user: ctx.user, communityId, kind, name, brief: brief.trim() });
}

export async function suggestReportTriageAction(reportId) {
  const ctx = await gate("community-ai", { limit: 20, windowSec: 600 });
  if (ctx.off) return ctx.off;
  if (!id.safeParse(reportId).success) return bad();
  return communityAi.suggestReportTriage({ user: ctx.user, reportId });
}
