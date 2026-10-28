import "server-only";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushToUser } from "@/lib/services/push";

/**
 * Direct messages are pushed the moment they are sent, one push per message, instead of waiting for the worker (which runs every few
 * minutes and sends one notification per conversation, like the bell). The database decides who gets one (message_push_targets: not the
 * sender, not muted, not blocked, the Messages In app and Push switches on, at least one device), so this file only sends.
 *
 * What the lock screen shows is the sender's name and "New message" or a count, never the text. Every push for one conversation carries
 * the same tag, so a burst replaces itself on the phone instead of piling up. The bell's own notification row is marked as pushed for
 * whoever received this, so the worker does not send it a second time; for anyone this failed for, the worker sends it 15 s later.
 */
const clip = (value, max) => String(value ?? "").slice(0, max);

/** The lock-screen text for a conversation with `unread` messages the member has not read, the newest included. */
export function messagePushPayload({ conversationId, senderName, unread }) {
  const count = Math.max(1, Number(unread) || 1);
  return {
    title: clip(senderName || "New message", 80),
    body: count > 1 ? `${Math.min(count, 99)}${count > 99 ? "+" : ""} new messages` : "Sent you a message",
    url: `/messages/${conversationId}`,
    tag: `message:${conversationId}`,
    category: "messages",
    urgent: true,
  };
}

export async function pushNewMessage({ conversationId, senderId }) {
  try {
    const admin = createAdminClient();
    const { data: targets, error } = await admin.rpc("message_push_targets", { p_conversation: conversationId, p_sender: senderId });
    if (error) {
      // Typically the migration has not been applied yet; the worker still pushes the bell's notification.
      console.error("[message-push] could not find recipients:", error.code ?? error.message);
      return { sent: 0 };
    }
    const reached = [];
    await Promise.all(
      (targets ?? []).map(async (t) => {
        const res = await pushToUser(t.user_id, messagePushPayload({ conversationId, senderName: t.sender_name, unread: t.unread }));
        if (res.delivered > 0) reached.push(t.user_id);
      }),
    );
    if (reached.length) {
      await admin.from("notifications").update({ pushed_at: new Date().toISOString() })
        .eq("type", "message").eq("entity_id", conversationId).in("user_id", reached).is("pushed_at", null);
    }
    return { sent: reached.length };
  } catch (err) {
    console.error("[message-push] failed:", err?.message);
    return { sent: 0 };
  }
}

/** Sends after the response has gone out, so the sender never waits for Google. Outside a request (tests, scripts) it just starts. */
export function schedulePushNewMessage(args) {
  try {
    after(() => pushNewMessage(args));
  } catch {
    void pushNewMessage(args);
  }
}
