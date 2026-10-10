"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth/session";
import { parseInput } from "@/lib/actions/result";
import * as verification from "@/lib/services/verification";
import { claimStudentId } from "@/lib/services/student-id";

const inviteSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/, "Format: XXXX-XXXX-XXXX"),
});
const manualSchema = z.object({
  info: z.string().trim().min(20, "Tell us a little more (at least 20 characters)").max(1000),
  documentFileId: z.uuid().nullable().optional(),
});

export async function redeemInviteAction(input) {
  await requireProfile();
  const { data, failure } = parseInput(inviteSchema, input);
  if (failure) return failure;
  const res = await verification.redeemInvite({ code: data.code });
  revalidatePath("/", "layout");
  return res;
}

export async function submitManualVerificationAction(input) {
  const { profile } = await requireProfile();
  const { data, failure } = parseInput(manualSchema, input);
  if (failure) return failure;
  const res = await verification.submitManualRequest({ profile, info: data.info, documentFileId: data.documentFileId });
  revalidatePath("/settings/verification");
  return res;
}

export async function cancelVerificationAction() {
  const { profile } = await requireProfile();
  const res = await verification.cancelVerification({ profile });
  revalidatePath("/settings/verification");
  return res;
}

export async function verifyStudentIdAction(input) {
  const { profile } = await requireProfile({ allowIncomplete: true });
  const { data, failure } = parseInput(z.object({ studentId: z.string().trim().min(4, "Enter your student ID").max(40, "That is too long for a student ID") }), input);
  if (failure) return failure;
  const res = await claimStudentId({ profile, studentId: data.studentId });
  revalidatePath("/", "layout");
  return res;
}
