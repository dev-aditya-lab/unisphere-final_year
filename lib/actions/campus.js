"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth/session";
import { fail, parseInput } from "@/lib/actions/result";
import { isFlagEnabled } from "@/lib/settings";
import * as campus from "@/lib/services/campus";
import { announcementSchema, communitySchema, eventSchema, opportunitySchema } from "@/lib/validators/campus";

const id = z.uuid();
const bad = () => fail("Invalid request.");

async function gate(flag) {
  const ctx = await requireProfile();
  if (flag && !(await isFlagEnabled(flag))) return { off: fail("This feature is turned off right now.", { code: "disabled" }) };
  return ctx;
}

// Communities
export async function createCommunityAction(input) {
  const ctx = await gate("communities");
  if (ctx.off) return ctx.off;
  const { data, failure } = parseInput(communitySchema, input);
  if (failure) return failure;
  const res = await campus.createCommunity({ user: ctx.user, input: data });
  if (res.ok) revalidatePath("/communities");
  return res;
}
function communityAction(fn, validate = (x) => id.safeParse(x).success) {
  return async (arg) => {
    const ctx = await gate("communities");
    if (ctx.off) return ctx.off;
    if (!validate(arg)) return bad();
    const res = await fn(arg);
    if (res.ok) revalidatePath("/communities", "layout");
    return res;
  };
}
export const joinCommunityAction = communityAction(campus.joinCommunity);
export const leaveCommunityAction = communityAction(campus.leaveCommunity);
export const deleteCommunityAction = communityAction(campus.deleteCommunity);
export const respondMembershipAction = communityAction(campus.respondMembership, (a) => id.safeParse(a?.communityId).success && id.safeParse(a?.userId).success);
export const setCommunityOfficialAction = communityAction(campus.setCommunityOfficial, (a) => id.safeParse(a?.communityId).success);

// Events
export async function createEventAction(input) {
  const ctx = await gate("events");
  if (ctx.off) return ctx.off;
  const { data, failure } = parseInput(eventSchema, input);
  if (failure) return failure;
  const res = await campus.createEvent({ user: ctx.user, input: data });
  if (res.ok) revalidatePath("/events");
  return res;
}
export async function updateEventAction({ eventId, input }) {
  const ctx = await gate("events");
  if (ctx.off) return ctx.off;
  if (!id.safeParse(eventId).success) return bad();
  const { data, failure } = parseInput(eventSchema, input);
  if (failure) return failure;
  const res = await campus.updateEvent({ eventId, input: data });
  if (res.ok) revalidatePath("/events", "layout");
  return res;
}
export async function rsvpAction({ eventId, status }) {
  const ctx = await gate("events");
  if (ctx.off) return ctx.off;
  if (!id.safeParse(eventId).success || !["going", "interested", "cancelled"].includes(status)) return bad();
  const res = await campus.rsvp({ eventId, status });
  if (res.ok) revalidatePath("/events", "layout");
  return res;
}
export async function markAttendanceAction({ eventId, userId, attended }) {
  const ctx = await gate("events");
  if (ctx.off) return ctx.off;
  if (!id.safeParse(eventId).success || !id.safeParse(userId).success) return bad();
  const res = await campus.markAttendance({ eventId, userId, attended: Boolean(attended) });
  if (res.ok) revalidatePath("/events", "layout");
  return res;
}
export async function cancelEventAction({ eventId, reason }) {
  const ctx = await gate("events");
  if (ctx.off) return ctx.off;
  if (!id.safeParse(eventId).success) return bad();
  const res = await campus.cancelEvent({ eventId, reason: typeof reason === "string" ? reason.slice(0, 200) : undefined });
  if (res.ok) revalidatePath("/events", "layout");
  return res;
}
export async function deleteEventAction(eventId) {
  const ctx = await gate("events");
  if (ctx.off) return ctx.off;
  if (!id.safeParse(eventId).success) return bad();
  const res = await campus.deleteEvent(eventId);
  if (res.ok) revalidatePath("/events", "layout");
  return res;
}

// Opportunities
export async function createOpportunityAction(input) {
  const ctx = await gate("opportunities");
  if (ctx.off) return ctx.off;
  const { data, failure } = parseInput(opportunitySchema, input);
  if (failure) return failure;
  const res = await campus.createOpportunity({ user: ctx.user, input: data });
  if (res.ok) revalidatePath("/opportunities");
  return res;
}
export async function setOpportunityStatusAction({ opportunityId, status }) {
  const ctx = await gate("opportunities");
  if (ctx.off) return ctx.off;
  if (!id.safeParse(opportunityId).success || !["open", "closed"].includes(status)) return bad();
  const res = await campus.updateOpportunity({ id: opportunityId, patch: { status } });
  if (res.ok) revalidatePath("/opportunities", "layout");
  return res;
}
export async function deleteOpportunityAction(opportunityId) {
  const ctx = await gate("opportunities");
  if (ctx.off) return ctx.off;
  if (!id.safeParse(opportunityId).success) return bad();
  const res = await campus.updateOpportunity({ id: opportunityId, patch: { deleted_at: new Date().toISOString() } });
  if (res.ok) revalidatePath("/opportunities", "layout");
  return res;
}

// Announcements (staff only; the database function re-checks the permission)
export async function publishAnnouncementAction(input) {
  await requireProfile();
  const { data, failure } = parseInput(announcementSchema, input);
  if (failure) return failure;
  const res = await campus.publishAnnouncement(data);
  if (res.ok) revalidatePath("/feed");
  return res;
}
export async function archiveAnnouncementAction(announcementId) {
  await requireProfile();
  if (!id.safeParse(announcementId).success) return bad();
  const res = await campus.archiveAnnouncement(announcementId);
  if (res.ok) revalidatePath("/feed");
  return res;
}
