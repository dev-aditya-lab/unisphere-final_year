// The messaging client: one engine per signed-in account, framework-free so it can be tested without a browser UI.
//
// What it owns
//   - the inbox and every open thread, in memory, rendered from by React (subscribe / getInbox / getThread)
//   - the on-device copy (IndexedDB, one database per account) that lets a conversation open instantly, even offline
//   - the outbox: the member's own sends, written to the device BEFORE the network is touched, retried with backoff
//   - reconciliation of three sources of the same message: the optimistic copy, the server's acknowledgement and the
//     realtime event. They can arrive in any order and any number of times; a message is stored once, by its id.
//
// Rules that keep it honest
//   - A message is "sent" only when the server returned it. "Delivered" is never claimed: the platform cannot know.
//     "Read" is shown only from the recipient's own last_read_at.
//   - The cache of a conversation is a gap-free run that ends at `contiguousNewest`. Realtime messages are shown at
//     once but only extend that run while the live connection has been unbroken; otherwise the next open or reconnect
//     fills the gap from the server (by cursor), so a missed message cannot be skipped.
//   - Nothing here decides who may read or write. The server and row level security do; this module only asks.
import {
  LIMITS,
  backoffMs,
  classifyFailure,
  composeView,
  compareByTime,
  cursorAtOrAfter,
  cursorOf,
  preferServer,
  previewOf,
  sortConfirmed,
  toConfirmed,
} from "./model";
import { isQuotaError } from "./db";

const EMPTY_THREAD = Object.freeze({
  id: null,
  status: "idle",
  messages: Object.freeze([]),
  header: null,
  hasMoreOlder: false,
  loadingOlder: false,
  refreshing: false,
  typing: false,
  error: null,
  notFound: false,
  version: 0,
});

const newId = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

/** The fields of a message that are stored and compared (no view-only properties). */
function plain(m) {
  return {
    id: m.id,
    conversation_id: m.conversation_id,
    sender_id: m.sender_id ?? null,
    body: m.body ?? "",
    status: m.status ?? "sent",
    created_at: m.created_at,
    edited_at: m.edited_at ?? null,
    client_op_id: m.client_op_id ?? null,
    attachments: Array.isArray(m.attachments) ? m.attachments : [],
  };
}

export class ChatEngine {
  constructor({ userId, api, openDb = null, realtimeFactory = null, channelFactory = null, locks = null, backgroundSync = null, isOnline = () => true, deleteMessage = null, now = () => Date.now(), random = Math.random } = {}) {
    this.userId = userId;
    this.api = api;
    this.openDb = openDb;
    this.realtimeFactory = realtimeFactory;
    this.channelFactory = channelFactory;
    this.locks = locks;
    this.backgroundSync = backgroundSync;
    this.isOnline = isOnline;
    this.deleteMessageRequest = deleteMessage;
    this.now = now;
    this.random = random;
    this.tabId = newId();

    this.db = null;
    this.persistent = false;
    this.disposed = false;

    this.inbox = { items: [], status: "idle", error: null };
    this.inboxSnap = { items: this.inbox.items, status: "idle", error: null, hydrated: false };
    this.threads = new Map();
    this.outbox = new Map();
    this.drafts = new Map();
    this.seen = new Set();
    this.connection = { online: true, realtime: "idle", authLost: false };
    this.connectionSnap = { ...this.connection };
    this.active = { id: null, visible: true };

    this.listeners = new Set();
    this.notifyQueued = false;
    this.flushing = false;
    this.flushAgain = false;
    this.retryTimer = null;
    this.readTimers = new Map();
    this.draftTimers = new Map();
    this.typingTimers = new Map();
    this.inboxRefresh = null;
    this.inboxRefreshTimer = null;
    this.realtime = null;
    this.channel = null;
    this.hadLive = false;
    this.writes = 0;
    this.metrics = { inboxFromCacheMs: null, threadFromCacheMs: {}, requests: 0 };

    this.ready = this._init();
  }

  // ── Subscription (useSyncExternalStore) ───────────────────────────────────

  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  _notify() {
    if (this.notifyQueued) return;
    this.notifyQueued = true;
    queueMicrotask(() => {
      this.notifyQueued = false;
      this.listeners.forEach((l) => l());
    });
  }

  getInbox = () => this.inboxSnap;
  getConnection = () => this.connectionSnap;
  getThread = (id) => this.threads.get(id)?.snap ?? EMPTY_THREAD;

  _publishInbox({ hydrated } = {}) {
    this.inboxSnap = { items: this.inbox.items, status: this.inbox.status, error: this.inbox.error, hydrated: hydrated ?? this.inboxSnap.hydrated };
    this.unreadListeners?.forEach((l) => l(this.unreadTotal()));
    this._notify();
  }

  _publishConnection(patch) {
    this.connection = { ...this.connection, ...patch };
    this.connectionSnap = { ...this.connection };
    this._notify();
  }

