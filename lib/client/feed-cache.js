// An on-device copy of the feed pages a member has scrolled through, so going back to the feed brings the extra pages
// back at once instead of starting again from the first page.
//
// What is stored: post cards the member could already see (the same objects the feed rendered) and the cursor for the
// next page, keyed by account + feed + category. Nothing secret: no tokens, no drafts. Limits: at most 75 posts per entry,
// 8 entries per account, 10 minutes. It is only ever applied when the server's first page still starts with the same post
// (see FeedList), so a changed feed is never papered over with old data. It is wiped on log out (clearUserCaches) and is
// IndexedDB only: private browsing, a full disk or a corrupt entry simply mean no cache.

import Dexie from "dexie";

const DB_NAME = "unisphere-feed";
export const FEED_CACHE_TTL_MS = 10 * 60 * 1000;
export const FEED_CACHE_MAX_ITEMS = 75;
const MAX_ENTRIES_PER_USER = 8;

let db = null;
function open() {
  if (typeof indexedDB === "undefined") return null;
  if (!db) {
    db = new Dexie(DB_NAME);
    db.version(1).stores({ pages: "key, userId, savedAt" });
  }
  return db;
}

const entryKey = (userId, feedKey) => `${userId}|${feedKey}`;

/** @returns {Promise<{items: object[], cursor: object|null}|null>} */
export async function readFeedCache(userId, feedKey, now = Date.now()) {
  const store = open();
  if (!store || !userId) return null;
  try {
    const row = await store.pages.get(entryKey(userId, feedKey));
    if (!row) return null;
    const valid = row.userId === userId && Array.isArray(row.items) && row.items.length > 0 && row.items.every((p) => p && typeof p.id === "string") && typeof row.savedAt === "number";
    if (!valid || now - row.savedAt > FEED_CACHE_TTL_MS) {
      await store.pages.delete(row.key).catch(() => {});
      return null;
    }
    return { items: row.items, cursor: row.cursor ?? null };
  } catch {
    return null;
  }
}

export async function writeFeedCache(userId, feedKey, { items, cursor }, now = Date.now()) {
  const store = open();
  if (!store || !userId || items.length === 0 || items.length > FEED_CACHE_MAX_ITEMS) return;
  try {
    await store.pages.put({ key: entryKey(userId, feedKey), userId, savedAt: now, items, cursor: cursor ?? null });
    const mine = await store.pages.where("userId").equals(userId).sortBy("savedAt");
    const extra = mine.length - MAX_ENTRIES_PER_USER;
    if (extra > 0) await store.pages.bulkDelete(mine.slice(0, extra).map((r) => r.key));
  } catch {
    /* quota exceeded or storage unavailable: the feed works without it */
  }
}

/** Log out / account switch: nothing of this member may remain on the device. */
export async function clearFeedCache() {
  try {
    db?.close();
    db = null;
    await Dexie.delete(DB_NAME);
  } catch {
    /* already gone */
  }
}

/** A post was deleted or hidden: remove it from every saved entry of this member, so a later return cannot bring it back. */
export async function forgetPost(userId, postId) {
  const store = open();
  if (!store || !userId) return;
  try {
    const mine = await store.pages.where("userId").equals(userId).toArray();
    for (const row of mine) {
      if (row.items?.some((p) => p?.id === postId)) await store.pages.update(row.key, { items: row.items.filter((p) => p.id !== postId) });
    }
  } catch {
    /* nothing cached */
  }
}
