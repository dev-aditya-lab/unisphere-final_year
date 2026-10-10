"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth/session";
import { fail, parseInput } from "@/lib/actions/result";
import * as social from "@/lib/services/social";

const idSchema = z.uuid();
const requestSchema = z.object({ recipientId: z.uuid(), message: z.string().trim().max(300).optional() });

function refresh() {
  revalidatePath("/connections");
}

export async function sendConnectionRequestAction(input) {
  const { user } = await requireProfile();
  const { data, failure } = parseInput(requestSchema, input);
  if (failure) return failure;
  const res = await social.sendConnectionRequest({ user, recipientId: data.recipientId, message: data.message });
  if (res.ok) refresh();
  return res;
}

export async function respondToRequestAction({ requestId, accept }) {
  await requireProfile();
  if (!idSchema.safeParse(requestId).success) return fail("Invalid request.");
  const res = await social.respondToRequest({ requestId, accept: Boolean(accept) });
  if (res.ok) refresh();
  return res;
}

export async function cancelRequestAction(requestId) {
  await requireProfile();
  if (!idSchema.safeParse(requestId).success) return fail("Invalid request.");
  const res = await social.cancelRequest({ requestId });
  if (res.ok) refresh();
  return res;
}

export async function removeConnectionAction(otherId) {
  await requireProfile();
  if (!idSchema.safeParse(otherId).success) return fail("Invalid request.");
  const res = await social.removeConnection({ otherId });
  if (res.ok) refresh();
  return res;
}

export async function blockUserAction(targetId) {
  await requireProfile();
  if (!idSchema.safeParse(targetId).success) return fail("Invalid request.");
  const res = await social.blockUser({ targetId });
  if (res.ok) {
    refresh();
    revalidatePath("/feed");
  }
  return res;
}

export async function unblockUserAction(targetId) {
  await requireProfile();
  if (!idSchema.safeParse(targetId).success) return fail("Invalid request.");
  const res = await social.unblockUser({ targetId });
  if (res.ok) refresh();
  return res;
}

export async function setFollowAction({ targetId, follow }) {
  const { user } = await requireProfile();
  if (!idSchema.safeParse(targetId).success) return fail("Invalid request.");
  return social.setFollow({ user, targetId, follow: Boolean(follow) });
}