  _publishThread(t) {
    const confirmed = sortConfirmed([...t.confirmed.values()]).map((m) => t.views.get(m) ?? this._viewOf(t, m));
    const mine = [...this.outbox.values()].filter((e) => e.conversation_id === t.id);
    t.version += 1;
    t.snap = {
      id: t.id,
      status: t.status,
      messages: composeView(confirmed, mine, this.userId),
      header: t.header,
      hasMoreOlder: t.hasMoreOlder,
      loadingOlder: t.loadingOlder,
      refreshing: t.refreshing,
      typing: t.typing,
      error: t.error,
      notFound: t.notFound,
      version: t.version,
    };
    this._notify();
  }

  _viewOf(t, m) {
    const view = toConfirmed(m);
    t.views.set(m, view);
    return view;
  }

  unreadTotal() {
    return this.inbox.items.reduce((sum, c) => sum + (c.unread ?? 0), 0);
  }

  /** Called with the total unread count whenever it changes (the navigation badge). Returns an unsubscribe. */
  onUnread(listener) {
    this.unreadListeners ??= new Set();
    this.unreadListeners.add(listener);
    return () => this.unreadListeners.delete(listener);
  }

  // ── Storage ───────────────────────────────────────────────────────────────

  async _init() {
    const started = this.now();
    if (this.openDb) {
      try {
        const db = this.openDb(this.userId);
        await db.open();
        this.db = db;
        this.persistent = true;
      } catch {
        // Private windows, blocked storage, a corrupt or too-new database: continue in memory. The cache is an
        // accelerator, never required.
        this.db = null;
        this.persistent = false;
      }
    }
    if (this.db) {
      try {
        const [conversations, outbox, drafts] = await Promise.all([
          this.db.conversations.toArray(),
          this.db.outbox.toArray(),
          this.db.drafts.toArray(),
        ]);
        conversations.sort((a, b) => compareByTime({ created_at: b.last_message_at, id: b.id }, { created_at: a.last_message_at, id: a.id }));
        if (this.inbox.items.length === 0) this.inbox.items = conversations;
        for (const e of outbox) {
          // An entry "sending" when the page died is simply queued again; the key makes the repeat safe.
          this.outbox.set(e.client_op_id, { ...e, state: e.state === "failed" ? "failed" : "queued" });
        }
        const cutoff = this.now() - LIMITS.draftTtlMs;
        for (const d of drafts) {
          if (d.updated_at < cutoff) this.db.drafts.delete(d.conversation_id).catch(() => {});
          else this.drafts.set(d.conversation_id, d.body);
        }
        if (this.inbox.items.length > 0) this.inbox.status = "ready";
        this.metrics.inboxFromCacheMs = this.now() - started;
      } catch (error) {
        await this._storageFailed(error);
      }
    }
    this._publishInbox({ hydrated: true });
    this._trimCache().catch(() => {});
    if ([...this.outbox.values()].some((e) => e.state === "queued")) this.flush();
  }

  /** Run a storage operation; a failure degrades to memory-only instead of breaking messaging. */
  async _store(fn) {
    if (!this.db || this.disposed) return false;
    try {
      await fn(this.db);
      return true;
    } catch (error) {
      if (isQuotaError(error)) {
        await this._trimCache({ aggressive: true }).catch(() => {});
        try {
          await fn(this.db);
          return true;
        } catch {
          /* still full: carry on in memory for this session */
        }
      }
      await this._storageFailed(error);
      return false;
    }
  }

  async _storageFailed(error) {
    // A database that cannot be read is cleared once and reopened empty; if that fails too, memory only.
    const name = error?.name;
    if (name === "QuotaExceededError") return;
    try {
      this.db?.close();
      await this.db?.delete();
      if (this.openDb) {
        this.db = this.openDb(this.userId);
        await this.db.open();
        return;
      }
    } catch {
      /* fall through */
    }
    this.db = null;
    this.persistent = false;
  }

