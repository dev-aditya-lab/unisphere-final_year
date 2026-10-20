"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth/session";
import { fail } from "@/lib/actions/result";
import { isFlagEnabled } from "@/lib/settings";
import * as messages from "@/lib/services/messages";

// Sending, loading and marking read live in app/api/messages: a Server Action runs one at a time per browser tab, so
// a read-receipt or a page load used to queue in front of the member's own send. These remain Server Actions because
// they are rare, one-off decisions.

const id = z.uuid();

async function gate() {
  const ctx = await requireProfile();
  if (!(await isFlagEnabled("messaging"))) return { off: fail("Messaging is turned off right now.", { code: "disabled" }) };
  return ctx;
}

export async function startConversationAction(otherId) {
  const ctx = await gate();
  if (ctx.off) return ctx.off;
  if (!id.safeParse(otherId).success) return fail("Invalid request.");
  const res = await messages.startConversation(otherId);
  if (res.ok) revalidatePath("/messages");
  return res;
}

export async function deleteMessageAction(messageId) {
  const ctx = await gate();
  if (ctx.off) return ctx.off;
  if (!id.safeParse(messageId).success) return fail("Invalid request.");
  return messages.deleteMessage({ user: ctx.user, messageId });
}

export async function setMutedAction({ conversationId, muted }) {
  const ctx = await gate();
  if (ctx.off) return ctx.off;
  if (!id.safeParse(conversationId).success) return fail("Invalid request.");
  return messages.setMuted({ user: ctx.user, conversationId, muted: Boolean(muted) });
}
