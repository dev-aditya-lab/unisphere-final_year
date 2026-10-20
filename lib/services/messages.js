import "server-only";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { fail, ok } from "@/lib/actions/result";

const CARD = "id, username, full_name, avatar_key, headline";
const PAGE_SIZE = 30;

// A function that the database does not have yet (the migration has not been applied): PostgREST says PGRST202,
// Postgres says 42883. The service then uses the previous code path instead of failing the whole inbox.
const isMissingFunction = (error) =>
  Boolean(error) && (error.code === "PGRST202" || error.code === "42883" || /could not find the function/i.test(String(error.message)));

const unknownPerson = (id) => ({ id: id ?? null, full_name: "UniSphere member", username: null, avatar_key: null, headline: null });

// ── What the client receives ────────────────────────────────────────────────

/** A conversation as the inbox and the thread header show it. */
function toSummary(row) {
  return {
    id: row.conversation_id,
    last_message_at: row.last_message_at,
    last_message_preview: row.last_message_preview ?? null,
    muted: Boolean(row.muted),
    last_read_at: row.last_read_at ?? null,
    unread: Number(row.unread ?? 0),
    otherLastReadAt: row.other_last_read_at ?? null,
    person: row.other_user_id
      ? {
          id: row.other_user_id,
          full_name: row.other_full_name ?? "UniSphere member",
          username: row.other_username ?? null,
          avatar_key: row.other_avatar_key ?? null,
          headline: row.other_headline ?? null,
        }
      : unknownPerson(null),
  };
}

/** A message row, reduced to what the thread needs. */
export function toWireMessage(row) {
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    sender_id: row.sender_id ?? null,
    body: row.status === "deleted" ? "" : row.body ?? "",
    status: row.status,
    created_at: row.created_at,
    edited_at: row.edited_at ?? null,
    client_op_id: row.client_op_id ?? null,
    attachments: row.status === "deleted" || !Array.isArray(row.attachments) ? [] : row.attachments,
  };
}

// ── Reads ───────────────────────────────────────────────────────────────────

/** The inbox in one database round trip (inbox_conversations), newest conversation first. */
export async function getInbox(userId) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("inbox_conversations", { p_limit: 100 });
  if (error) {
    if (isMissingFunction(error)) return (await listConversations(userId)).map(legacySummary);
    throw new Error(`inbox_conversations failed: ${error.message}`);
  }
  return (data ?? []).map(toSummary);
}

/** One conversation's header, or null when the caller is not a member (the route answers 404 either way). */
export async function getConversationHeader(convId, userId) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("conversation_header", { p_conv: convId });
  if (error) {
    if (isMissingFunction(error)) {
      const legacy = await getConversation(convId, userId);
      return legacy ? { ...legacySummary(legacy), canSend: legacy.canSend } : null;
    }
    throw new Error(`conversation_header failed: ${error.message}`);
  }
  const row = Array.isArray(data) ? data[0] : data;
  return row ? { ...toSummary(row), canSend: Boolean(row.can_send) } : null;
}

/**
 * One page of a thread, oldest first.
 *   no cursor     the newest messages (opening a thread)
 *   before        older messages, for scrolling back
 *   after         newer messages, for catching up after a disconnect
 * `hasMore` means more exist beyond this page in the direction asked for.
 */
export async function getThreadPage(convId, { before = null, after = null, limit = PAGE_SIZE } = {}) {
  const supabase = await createClient();
  const take = Math.min(Math.max(limit, 1), 100);
  const { data, error } = await supabase.rpc("conversation_messages", {
    p_conv: convId,
    p_before_ts: before?.ts ?? null,
    p_before_id: before?.id ?? null,
    p_after_ts: after?.ts ?? null,
    p_after_id: after?.id ?? null,
    p_limit: take + 1,
  });
  if (error) {
    if (isMissingFunction(error)) return legacyThreadPage(convId, { before, after, limit: take });
    throw new Error(`conversation_messages failed: ${error.message}`);
  }
  const rows = data ?? [];
  const hasMore = rows.length > take;
  const page = rows.slice(0, take).map(toWireMessage);
  // Without a cursor, or scrolling back, the database returns newest first.
  return { items: after ? page : page.reverse(), hasMore };
}

// ── Writes ──────────────────────────────────────────────────────────────────

