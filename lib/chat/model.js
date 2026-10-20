// Pure helpers for the messaging client: ordering, merging, previews and retry policy. No browser APIs, so every
// rule here is unit-tested without a DOM (tests/unit/chat-model.test.js).

export const LIMITS = {
  /** Characters in one message (matches the database check). */
  maxBody: 4000,
  maxFiles: 3,
  /** Messages per page from the server. */
  page: 30,
  /** Messages per conversation kept on the device. */
  cachePerConversation: 200,
  /** Conversations whose messages are kept on the device (most recently opened). */
  cachedConversations: 30,
  /** Messages shown immediately from the device cache when a thread opens. */
  hydrate: 60,
  /** Send attempts (network and server errors) before a message is marked failed for the member to retry. */
  maxAttempts: 6,
  /** Milliseconds after which a locally kept draft is dropped. */
  draftTtlMs: 14 * 24 * 60 * 60 * 1000,
};

function tsValue(ts) {
  const ms = Date.parse(ts);
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * Order two messages (or cursors): oldest first, ties broken by the timestamp's microseconds and then the id.
 * Negative when `a` is older than `b`.
 */
export function compareByTime(a, b) {
  const sa = String(a.created_at ?? a.ts ?? "");
  const sb = String(b.created_at ?? b.ts ?? "");
  const ta = tsValue(sa);
  const tb = tsValue(sb);
  if (ta !== tb) return ta - tb;
  // The same millisecond: the microsecond digits decide (PostgREST sends six fractional digits).
  const fa = sa.match(/\.(\d+)/)?.[1]?.padEnd(6, "0") ?? "000000";
  const fb = sb.match(/\.(\d+)/)?.[1]?.padEnd(6, "0") ?? "000000";
  if (fa !== fb) return fa < fb ? -1 : 1;
  const ia = String(a.id ?? "");
  const ib = String(b.id ?? "");
  return ia < ib ? -1 : ia > ib ? 1 : 0;
}

export const cursorOf = (m) => (m ? { ts: m.created_at, id: m.id } : null);

/** Is cursor `a` at or after cursor `b`? */
export function cursorAtOrAfter(a, b) {
  if (!a || !b) return false;
  return compareByTime({ created_at: a.ts, id: a.id }, { created_at: b.ts, id: b.id }) >= 0;
}

/** The same one-line preview the database stores in conversations.last_message_preview. */
export function previewOf(body, attachments = []) {
  const flat = String(body ?? "").replace(/\s+/g, " ").trim();
  if (flat) return flat.slice(0, 90);
  return attachments.length > 0 ? "Sent an attachment" : "";
}

/** Exponential backoff with jitter, capped: about 1s, 2s, 4s, 8s, 16s, 30s. `attempt` is 1 for the first retry. */
export function backoffMs(attempt, random = Math.random) {
  const base = Math.min(30_000, 1000 * 2 ** Math.max(0, attempt - 1));
  return Math.round(base * (0.75 + random() * 0.5));
}

/**
 * What to do about a failed request:
 *   "retry"  transient (network, 5xx, 429): keep the message, try again with backoff
 *   "fail"   permanent (validation, forbidden, gone): stop and show a retry button with the reason
 *   "auth"   the session is gone: keep the message and pause until the member logs in again
 */
export function classifyFailure(result) {
  if (!result || result.ok) return null;
  if (result.kind === "auth") return "auth";
  if (result.kind === "network" || result.kind === "transient") return "retry";
  return "fail";
}

/** Sort confirmed messages oldest first (returns a new array). */
export function sortConfirmed(list) {
  return [...list].sort(compareByTime);
}

/** The stable React key for a message: the client id for the member's own sends, the row id otherwise. */
export function keyOf(m) {
  return m.client_op_id ?? m.id;
}

/** A confirmed server message in the shape the UI renders. */
export function toConfirmed(m) {
  return { ...m, key: keyOf(m), send: undefined };
}

/**
 * A view of an outbox entry. The same object is returned while the entry is unchanged, so memoised rows do not
 * re-render when something else in the thread changes.
 */
export function outboxView(entry, viewerId) {
  const cached = entry._view;
  if (cached && cached.send.state === entry.state && cached.send.attempts === (entry.attempts ?? 0) && cached.send.error === (entry.error ?? null)) return cached;
  const view = {
    key: entry.client_op_id,
    id: entry.client_op_id,
    conversation_id: entry.conversation_id,
    sender_id: viewerId,
    body: entry.body,
    status: "sent",
    created_at: entry.created_at,
    edited_at: null,
    attachments: (entry.files ?? []).map((f) => ({ id: f.id, original_name: f.name, mime_type: f.mime })),
    client_op_id: entry.client_op_id,
    send: { state: entry.state, attempts: entry.attempts ?? 0, error: entry.error ?? null, code: entry.error_code ?? null },
  };
  Object.defineProperty(entry, "_view", { value: view, enumerable: false, writable: true, configurable: true });
  return view;
}

/**
 * The messages to render: confirmed ones by time, then the member's own unconfirmed ones in the order they were
 * written. Unconfirmed messages always sit at the end whatever the device clock says, so a skewed clock can never
 * put a "sending" bubble above older messages.
 */
export function composeView(confirmedSorted, outboxEntries, viewerId) {
  const pending = [...outboxEntries].sort((a, b) => a.queued_at - b.queued_at).map((e) => outboxView(e, viewerId));
  return confirmedSorted.concat(pending);
}

/** Which version of one message wins. A deletion is never undone by a stale copy. */
export function preferServer(existing, incoming) {
  if (!existing) return incoming;
  if (existing.status === "deleted" && incoming.status !== "deleted") return existing;
  return incoming;
}

/** Local calendar day, for the date separators. */
export function dayKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
