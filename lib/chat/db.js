// The on-device message store. One IndexedDB database PER ACCOUNT (`unisphere-chat:<user id>`), so one member's
// conversations can never be read through another member's session on the same device, whatever happens to a
// logout. It holds only what the screen needs, and never a credential:
//
//   conversations  inbox rows (name, headline, preview, unread, mute). Replaced wholesale from the server.
//   messages       CONFIRMED messages only (the server's rows). Bounded per conversation, see model.LIMITS.
//   threads        per-conversation sync bookkeeping: how far the cache is known to be gap-free, last opened.
//   outbox         the member's own unconfirmed sends (text, file references, retry state). Survives reloads.
//   drafts         unsent text per conversation.
//   meta           small key/value facts.
//
// Authorisation decisions (can the member still write here?) are deliberately NOT stored: they are asked again
// each time a thread opens. Attachments are stored as references (id, name, type), never as file bytes.
import Dexie from "dexie";

export const DB_PREFIX = "unisphere-chat:";
export const dbNameFor = (userId) => `${DB_PREFIX}${userId}`;

/**
 * Schema versions. Add a `db.version(n + 1).stores({...}).upgrade(tx => ...)` block for every change and never edit
 * an earlier one: Dexie replays them in order on a device that still has an older database.
 */
export function createChatDb(userId, options = {}) {
  const db = new Dexie(dbNameFor(userId), options);
  db.version(1).stores({
    conversations: "id, last_message_at",
    messages: "id, conversation_id, [conversation_id+created_at], client_op_id",
    threads: "conversation_id, last_opened_at",
    outbox: "client_op_id, conversation_id, queued_at",
    drafts: "conversation_id, updated_at",
    meta: "key",
  });
  return db;
}

export const isQuotaError = (error) => error?.name === "QuotaExceededError" || /quota/i.test(String(error?.message ?? ""));

/** Names of every chat database on this device (so other accounts' data can be removed). */
export async function listChatDatabases() {
  try {
    const names = await Dexie.getDatabaseNames();
    return names.filter((n) => n.startsWith(DB_PREFIX));
  } catch {
    return [];
  }
}

/** Deletes chat databases. With `exceptUserId`, keeps that account's. Never throws. */
export async function deleteChatDatabases({ exceptUserId = null } = {}) {
  const keep = exceptUserId ? dbNameFor(exceptUserId) : null;
  const names = await listChatDatabases();
  await Promise.all(
    names
      .filter((n) => n !== keep)
      .map((n) =>
        Dexie.delete(n).catch(() => {
          /* blocked by an open connection in another tab: that tab wipes itself on the broadcast */
        }),
      ),
  );
}
