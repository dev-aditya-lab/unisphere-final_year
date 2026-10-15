import "server-only";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { fail, ok } from "@/lib/actions/result";

const CARD = "id, username, full_name, avatar_key, headline";

export async function listConversations(userId) {
  const supabase = await createClient();
  const { data: mine } = await supabase.from("conversation_members").select("conversation_id, last_read_at, muted").eq("user_id", userId);
  if (!mine?.length) return [];
  const ids = mine.map((m) => m.conversation_id);
  const [{ data: convs }, { data: members }, { data: unread }] = await Promise.all([
    supabase.from("conversations").select("id, last_message_at, last_message_preview").in("id", ids).order("last_message_at", { ascending: false }),
    supabase.from("conversation_members").select("conversation_id, user_id").in("conversation_id", ids).neq("user_id", userId),
    supabase.rpc("unread_message_counts"),
  ]);
  const otherIds = [...new Set((members ?? []).map((m) => m.user_id))];
  const { data: people } = otherIds.length ? await supabase.from("profiles").select(CARD).in("id", otherIds) : { data: [] };
  const personById = new Map((people ?? []).map((p) => [p.id, p]));
  const otherByConv = new Map((members ?? []).map((m) => [m.conversation_id, m.user_id]));
  const unreadByConv = new Map((unread ?? []).map((u) => [u.conversation_id, Number(u.unread)]));
  const muted = new Map(mine.map((m) => [m.conversation_id, m.muted]));
  return (convs ?? []).map((c) => ({
    ...c,
    unread: unreadByConv.get(c.id) ?? 0,
    muted: muted.get(c.id) ?? false,
    person: personById.get(otherByConv.get(c.id)) ?? { id: otherByConv.get(c.id), full_name: "UniSphere member", username: null, avatar_key: null },
  }));
}

export async function getConversation(convId, userId) {
  const supabase = await createClient();
  const { data: conv } = await supabase.from("conversations").select("id, last_message_at").eq("id", convId).maybeSingle();
  if (!conv) return null;
  const { data: members } = await supabase.from("conversation_members").select("user_id, last_read_at, muted").eq("conversation_id", convId);
  const other = (members ?? []).find((m) => m.user_id !== userId);
  const me = (members ?? []).find((m) => m.user_id === userId);
  const { data: person } = other ? await supabase.from("profiles").select(CARD).eq("id", other.user_id).maybeSingle() : { data: null };
  const { data: canSend } = await supabase.rpc("can_send_in_conversation", { p_conv: convId });
  return {
    ...conv,
    person: person ?? { id: other?.user_id, full_name: "UniSphere member", username: null, avatar_key: null },
    otherLastReadAt: other?.last_read_at ?? null,
    muted: me?.muted ?? false,
    canSend: Boolean(canSend),
  };
}

async function withAttachments(supabase, rows) {
  if (!rows.length) return [];
  const { data: links } = await supabase.from("message_attachments").select("message_id, file_id").in("message_id", rows.map((r) => r.id));
  const fileIds = [...new Set((links ?? []).map((l) => l.file_id))];
  const { data: files } = fileIds.length ? await supabase.from("files").select("id, original_name, mime_type").in("id", fileIds) : { data: [] };
  const fileById = new Map((files ?? []).map((f) => [f.id, f]));
  return rows.map((r) => ({
    ...r,
    attachments: (links ?? []).filter((l) => l.message_id === r.id).map((l) => fileById.get(l.file_id)).filter(Boolean),
  }));
}

/** Newest-first page; the UI reverses it for display. */
export async function getMessages(convId, { before = null, limit = 30 } = {}) {
  const supabase = await createClient();
  let q = supabase.from("messages").select("id, conversation_id, sender_id, body, status, created_at, edited_at").eq("conversation_id", convId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1);
  if (before) q = q.or(`created_at.lt.${before.ts},and(created_at.eq.${before.ts},id.lt.${before.id})`);
  const { data } = await q;
  const rows = data ?? [];
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return { items: await withAttachments(supabase, page), nextCursor: rows.length > limit && last ? { ts: last.created_at, id: last.id } : null };
}

export async function startConversation(otherId) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_direct_conversation", { p_other: otherId });
  if (error) {
    if (String(error.message).includes("cannot_message")) return fail("You cannot message this person. They may only accept messages from connections, or one of you has blocked the other.", { code: "cannot_message" });
    return fail("Could not start the conversation.");
  }
  return ok({ conversationId: data });
}

export async function sendMessage({ user, conversationId, body, fileIds = [], clientOpId = null }) {
  const limited = await enforceRateLimit("message", user.id, { limit: 30, windowSec: 60 });
  if (limited) return limited;
  const supabase = await createClient();
  const columns = "id, conversation_id, sender_id, body, status, created_at, edited_at";
  let { data: msg, error } = await supabase.from("messages").insert({ conversation_id: conversationId, sender_id: user.id, body, client_op_id: clientOpId }).select(columns).single();
  if (error && /client_op_id/.test(String(error.message)) && !/client_op_idx|duplicate key/.test(String(error.message))) {
    // The database predates the idempotency column (migration 26 not applied yet): send without the key.
    ({ data: msg, error } = await supabase.from("messages").insert({ conversation_id: conversationId, sender_id: user.id, body }).select(columns).single());
  }
  if (error?.code === "23505" && String(error.message).includes("messages_client_op_idx")) {
    // A retry of a message that was already delivered (the reply was lost): return it rather than sending it twice.
    const { data: existing } = await supabase.from("messages").select(columns).eq("sender_id", user.id).eq("client_op_id", clientOpId).maybeSingle();
    if (existing) {
      const [withFiles] = await withAttachments(supabase, [existing]);
      return ok({ message: withFiles, replayed: true });
    }
  }
  if (error) return fail("This message could not be sent. The other person may not accept messages from you.", { code: "cannot_send" });

  if (fileIds.length) {
    const { error: attachError } = await supabase.from("message_attachments").insert(fileIds.map((file_id) => ({ message_id: msg.id, file_id })));
    if (attachError) {
      await supabase.from("messages").update({ status: "deleted" }).eq("id", msg.id);
      return fail("One of the attachments could not be sent.", { code: "attachment_failed" });
    }
  }
  const [withFiles] = await withAttachments(supabase, [msg]);
  return ok({ message: withFiles });
}

export async function deleteMessage({ user, messageId }) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("messages").update({ status: "deleted" }).eq("id", messageId).eq("sender_id", user.id).select("id").maybeSingle();
  if (error || !data) return fail("You cannot delete that message.", { code: "forbidden" });
  return ok();
}

export async function markConversationRead(convId) {
  const supabase = await createClient();
  await supabase.rpc("mark_conversation_read", { p_conv: convId });
  return ok();
}

export async function setMuted({ user, conversationId, muted }) {
  const supabase = await createClient();
  const { error } = await supabase.from("conversation_members").update({ muted }).eq("conversation_id", conversationId).eq("user_id", user.id);
  return error ? fail("Could not update the conversation.") : ok({ muted });
}