const SEND_ERRORS = [
  ["not_authenticated", { error: "Please log in again to send messages.", code: "unauthenticated", status: 401 }],
  ["cannot_send", { error: "This message could not be sent. The other person may not accept messages from you.", code: "cannot_send", status: 403 }],
  ["rate_limited", { error: "You are sending messages very quickly. Please wait a moment.", code: "rate_limited", status: 429 }],
  ["empty_message", { error: "Write a message first.", code: "validation", status: 400 }],
  ["too_many_files", { error: "You can attach up to 3 files.", code: "validation", status: 400 }],
  ["invalid_file", { error: "One of the attachments is not available. Attach it again.", code: "attachment_failed", status: 400 }],
];

/**
 * Send a message exactly once. `clientOpId` is the idempotency key: a retry of the same send returns the stored row
 * (`replayed: true`) instead of creating a second one. One database call (send_message) authorises, rate-limits,
 * inserts and attaches atomically.
 */
export async function sendMessage({ user, conversationId, body, fileIds = [], clientOpId = null }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("send_message", {
    p_conversation: conversationId,
    p_body: body,
    p_file_ids: fileIds,
    p_client_op_id: clientOpId,
  });
  if (error) {
    if (isMissingFunction(error)) return sendMessageLegacy({ user, conversationId, body, fileIds, clientOpId });
    const known = SEND_ERRORS.find(([needle]) => String(error.message).includes(needle));
    if (known) return fail(known[1].error, { code: known[1].code, status: known[1].status });
    // Not one of ours: a transient database or network problem. The client keeps the message and retries.
    return fail("The message could not be saved right now. It will be tried again.", { code: "unavailable", status: 503 });
  }
  return ok({ message: toWireMessage(data.message), replayed: Boolean(data.replayed) });
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

export async function deleteMessage({ user, messageId }) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("messages").update({ status: "deleted" }).eq("id", messageId).eq("sender_id", user.id).select("id").maybeSingle();
  if (error || !data) return fail("You cannot delete that message.", { code: "forbidden" });
  return ok();
}

export async function markConversationRead(convId) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_conversation_read", { p_conv: convId });
  return error ? fail("Could not mark the conversation as read.", { code: "unavailable", status: 503 }) : ok({ readAt: new Date().toISOString() });
}

export async function setMuted({ user, conversationId, muted }) {
  const supabase = await createClient();
  const { error } = await supabase.from("conversation_members").update({ muted }).eq("conversation_id", conversationId).eq("user_id", user.id);
  return error ? fail("Could not update the conversation.") : ok({ muted });
}

// ── The previous code path ──────────────────────────────────────────────────
// Used only while a database has not had migration 20260123000029 applied yet. Slower (several round trips per
// call, rate limit in Redis) but functionally the same, so a deploy can go out before its migration.

function legacySummary(c) {
  return {
    id: c.id,
    last_message_at: c.last_message_at,
    last_message_preview: c.last_message_preview ?? null,
    muted: Boolean(c.muted),
    last_read_at: null,
    unread: Number(c.unread ?? 0),
    otherLastReadAt: c.otherLastReadAt ?? null,
    person: { ...unknownPerson(c.person?.id), ...c.person },
  };
}

export async function listConversations(userId) {
  const supabase = await createClient();
  const { data: mine } = await supabase.from("conversation_members").select("conversation_id, last_read_at, muted").eq("user_id", userId);
  if (!mine?.length) return [];
  const ids = mine.map((m) => m.conversation_id);
  const [{ data: convs }, { data: members }, { data: unread }] = await Promise.all([
    supabase.from("conversations").select("id, last_message_at, last_message_preview").in("id", ids).order("last_message_at", { ascending: false }),
    supabase.from("conversation_members").select("conversation_id, user_id, last_read_at").in("conversation_id", ids).neq("user_id", userId),
    supabase.rpc("unread_message_counts"),
  ]);
  const otherIds = [...new Set((members ?? []).map((m) => m.user_id))];
  const { data: people } = otherIds.length ? await supabase.from("profiles").select(CARD).in("id", otherIds) : { data: [] };
  const personById = new Map((people ?? []).map((p) => [p.id, p]));
  const otherByConv = new Map((members ?? []).map((m) => [m.conversation_id, m]));
  const unreadByConv = new Map((unread ?? []).map((u) => [u.conversation_id, Number(u.unread)]));
  const muted = new Map(mine.map((m) => [m.conversation_id, m.muted]));
  return (convs ?? []).map((c) => {
    const other = otherByConv.get(c.id);
    return {
      ...c,
      unread: unreadByConv.get(c.id) ?? 0,
      muted: muted.get(c.id) ?? false,
      otherLastReadAt: other?.last_read_at ?? null,
      person: personById.get(other?.user_id) ?? unknownPerson(other?.user_id),
    };
  });
}

