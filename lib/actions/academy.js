"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth/session";
import { fail, ok, parseInput } from "@/lib/actions/result";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { isNativeAppRequest } from "@/lib/native-app-server";
import { checkoutSchema, id, profileSchema, submissionSchema } from "@/lib/validators/academy";
import { academyRpc, getSessionAccess, quoteFor, rpcFailure } from "@/lib/services/academy";
import { startCheckout } from "@/lib/services/academy-commerce";

/**
 * Academy Server Actions for students. Each one: sign in, validate, rate-limit, then call a database function that checks again who
 * is asking and what they may do. The browser never supplies a price, a score, a user id or a status.
 */

/** What would this cost me, with this coupon? Worked out by the database; the answer is shown, never trusted back. */
export async function quoteAction(input) {
  const { user } = await requireProfile();
  const { data, failure } = parseInput(checkoutSchema.omit({ consent: true }), input);
  if (failure) return failure;
  if (data.coupon) {
    const limited = await enforceRateLimit("academy-coupon", user.id, { limit: 30, windowSec: 600 });
    if (limited) return limited;
  }
  const res = await quoteFor({ courseId: data.courseId, cohortId: data.cohortId, coupon: data.coupon });
  return res.ok ? ok({ quote: res.quote }) : res;
}

/** Free courses enrol at once. Paid ones create an order and answer `checkoutUrl`, the link that hands the student to the gateway. */
export async function startCheckoutAction(input) {
  const { user, profile } = await requireProfile();
  const { data, failure } = parseInput(checkoutSchema, input);
  if (failure) return failure;
  // Google Play requires its own billing for digital goods sold inside an Android app, so the app never starts a purchase.
  if (await isNativeAppRequest()) return fail("Buying a course is not available in the app. Open unispheres.in in your browser.", { code: "not_in_app" });
  const limited = await enforceRateLimit("academy-order", user.id, { limit: 10, windowSec: 3600 });
  if (limited) return limited;
  const res = await startCheckout({ user, profile, courseId: data.courseId, cohortId: data.cohortId, coupon: data.coupon, consent: data.consent });
  if (res.ok) revalidatePath("/academy", "layout");
  return res;
}

export async function cancelOrderAction(input) {
  const { user } = await requireProfile();
  const { data, failure } = parseInput(z.object({ orderId: id }), input);
  if (failure) return failure;
  const { error } = await (await createClient()).rpc("academy_cancel_order", { p_order: data.orderId, p_user: user.id });
  if (error) return rpcFailure(error);
  revalidatePath("/academy/payments");
  return ok({ message: "Order cancelled." });
}

export async function completeLessonAction(input) {
  const { user } = await requireProfile();
  const { data, failure } = parseInput(z.object({ lessonId: id, undo: z.boolean().optional() }), input);
  if (failure) return failure;
  const limited = await enforceRateLimit("academy-progress", user.id, { limit: 300, windowSec: 3600 });
  if (limited) return limited;
  const res = await academyRpc(data.undo ? "academy_uncomplete_lesson" : "academy_complete_lesson", { p_lesson: data.lessonId });
  if (res.ok) revalidatePath("/academy", "layout");
  return res.ok ? ok({ state: res.data ?? null }) : res;
}

/** Answers are graded by the database against a key students cannot read. */
export async function submitQuizAction(input) {
  const { user } = await requireProfile();
  const { data, failure } = parseInput(z.object({ lessonId: id, answers: z.record(z.uuid(), z.array(z.number().int().min(0).max(7)).max(8)) }), input);
  if (failure) return failure;
  const limited = await enforceRateLimit("academy-quiz", user.id, { limit: 40, windowSec: 3600 });
  if (limited) return limited;
  const res = await academyRpc("academy_submit_quiz", { p_lesson: data.lessonId, p_answers: data.answers });
  if (res.ok) revalidatePath("/academy", "layout");
  return res.ok ? ok({ result: res.data }) : res;
}

export async function submitAssignmentAction(input) {
  const { user } = await requireProfile();
  const { data, failure } = parseInput(submissionSchema, input);
  if (failure) return failure;
  const limited = await enforceRateLimit("academy-submit", user.id, { limit: 20, windowSec: 3600 });
  if (limited) return limited;
  const res = await academyRpc("academy_submit_assignment", { p_assignment: data.assignmentId, p_repo: data.repo, p_demo: data.demo, p_notes: data.notes, p_file: data.fileId });
  if (res.ok) {
    revalidatePath("/academy", "layout");
    return ok({ message: "Submitted. A mentor will review it and you will be notified." });
  }
  return res;
}

export async function requestRefundAction(input) {
  const { user } = await requireProfile();
  const { data, failure } = parseInput(z.object({ orderId: id, reason: z.string().trim().min(3, "Please tell us why (at least 3 characters).").max(500) }), input);
  if (failure) return failure;
  const limited = await enforceRateLimit("academy-refund-request", user.id, { limit: 5, windowSec: 86_400 });
  if (limited) return limited;
  const res = await academyRpc("academy_request_refund", { p_order: data.orderId, p_reason: data.reason });
  if (res.ok) {
    revalidatePath("/academy/payments");
    return ok({ message: "Your refund request was sent. We will review it and tell you the outcome." });
  }
  return res;
}

export async function giveVerifyConsentAction(input) {
  await requireProfile();
  const { data, failure } = parseInput(z.object({ enrollmentId: id }), input);
  if (failure) return failure;
  const res = await academyRpc("academy_give_verify_consent", { p_enrollment: data.enrollmentId });
  if (res.ok) revalidatePath("/academy/certificates");
  return res.ok ? ok({ message: "Thank you. Your certificate can now be issued." }) : res;
}

export async function saveAcademyProfileAction(input) {
  const { user } = await requireProfile();
  const { data, failure } = parseInput(profileSchema, input);
  if (failure) return failure;
  const limited = await enforceRateLimit("academy-profile", user.id, { limit: 30, windowSec: 3600 });
  if (limited) return limited;
  const { error } = await (await createClient()).from("academy_profiles").upsert({ user_id: user.id, ...data }, { onConflict: "user_id" });
  if (error) return rpcFailure(error);
  revalidatePath("/academy/profile");
  return ok({ message: "Saved." });
}

/** "Join" on a live class: the meeting address is fetched now, and only if the database says this student may have it. */
export async function joinSessionAction(input) {
  const { user } = await requireProfile();
  const { data, failure } = parseInput(z.object({ sessionId: id }), input);
  if (failure) return failure;
  const limited = await enforceRateLimit("academy-join", user.id, { limit: 60, windowSec: 3600 });
  if (limited) return limited;
  const access = await getSessionAccess(data.sessionId);
  if (!access) return fail("You are not enrolled for this class.", { code: "forbidden" });
  if (!access.meeting_url) return fail("The meeting link opens one hour before the class starts.", { code: "not_open" });
  return ok({ url: access.meeting_url });
}

export async function recordingAction(input) {
  const { user } = await requireProfile();
  const { data, failure } = parseInput(z.object({ sessionId: id }), input);
  if (failure) return failure;
  const limited = await enforceRateLimit("academy-join", user.id, { limit: 60, windowSec: 3600 });
  if (limited) return limited;
  const access = await getSessionAccess(data.sessionId);
  if (!access?.recording_url) return fail("There is no recording available for this class.", { code: "not_found" });
  return ok({ url: access.recording_url });
}

