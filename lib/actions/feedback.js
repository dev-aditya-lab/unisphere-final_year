"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth/session";
import { fail, ok, parseInput } from "@/lib/actions/result";
import * as feedback from "@/lib/services/feedback";
import { feedbackSchema, releaseSchema, triageSchema } from "@/lib/validators/feedback";

export async function submitFeedbackAction(input) {
  const { user } = await requireProfile();
  const { data, failure } = parseInput(feedbackSchema, input);
  if (failure) return failure;
  const res = await feedback.submitFeedback({ userId: user.id, input: data });
  if (!res.ok) return res;
  revalidatePath("/feedback");
  revalidatePath("/admin/feedback");
  const message = { bug: "Thanks. The team has your bug report.", feature: "Thanks. Your idea is on the board.", feedback: "Thanks. The team will read this." }[data.kind];
  return ok({ id: res.id, message });
}

export async function toggleVoteAction(input) {
  await requireProfile();
  const { data, failure } = parseInput(z.object({ id: z.uuid() }), input);
  if (failure) return failure;
  const res = await feedback.toggleVote(data.id);
  if (res.ok) revalidatePath("/feedback");
  return res.ok ? ok({ voted: res.data }) : res;
}

/** Product team. Authorisation is enforced by the database function; this only validates the shape. */
async function staff(schema, input, run) {
  await requireProfile();
  const { data, failure } = parseInput(schema, input);
  if (failure) return failure;
  const res = await run(data);
  if (res.ok) {
    revalidatePath("/admin", "layout");
    revalidatePath("/roadmap");
    revalidatePath("/changelog");
    revalidatePath("/feedback");
  }
  return res;
}
export async function triageFeedbackAction(input) {
  return staff(triageSchema, input, (d) => {
    if (d.status === "duplicate" && !d.duplicateOf) return fail("Paste the id of the original request.", { fieldErrors: { duplicateOf: "Required" } });
    return feedback.triageFeedback(d);
  });
}
export async function saveReleaseAction(input) {
  return staff(releaseSchema, input, (d) => feedback.saveRelease(d));
}
export async function deleteReleaseAction(input) {
  return staff(z.object({ id: z.uuid() }), input, (d) => feedback.deleteRelease(d.id));
}