export async function getConversation(convId, userId) {
  const supabase = await createClient();
  const { data: conv } = await supabase.from("conversations").select("id, last_message_at, last_message_preview").eq("id", convId).maybeSingle();
  if (!conv) return null;
  const { data: members } = await supabase.from("conversation_members").select("user_id, last_read_at, muted").eq("conversation_id", convId);
  const other = (members ?? []).find((m) => m.user_id !== userId);
  const me = (members ?? []).find((m) => m.user_id === userId);
  const { data: person } = other ? await supabase.from("profiles").select(CARD).eq("id", other.user_id).maybeSingle() : { data: null };
  const { data: canSend } = await supabase.rpc("can_send_in_conversation", { p_conv: convId });
  return {
    ...conv,
    person: person ?? unknownPerson(other?.user_id),
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

async function legacyThreadPage(convId, { before, after, limit }) {
  const supabase = await createClient();
  const cols = "id, conversation_id, sender_id, body, status, created_at, edited_at, client_op_id";
  let q = supabase.from("messages").select(cols).eq("conversation_id", convId).limit(limit + 1);
  if (after) q = q.order("created_at", { ascending: true }).order("id", { ascending: true }).or(`created_at.gt.${after.ts},and(created_at.eq.${after.ts},id.gt.${after.id})`);
  else {
    q = q.order("created_at", { ascending: false }).order("id", { ascending: false });
    if (before) q = q.or(`created_at.lt.${before.ts},and(created_at.eq.${before.ts},id.lt.${before.id})`);
  }
  const { data } = await q;
  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const items = (await withAttachments(supabase, rows.slice(0, limit))).map(toWireMessage);
  return { items: after ? items : items.reverse(), hasMore };
}

/** Kept for callers that want a newest-first page with a cursor; new code uses getThreadPage. */
export async function getMessages(convId, { before = null, limit = PAGE_SIZE } = {}) {
  const { items, hasMore } = await getThreadPage(convId, { before, limit });
  const oldest = items[0];
  return { items: [...items].reverse(), nextCursor: hasMore && oldest ? { ts: oldest.created_at, id: oldest.id } : null };
}

async function sendMessageLegacy({ user, conversationId, body, fileIds, clientOpId }) {
  const limited = await enforceRateLimit("message", user.id, { limit: 30, windowSec: 60 });
  if (limited) return { ...limited, status: 429 };
  const supabase = await createClient();
  const columns = "id, conversation_id, sender_id, body, status, created_at, edited_at";
  let { data: msg, error } = await supabase.from("messages").insert({ conversation_id: conversationId, sender_id: user.id, body, client_op_id: clientOpId }).select(columns).single();
  if (error && /client_op_id/.test(String(error.message)) && !/client_op_idx|duplicate key/.test(String(error.message))) {
    ({ data: msg, error } = await supabase.from("messages").insert({ conversation_id: conversationId, sender_id: user.id, body }).select(columns).single());
  }
  if (error?.code === "23505" && String(error.message).includes("messages_client_op_idx")) {
    const { data: existing } = await supabase.from("messages").select(columns).eq("sender_id", user.id).eq("client_op_id", clientOpId).maybeSingle();
    if (existing) {
      const [withFiles] = await withAttachments(supabase, [existing]);
      return ok({ message: toWireMessage({ ...withFiles, client_op_id: clientOpId }), replayed: true });
    }
  }
  if (error) return fail("This message could not be sent. The other person may not accept messages from you.", { code: "cannot_send", status: 403 });

  if (fileIds.length) {
    const { error: attachError } = await supabase.from("message_attachments").insert(fileIds.map((file_id) => ({ message_id: msg.id, file_id })));
    if (attachError) {
      await supabase.from("messages").update({ status: "deleted" }).eq("id", msg.id);
      return fail("One of the attachments could not be sent.", { code: "attachment_failed", status: 400 });
    }
  }
  const [withFiles] = await withAttachments(supabase, [msg]);
  return ok({ message: toWireMessage({ ...withFiles, client_op_id: clientOpId }) });
}