  /** Keeps storage bounded: recent conversations only, a capped number of messages in each. */
  async _trimCache({ aggressive = false } = {}) {
    if (!this.db) return;
    const keepConversations = aggressive ? Math.ceil(LIMITS.cachedConversations / 3) : LIMITS.cachedConversations;
    const perConversation = aggressive ? Math.ceil(LIMITS.cachePerConversation / 3) : LIMITS.cachePerConversation;
    await this.db.transaction("rw", this.db.threads, this.db.messages, async () => {
      const threads = await this.db.threads.orderBy("last_opened_at").reverse().toArray();
      for (const dropped of threads.slice(keepConversations)) {
        await this.db.messages.where("conversation_id").equals(dropped.conversation_id).delete();
        await this.db.threads.delete(dropped.conversation_id);
      }
      for (const t of threads.slice(0, keepConversations)) {
        const count = await this.db.messages.where("conversation_id").equals(t.conversation_id).count();
        if (count <= perConversation) continue;
        const keep = await this.db.messages
          .where("[conversation_id+created_at]")
          .between([t.conversation_id, ""], [t.conversation_id, "￿"])
          .reverse()
          .limit(perConversation)
          .primaryKeys();
        const keepSet = new Set(keep);
        const all = await this.db.messages.where("conversation_id").equals(t.conversation_id).primaryKeys();
        await this.db.messages.bulkDelete(all.filter((k) => !keepSet.has(k)));
        await this.db.threads.update(t.conversation_id, { has_more_older: true });
      }
    });
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /** Browser wiring: connectivity, visibility, other tabs, realtime. Not called on the server or in unit tests. */
  start() {
    if (this.disposed || this.started) return;
    this.started = true;
    this._publishConnection({ online: this.isOnline() });

    const onOnline = () => {
      this._publishConnection({ online: true });
      this.flush();
      this.refreshInbox();
      this._revalidateLoaded();
    };
    const onOffline = () => this._publishConnection({ online: false });
    const onVisible = () => {
      this.active.visible = typeof document === "undefined" || document.visibilityState === "visible";
      if (this.active.visible) {
        this.flush();
        if (this.active.id && (this.inboxItem(this.active.id)?.unread ?? 0) > 0) this.markRead(this.active.id);
        if (this.hiddenAt && this.now() - this.hiddenAt > 30_000) {
          this.refreshInbox();
          this._revalidateLoaded();
        }
        this.hiddenAt = null;
      } else {
        this.hiddenAt = this.now();
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("online", onOnline);
      window.addEventListener("offline", onOffline);
      document.addEventListener("visibilitychange", onVisible);
      this.cleanups = [
        () => window.removeEventListener("online", onOnline),
        () => window.removeEventListener("offline", onOffline),
        () => document.removeEventListener("visibilitychange", onVisible),
      ];
    } else this.cleanups = [];

    if (typeof navigator !== "undefined" && navigator.serviceWorker?.addEventListener) {
      // The service worker delivered queued messages while no page was open or reachable.
      const onWorker = (event) => {
        if (event.data?.type !== "CHAT_OUTBOX_CHANGED") return;
        this._onTab({ type: "outbox", tab: "worker" });
        for (const id of this.threads.keys()) this._onTab({ type: "thread", id, tab: "worker" });
      };
      navigator.serviceWorker.addEventListener("message", onWorker);
      this.cleanups.push(() => navigator.serviceWorker.removeEventListener("message", onWorker));
    }

    if (this.channelFactory) {
      this.channel = this.channelFactory(`unisphere-chat:${this.userId}`);
      this.channel.onmessage = (event) => this._onTab(event.data);
      this.cleanups.push(() => this.channel?.close());
    }
    if (this.realtimeFactory) {
      this.realtime = this.realtimeFactory({
        userId: this.userId,
        onInsert: (row) => this._ingest(this._wire(row), "realtime"),
        onUpdate: (row) => this._ingest(this._wire(row), "realtime"),
        onMember: (row) => this._onMember(row),
        onStatus: (status) => this._onRealtimeStatus(status),
        onTyping: (convId, who) => this._onTyping(convId, who),
      });
      this.realtime.start();
      this.cleanups.push(() => this.realtime?.stop());
    }
  }

  dispose() {
    this.disposed = true;
    this.cleanups?.forEach((c) => c());
    clearTimeout(this.retryTimer);
    clearTimeout(this.inboxRefreshTimer);
    this.readTimers.forEach(clearTimeout);
    this.draftTimers.forEach(clearTimeout);
    this.typingTimers.forEach(clearTimeout);
    this.listeners.clear();
    try {
      this.db?.close();
    } catch {
      /* already closed */
    }
  }

  /** True while there is something this engine still has to deliver. */
  hasWork() {
    return [...this.outbox.values()].some((e) => e.state === "queued" || e.state === "sending");
  }

  /** Forget everything held in memory (another tab logged out). The storage wipe is done by the caller. */
  wipeLocal() {
    this.threads.clear();
    this.outbox.clear();
    this.drafts.clear();
    this.inbox = { items: [], status: "idle", error: null };
    this._publishInbox();
  }

  // ── Inbox ─────────────────────────────────────────────────────────────────

  inboxItem(id) {
    return this.inbox.items.find((c) => c.id === id) ?? null;
  }

  /** Server-rendered or freshly fetched inbox: authoritative. */
  seedInbox(items) {
    const viewing = this.active.visible ? this.active.id : null;
    this.inbox.items = items.map((c) => (c.id === viewing ? { ...c, unread: 0 } : c));
    this.inbox.status = "ready";
    this.inbox.error = null;
    this._publishInbox();
    this._store(async (db) => {
      await db.transaction("rw", db.conversations, async () => {
        await db.conversations.clear();
        await db.conversations.bulkPut(this.inbox.items);
      });
    });
  }

  refreshInbox() {
    if (this.inboxRefresh) return this.inboxRefresh;
    this.metrics.requests += 1;
    this.inboxRefresh = (async () => {
      await this.ready;
      if (this.inbox.items.length === 0) {
        this.inbox.status = "loading";
        this._publishInbox();
      }
      const res = await this.api.inbox();
      if (res.ok) this.seedInbox(res.data.conversations);
      else if (res.kind === "auth") this._publishConnection({ authLost: true });
      else if (this.inbox.items.length === 0) {
        this.inbox.status = "error";
        this.inbox.error = res.error;
        this._publishInbox();
      }
    })().finally(() => {
      this.inboxRefresh = null;
    });
    return this.inboxRefresh;
  }

  _scheduleInboxRefresh(delay = 400) {
    clearTimeout(this.inboxRefreshTimer);
    this.inboxRefreshTimer = setTimeout(() => this.refreshInbox(), delay);
  }

  _updateInboxItem(id, patch) {
    const idx = this.inbox.items.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    const next = { ...this.inbox.items[idx], ...patch };
    const items = [...this.inbox.items];
    items[idx] = next;
    // Most recent conversation first (stable for equal times).
    items.sort((a, b) => compareByTime({ created_at: b.last_message_at, id: b.id }, { created_at: a.last_message_at, id: a.id }));
    this.inbox.items = items;
    this._publishInbox();
    this._store((db) => db.conversations.put(next));
    return next;
  }

  setMutedLocal(id, muted) {
    this._updateInboxItem(id, { muted });
    const t = this.threads.get(id);
    if (t?.header) {
      t.header = { ...t.header, muted };
      this._publishThread(t);
    }
  }

  // ── Threads ───────────────────────────────────────────────────────────────

  _thread(id) {
    let t = this.threads.get(id);
    if (!t) {
      t = {
        id,
        confirmed: new Map(),
        views: new WeakMap(),
        header: null,
        status: "idle",
        hasMoreOlder: false,
        loadingOlder: false,
        refreshing: false,
        typing: false,
        error: null,
        notFound: false,
        hydrated: false,
        dirty: false,
        contiguousNewest: null,
        version: 0,
        snap: EMPTY_THREAD,
        revalidating: null,
      };
      this.threads.set(id, t);
    }
    return t;
  }

  /** Server-rendered first page (a direct link or a reload): shown at once, then revalidated like any open. */
  seedThread(id, header, items, hasMore) {
    const t = this._thread(id);
    if (t.hydrated && t.confirmed.size > 0) return; // what this tab already knows is at least as new
    t.header = header ?? t.header;
    for (const m of items) t.confirmed.set(m.id, m);
    t.hasMoreOlder = hasMore;
    t.contiguousNewest = cursorOf(sortConfirmed(items).at(-1)) ?? t.contiguousNewest;
    t.hydrated = true;
    t.status = "ready";
    this._publishThread(t);
    this._persistThread(t, items);
  }

  /** Make a conversation the one being read, and show it: cached copy first, then the server's answer. */
  async openThread(id) {
    const t = this._thread(id);
    this.active.id = id;
    t.notFound = false;
    this.realtime?.watchTyping?.(id);
    await this.ready;
    if (!t.hydrated) await this._hydrateThread(t);
    else this._publishThread(t);
    if ((this.inboxItem(id)?.unread ?? 0) > 0) this.markRead(id);
    return this._revalidate(t);
  }

  closeThread(id) {
    if (this.active.id === id) this.active.id = null;
    const t = this.threads.get(id);
    if (t) {
      t.typing = false;
      this.realtime?.watchTyping?.(null);
    }
  }

  async _hydrateThread(t) {
    const started = this.now();
    t.status = "loading";
    this._publishThread(t);
    let cached = [];
    await this._store(async (db) => {
      const meta = await db.threads.get(t.id);
      cached = await db.messages
        .where("[conversation_id+created_at]")
        .between([t.id, ""], [t.id, "￿"])
        .reverse()
        .limit(LIMITS.hydrate)
        .toArray();
      if (meta) {
        t.contiguousNewest = meta.contiguous_newest ?? null;
        t.hasMoreOlder = meta.has_more_older ?? false;
      }
    });
    for (const m of cached) t.confirmed.set(m.id, m);
    const summary = this.inboxItem(t.id);
    if (summary && !t.header) t.header = { ...summary, canSend: null };
    t.hydrated = true;
    t.status = cached.length > 0 || this._pendingFor(t.id).length > 0 ? "ready" : "loading";
    this.metrics.threadFromCacheMs[t.id] = this.now() - started;
    this._publishThread(t);
  }

  _pendingFor(id) {
    return [...this.outbox.values()].filter((e) => e.conversation_id === id);
  }

  /** Ask the server for the newest page and the header, and join it to the cache without a gap. */
  _revalidate(t) {
    if (t.revalidating) return t.revalidating;
    t.revalidating = (async () => {
      t.refreshing = true;
      this._publishThread(t);
      this.metrics.requests += 1;
      const res = await this.api.thread(t.id, { limit: LIMITS.page });
      if (this.disposed) return;
      if (!res.ok) return this._revalidateFailed(t, res);

      const { conversation, items, hasMore } = res.data;
      t.error = null;
      t.dirty = false;
      if (conversation) {
        t.header = conversation;
        this._updateInboxItem(t.id, {
          last_message_at: conversation.last_message_at,
          last_message_preview: conversation.last_message_preview,
          muted: conversation.muted,
          otherLastReadAt: conversation.otherLastReadAt,
          person: conversation.person,
          ...(this.active.id === t.id && this.active.visible ? {} : { unread: this.inboxItem(t.id)?.unread ?? conversation.unread }),
        });
      }

      const anchor = t.contiguousNewest;
      const page = sortConfirmed(items);
      const first = page[0];
      let toPersist = [...page];
      if (!anchor || t.confirmed.size === 0) {
        // Nothing trustworthy cached: the page is the whole picture.
        t.confirmed.clear();
        t.hasMoreOlder = hasMore;
      } else if (!first || cursorAtOrAfter(anchor, cursorOf(first))) {
        // The cached run reaches the page: they overlap, nothing is missing.
        if (!hasMore) t.hasMoreOlder = false;
      } else {
        // A gap between what we hold and the page: fetch it by cursor, oldest first.
        const filled = await this._fillGap(t, anchor, cursorOf(first));
        if (filled === null) {
          // Too far behind: keep only the page; older history will be fetched when scrolled to.
          t.confirmed.clear();
          t.hasMoreOlder = true;
          this._store((db) => db.messages.where("conversation_id").equals(t.id).delete());
        } else toPersist = filled.concat(toPersist);
      }
      this._upsert(t, toPersist);
      const newest = sortConfirmed(page).at(-1);
      if (newest) t.contiguousNewest = cursorOf(newest);
      t.status = "ready";
      t.refreshing = false;
      this._reconcileOutbox(toPersist);
      this._publishThread(t);
      this._persistThread(t, toPersist);
      if (this.active.id === t.id && this.active.visible && (this.inboxItem(t.id)?.unread ?? 0) > 0) this.markRead(t.id);
    })().finally(() => {
      t.revalidating = null;
      if (t.refreshing) {
        t.refreshing = false;
        this._publishThread(t);
      }
    });
    return t.revalidating;
  }

  _revalidateFailed(t, res) {
    t.refreshing = false;
    if (res.kind === "notfound") {
      t.notFound = true;
      t.status = "ready";
      this._store((db) => Promise.all([db.messages.where("conversation_id").equals(t.id).delete(), db.threads.delete(t.id)]));
    } else if (res.kind === "auth") {
      this._publishConnection({ authLost: true });
    } else {
      // Offline or the server is unwell: keep what is cached and say so.
      t.error = t.confirmed.size > 0 || this._pendingFor(t.id).length > 0 ? "offline" : res.error;
      t.status = t.confirmed.size > 0 || this._pendingFor(t.id).length > 0 ? "ready" : "error";
    }
    this._publishThread(t);
  }

  async _fillGap(t, anchor, until) {
    let cursor = anchor;
    const collected = [];
    for (let pageNo = 0; pageNo < 3; pageNo++) {
      this.metrics.requests += 1;
      const res = await this.api.thread(t.id, { after: cursor, limit: 100 });
      if (!res.ok) return null;
      const items = sortConfirmed(res.data.items);
      collected.push(...items);
      if (items.length === 0) return collected;
      cursor = cursorOf(items.at(-1));
      if (cursorAtOrAfter(cursor, until) || !res.data.hasMore) return collected;
    }
    return null;
  }

  /** Insert or update confirmed messages in a thread (a message is stored once, by its id). */
  _upsert(t, msgs) {
    let changed = false;
    for (const raw of msgs) {
      const m = plain(raw);
      const existing = t.confirmed.get(m.id);
      const next = preferServer(existing, m);
      const differs = !existing || existing.status !== next.status || existing.body !== next.body || existing.edited_at !== next.edited_at || existing.attachments.length !== next.attachments.length;
      if (differs) {
        t.confirmed.set(m.id, next);
        changed = true;
      }
    }
    return changed;
  }

  _persistThread(t, msgs) {
    this._store(async (db) => {
      await db.transaction("rw", db.messages, db.threads, async () => {
        if (msgs.length) await db.messages.bulkPut(msgs.map(plain));
        await db.threads.put({
          conversation_id: t.id,
          contiguous_newest: t.contiguousNewest,
          has_more_older: t.hasMoreOlder,
          last_opened_at: this.now(),
        });
      });
    });
    this._maybeTrim();
    this._tabNote({ type: "thread", id: t.id });
  }

  _maybeTrim() {
    this.writes += 1;
    if (this.writes % 40 === 0) this._trimCache().catch(() => {});
  }

  async loadOlder(id) {
    const t = this.threads.get(id);
    if (!t || t.loadingOlder || !t.hasMoreOlder) return;
    const oldest = sortConfirmed([...t.confirmed.values()])[0];
    if (!oldest) return;
    t.loadingOlder = true;
    this._publishThread(t);
    // The device first: messages cached from an earlier visit cost nothing.
    let cached = [];
    await this._store(async (db) => {
      cached = await db.messages
        .where("[conversation_id+created_at]")
        .between([id, ""], [id, oldest.created_at], true, false)
        .reverse()
        .limit(LIMITS.page)
        .toArray();
    });
    cached = cached.filter((m) => compareByTime(m, oldest) < 0);
    if (cached.length >= LIMITS.page) {
      this._upsert(t, cached);
      t.loadingOlder = false;
      this._publishThread(t);
      return;
    }
    this.metrics.requests += 1;
    const res = await this.api.thread(id, { before: cursorOf(oldest), limit: LIMITS.page });
    t.loadingOlder = false;
    if (res.ok) {
      this._upsert(t, [...cached, ...res.data.items]);
      t.hasMoreOlder = res.data.hasMore;
      this._publishThread(t);
      this._persistThread(t, res.data.items);
    } else {
      t.error = res.kind === "network" ? "offline" : res.error;
      if (cached.length) this._upsert(t, cached);
      this._publishThread(t);
    }
  }

  _revalidateLoaded() {
    for (const t of this.threads.values()) if (t.hydrated && (t.id === this.active.id || t.dirty)) this._revalidate(t);
  }

  // ── Incoming: realtime events and acknowledgements ────────────────────────

  _wire(row) {
    return {
      id: row.id,
      conversation_id: row.conversation_id,
      sender_id: row.sender_id ?? null,
      body: row.status === "deleted" ? "" : row.body ?? "",
      status: row.status ?? "sent",
      created_at: row.created_at,
      edited_at: row.edited_at ?? null,
      client_op_id: row.client_op_id ?? null,
      attachments: row.status === "deleted" || !Array.isArray(row.attachments) ? [] : row.attachments,
    };
  }

  /** The one door every message passes through, whatever told us about it. Safe to call twice with the same message. */
  _ingest(msg, source) {
    if (this.disposed || !msg?.id || !msg.conversation_id) return;
    const convId = msg.conversation_id;
    const t = this.threads.get(convId);
    const loaded = Boolean(t?.hydrated);
    const existing = t?.confirmed.get(msg.id);
    const firstSight = !existing && !this.seen.has(msg.id);
    this.seen.add(msg.id);
    if (this.seen.size > 2000) this.seen.delete(this.seen.values().next().value);

    this._reconcileOutbox([msg]);

    if (loaded) {
      const changed = this._upsert(t, [msg]);
      if (!t.dirty && !t.revalidating) {
        const cur = cursorOf(msg);
        if (!t.contiguousNewest || cursorAtOrAfter(cur, t.contiguousNewest)) t.contiguousNewest = cur;
      }
      if (t.typing && msg.sender_id !== this.userId) t.typing = false;
      if (changed || firstSight) {
        this._publishThread(t);
        this._persistThread(t, [msg]);
      }
    }

    if (firstSight && msg.status === "sent") {
      const mine = msg.sender_id === this.userId;
      const viewing = this.active.id === convId && this.active.visible;
      const item = this.inboxItem(convId);
      if (!item) {
        this._scheduleInboxRefresh();
      } else if (!item.last_message_at || compareByTime({ created_at: msg.created_at, id: msg.id }, { created_at: item.last_message_at, id: "" }) >= 0) {
        this._updateInboxItem(convId, {
          last_message_at: msg.created_at,
          last_message_preview: previewOf(msg.body, msg.attachments) || item.last_message_preview,
          unread: mine || viewing ? 0 : (item.unread ?? 0) + 1,
        });
      }
      if (!mine && viewing) this.markRead(convId);
    }
  }

  /** The server has this message, so its local outbox copy is done. */
  _reconcileOutbox(msgs) {
    for (const m of msgs) {
      const op = m.client_op_id;
      if (!op || !this.outbox.has(op)) continue;
      const entry = this.outbox.get(op);
      this.outbox.delete(op);
      this._store((db) => db.outbox.delete(op));
      this._tabNote({ type: "outbox" });
      const t = this.threads.get(entry.conversation_id);
      if (t?.hydrated) this._publishThread(t);
    }
  }

  _onMember(row) {
    const convId = row.conversation_id;
    if (row.user_id === this.userId) {
      // Read on another device or tab.
      const item = this.inboxItem(convId);
      if (item && item.last_message_at && new Date(row.last_read_at) >= new Date(item.last_message_at) && item.unread) this._updateInboxItem(convId, { unread: 0 });
      if (item && row.muted !== undefined && row.muted !== item.muted) this.setMutedLocal(convId, row.muted);
      return;
    }
    this._updateInboxItem(convId, { otherLastReadAt: row.last_read_at });
    const t = this.threads.get(convId);
    if (t?.hydrated && t.header) {
      t.header = { ...t.header, otherLastReadAt: row.last_read_at };
      this._publishThread(t);
    }
  }

  _onTyping(convId, who) {
    if (who === this.userId) return;
    const t = this.threads.get(convId);
    if (!t) return;
    t.typing = true;
    this._publishThread(t);
    clearTimeout(this.typingTimers.get(convId));
    this.typingTimers.set(
      convId,
      setTimeout(() => {
        t.typing = false;
        this._publishThread(t);
      }, 3500),
    );
  }

  announceTyping(convId) {
    const now = this.now();
    if (this.lastTypingAt && now - this.lastTypingAt < 2000) return;
    this.lastTypingAt = now;
    this.realtime?.sendTyping?.(convId);
  }

  watchTyping(convId) {
    this.realtime?.watchTyping?.(convId);
  }

  _onRealtimeStatus(status) {
    if (status === "live") {
      const reconnect = this.hadLive;
      this.hadLive = true;
      this._publishConnection({ realtime: "live" });
      if (reconnect) {
        // Anything sent while the socket was down never reached us: ask, by cursor, rather than assume.
        this.refreshInbox();
        this._revalidateLoaded();
        this.flush();
      }
    } else {
      this._publishConnection({ realtime: status });
      if (status === "down") for (const t of this.threads.values()) if (t.hydrated) t.dirty = true;
    }
  }

  // ── Read state ────────────────────────────────────────────────────────────

  markRead(id) {
    const item = this.inboxItem(id);
    if (item && item.unread > 0) this._updateInboxItem(id, { unread: 0 });
    if (this.readTimers.has(id)) return;
    this.readTimers.set(
      id,
      setTimeout(async () => {
        this.readTimers.delete(id);
        if (this.disposed || !this.isOnline()) return;
        this.metrics.requests += 1;
        const res = await this.api.markRead(id);
        if (!res.ok && res.kind === "auth") this._publishConnection({ authLost: true });
      }, 250),
    );
  }

  // ── Sending (the outbox) ──────────────────────────────────────────────────

  /**
   * Accept a message from the composer. The message is in memory (and on screen) before this returns; `persisted`
   * resolves when it is also safe on the device, which is when the draft may be cleared.
   * @returns {{ok:true, clientOpId:string, persisted:Promise<boolean>} | {ok:false, reason:string}}
   */
  send(conversationId, { body = "", files = [] } = {}) {
    const text = String(body).trim();
    if (!text && files.length === 0) return { ok: false, reason: "empty" };
    if (text.length > LIMITS.maxBody) return { ok: false, reason: "too_long" };
    if (files.length > LIMITS.maxFiles) return { ok: false, reason: "too_many_files" };
    const t = this._thread(conversationId);
    if (t.header?.canSend === false) return { ok: false, reason: "cannot_send" };

    const entry = {
      client_op_id: newId(),
      conversation_id: conversationId,
      body: text,
      files: files.map((f) => ({ id: f.id, name: f.name, mime: f.mime })),
      queued_at: this.now() + this.outbox.size / 1000,
      created_at: new Date(this.now()).toISOString(),
      state: "queued",
      attempts: 0,
      next_attempt_at: 0,
      error: null,
      error_code: null,
    };
    this.outbox.set(entry.client_op_id, entry);
    if (!t.hydrated) {
      t.hydrated = true;
      t.status = "ready";
    }
    this._publishThread(t);
    const persisted = this._store((db) => db.outbox.put(this._storable(entry))).then((ok) => {
      this._tabNote({ type: "outbox" });
      return ok;
    });
    // Offline: ask the browser for a one-off sync, so a message written on the train still goes out if the tab is
    // closed before the signal returns. The open page flushes it itself in any case.
    if (!this.isOnline()) persisted.then(() => this.backgroundSync?.());
    this.flush();
    return { ok: true, clientOpId: entry.client_op_id, persisted };
  }

  _storable(entry) {
    const { state, ...rest } = entry;
    return { ...rest, state: state === "sending" ? "queued" : state };
  }

  /** The member tapped "Retry" on a failed message. Same key, so a send that did land is not repeated. */
  retry(clientOpId) {
    const e = this.outbox.get(clientOpId);
    if (!e) return;
    e.state = "queued";
    e.attempts = 0;
    e.error = null;
    e.error_code = null;
    e.next_attempt_at = 0;
    this._afterEntryChange(e);
    this.flush();
  }

  /** The member chose to drop a message that could not be sent. */
  discard(clientOpId) {
    const e = this.outbox.get(clientOpId);
    if (!e) return;
    this.outbox.delete(clientOpId);
    this._store((db) => db.outbox.delete(clientOpId));
    const t = this.threads.get(e.conversation_id);
    if (t) this._publishThread(t);
    this._tabNote({ type: "outbox" });
  }

  _afterEntryChange(e) {
    this._store((db) => db.outbox.put(this._storable(e)));
    const t = this.threads.get(e.conversation_id);
    if (t) this._publishThread(t);
    this._tabNote({ type: "outbox" });
  }

  /** Deliver queued messages, oldest first. Re-entrant and tab-safe: one flusher at a time. */
  async flush() {
    if (this.disposed) return;
    if (this.flushing) {
      this.flushAgain = true;
      return;
    }
    this.flushing = true;
    try {
      const run = async () => {
        do {
          this.flushAgain = false;
          const due = [...this.outbox.values()]
            .filter((e) => e.state === "queued" && (e.next_attempt_at ?? 0) <= this.now())
            .sort((a, b) => a.queued_at - b.queued_at);
          for (const entry of due) {
            if (this.disposed || !this.isOnline() || this.connection.authLost) break;
            if (!this.outbox.has(entry.client_op_id)) continue; // reconciled while we waited
            await this._deliver(entry);
          }
        } while (this.flushAgain);
      };
      if (this.locks?.request) {
        // Another tab already delivering this account's outbox: let it. (If it dies, the entries are still queued
        // and the next trigger here picks them up. The idempotency key makes a rare double send harmless.)
        await this.locks.request(`unisphere-outbox:${this.userId}`, { ifAvailable: true }, async (lock) => {
          if (lock) await run();
        });
      } else await run();
    } finally {
      this.flushing = false;
      this._armRetry();
    }
  }

  async _deliver(entry) {
    entry.state = "sending";
    entry.attempts = (entry.attempts ?? 0) + 1;
    this._afterEntryChange(entry);
    this.metrics.requests += 1;
    const res = await this.api.send(entry.conversation_id, {
      body: entry.body,
      fileIds: (entry.files ?? []).map((f) => f.id),
      clientOpId: entry.client_op_id,
    });
    const current = this.outbox.get(entry.client_op_id);
    if (!current) return; // the realtime event got there first and already reconciled it

    if (res.ok) {
      this._ingest(res.data.message, "ack");
      return;
    }
    const action = classifyFailure(res);
    if (action === "auth") {
      entry.state = "queued";
      entry.attempts -= 1;
      this._publishConnection({ authLost: true });
    } else if (action === "retry") {
      if (!this.isOnline()) entry.attempts -= 1; // being offline is not the message's fault
      if (res.kind === "network") this.backgroundSync?.();
      if (entry.attempts >= LIMITS.maxAttempts) {
        entry.state = "failed";
        entry.error = "We could not reach UniSphere. Check your connection and tap retry.";
        entry.error_code = "gave_up";
      } else {
        entry.state = "queued";
        entry.next_attempt_at = this.now() + Math.max(res.retryAfterMs ?? 0, backoffMs(Math.max(1, entry.attempts), this.random));
      }
    } else {
      entry.state = "failed";
      entry.error = res.error;
      entry.error_code = res.code;
      if (res.code === "cannot_send") {
        const t = this.threads.get(entry.conversation_id);
        if (t?.header) t.header = { ...t.header, canSend: false };
      }
    }
    this._afterEntryChange(entry);
  }

  _armRetry() {
    clearTimeout(this.retryTimer);
    if (this.disposed) return;
    const queued = [...this.outbox.values()].filter((e) => e.state === "queued" && (e.next_attempt_at ?? 0) > 0);
    if (queued.length === 0) return;
    const at = Math.min(...queued.map((e) => e.next_attempt_at));
    this.retryTimer = setTimeout(() => this.flush(), Math.max(50, at - this.now()));
  }

  /** The session ended and the member signed in again (or the page regained a session). */
  resumeAfterAuth() {
    this._publishConnection({ authLost: false });
    this.flush();
    this.refreshInbox();
  }

  // ── Delete (own messages) ─────────────────────────────────────────────────

  async deleteMessage(convId, messageId) {
    const t = this.threads.get(convId);
    const before = t?.confirmed.get(messageId);
    if (!t || !before) return { ok: false };
    t.confirmed.set(messageId, { ...before, status: "deleted", body: "", attachments: [] });
    this._publishThread(t);
    const res = this.deleteMessageRequest ? await this.deleteMessageRequest(messageId) : { ok: true };
    if (!res.ok) {
      t.confirmed.set(messageId, before);
      this._publishThread(t);
      return res;
    }
    this._persistThread(t, [t.confirmed.get(messageId)]);
    return { ok: true };
  }

  // ── Drafts ────────────────────────────────────────────────────────────────

  getDraft(convId) {
    return this.drafts.get(convId) ?? "";
  }

  setDraft(convId, text) {
    if (text) this.drafts.set(convId, text);
    else this.drafts.delete(convId);
    clearTimeout(this.draftTimers.get(convId));
    this.draftTimers.set(
      convId,
      setTimeout(() => this.flushDraft(convId), 500),
    );
  }

  flushDraft(convId) {
    clearTimeout(this.draftTimers.get(convId));
    this.draftTimers.delete(convId);
    const body = this.drafts.get(convId);
    return this._store((db) => (body ? db.drafts.put({ conversation_id: convId, body, updated_at: this.now() }) : db.drafts.delete(convId)));
  }

  clearDraft(convId) {
    this.drafts.delete(convId);
    clearTimeout(this.draftTimers.get(convId));
    return this._store((db) => db.drafts.delete(convId));
  }

  // ── Other tabs ────────────────────────────────────────────────────────────

  _tabNote(note) {
    try {
      this.channel?.postMessage({ ...note, tab: this.tabId });
    } catch {
      /* channel closed */
    }
  }

  async _onTab(note) {
    if (!note || note.tab === this.tabId || this.disposed) return;
    if (note.type === "wipe") return this.wipeLocal();
    if (!this.db) return;
    try {
      if (note.type === "outbox") {
        const rows = await this.db.outbox.toArray();
        const ids = new Set(rows.map((r) => r.client_op_id));
        for (const r of rows) if (!this.outbox.has(r.client_op_id) || this.outbox.get(r.client_op_id).state !== "sending") this.outbox.set(r.client_op_id, { ...r });
        for (const id of [...this.outbox.keys()]) if (!ids.has(id) && this.outbox.get(id).state !== "sending") this.outbox.delete(id);
        for (const t of this.threads.values()) if (t.hydrated) this._publishThread(t);
      } else if (note.type === "thread") {
        const t = this.threads.get(note.id);
        if (t?.hydrated) {
          const rows = await this.db.messages.where("conversation_id").equals(note.id).toArray();
          if (this._upsert(t, rows)) this._publishThread(t);
        }
      }
    } catch {
      /* a closing database: nothing to sync */
    }
  }
}
