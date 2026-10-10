"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth/session";
import { fail, parseInput } from "@/lib/actions/result";
import { isFlagEnabled } from "@/lib/settings";
import * as messages from "@/lib/services/messages";

const id = z.uuid();
const cursor = z.object({ ts: z.string().max(40), id: z.uuid() }).nullable().optional();

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

const sendSchema = z.object({
  conversationId: z.uuid(),
  body: z.string().max(4000),
  fileIds: z.array(z.uuid()).max(3).default([]),
});

export async function sendMessageAction(input) {
  const ctx = await gate();
  if (ctx.off) return ctx.off;
  const { data, failure } = parseInput(sendSchema, input);
  if (failure) return failure;
  const body = data.body.trim();
  if (!body && data.fileIds.length === 0) return fail("Write a message first.", { code: "validation" });
  return messages.sendMessage({ user: ctx.user, conversationId: data.conversationId, body, fileIds: data.fileIds });
}

export async function loadMessagesAction({ conversationId, before }) {
  const ctx = await gate();
  if (ctx.off) return ctx.off;
  const parsed = z.object({ conversationId: id, before: cursor }).safeParse({ conversationId, before });
  if (!parsed.success) return fail("Invalid request.");
  return { ok: true, ...(await messages.getMessages(parsed.data.conversationId, { before: parsed.data.before ?? null })) };
}

export async function markConversationReadAction(conversationId) {
  const ctx = await gate();
  if (ctx.off) return ctx.off;
  if (!id.safeParse(conversationId).success) return fail("Invalid request.");
  return messages.markConversationRead(conversationId);
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
