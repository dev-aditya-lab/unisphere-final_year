import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatEngine } from "@/lib/chat/engine";
import { createChatDb, dbNameFor } from "@/lib/chat/db";
import { LIMITS } from "@/lib/chat/model";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const CONV = "33333333-3333-4333-8333-333333333333";

let seq = 0;
const stamp = (n) => `2026-10-15T10:${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}.000000+00:00`;
const id = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
function msg(n, over = {}) {
  return { id: id(), conversation_id: CONV, sender_id: n % 2 ? ME : OTHER, body: `message ${n}`, status: "sent", created_at: stamp(n), edited_at: null, client_op_id: null, attachments: [], ...over };
}
const header = { id: CONV, last_message_at: stamp(10), last_message_preview: "x", muted: false, last_read_at: null, unread: 0, otherLastReadAt: null, person: { id: OTHER, full_name: "Other Person", username: "other", avatar_key: null, headline: null }, canSend: true };
const summary = { ...header, canSend: undefined };

const okRes = (data) => ({ ok: true, status: 200, data: { ok: true, ...data } });
const fail = (kind, extra = {}) => ({ ok: false, status: kind === "network" ? 0 : 400, kind, error: "nope", code: extra.code ?? null, retryAfterMs: extra.retryAfterMs ?? null });

function fakeApi(over = {}) {
  return {
    inbox: vi.fn(async () => okRes({ conversations: [summary] })),
    thread: vi.fn(async () => okRes({ conversation: header, items: [], hasMore: false })),
    send: vi.fn(async (conv, { body, clientOpId }) => okRes({ message: msg(99, { id: id(), body, client_op_id: clientOpId, sender_id: ME, conversation_id: conv }), replayed: false })),
    markRead: vi.fn(async () => okRes({})),
    ...over,
  };
}

function engineFor(userId, api, extra = {}) {
  return new ChatEngine({ userId, api, openDb: (u) => createChatDb(u), isOnline: () => true, random: () => 0.5, ...extra });
}

const settle = async () => {
  for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));
};

beforeEach(async () => {
  indexedDB.deleteDatabase(dbNameFor(ME));
  indexedDB.deleteDatabase(dbNameFor(OTHER));
  seq = 0;
});

describe("opening a conversation", () => {
  it("shows the cached messages before the network answers, then merges the newest page", async () => {
    const first = engineFor(ME, fakeApi({ thread: vi.fn(async () => okRes({ conversation: header, items: [msg(1), msg(2), msg(3)], hasMore: false })) }));
    await first.openThread(CONV);
    await settle();
    first.dispose();

    let release;
    const gate = new Promise((r) => (release = r));
    const slow = fakeApi({ thread: vi.fn(async () => (await gate, okRes({ conversation: header, items: [], hasMore: false }))) });
    const second = engineFor(ME, slow);
    const opening = second.openThread(CONV);
    await settle();
    // network still pending, cache already on screen
    expect(second.getThread(CONV).messages.map((m) => m.body)).toEqual(["message 1", "message 2", "message 3"]);
    expect(second.getThread(CONV).status).toBe("ready");
    release();
    await opening;
    second.dispose();
  });

  it("without a cache it asks the server once and renders what comes back", async () => {
    const api = fakeApi({ thread: vi.fn(async () => okRes({ conversation: header, items: [msg(1), msg(2)], hasMore: true })) });
    const e = engineFor(ME, api);
    await e.openThread(CONV);
    expect(api.thread).toHaveBeenCalledTimes(1);
    expect(e.getThread(CONV).messages).toHaveLength(2);
    expect(e.getThread(CONV).hasMoreOlder).toBe(true);
    e.dispose();
  });

  it("reports a conversation the server says is not ours as not found, and drops its cache", async () => {
    const e = engineFor(ME, fakeApi({ thread: vi.fn(async () => fail("notfound")) }));
    await e.openThread(CONV);
    expect(e.getThread(CONV).notFound).toBe(true);
    e.dispose();
  });

  it("keeps the cache and says it is offline when the network fails", async () => {
    const seed = engineFor(ME, fakeApi({ thread: vi.fn(async () => okRes({ conversation: header, items: [msg(1)], hasMore: false })) }));
    await seed.openThread(CONV);
    await settle();
    seed.dispose();
    const e = engineFor(ME, fakeApi({ thread: vi.fn(async () => fail("network")) }), { isOnline: () => false });
    await e.openThread(CONV);
    expect(e.getThread(CONV).messages).toHaveLength(1);
    expect(e.getThread(CONV).error).toBe("offline");
    expect(e.getThread(CONV).status).toBe("ready");
    e.dispose();
  });

  it("fills a gap between the cache and the newest page by cursor, without losing a message", async () => {
    const old = [msg(1), msg(2), msg(3)];
    const seed = engineFor(ME, fakeApi({ thread: vi.fn(async () => okRes({ conversation: header, items: old, hasMore: false })) }));
    await seed.openThread(CONV);
    await settle();
    seed.dispose();

    const missed = [msg(4), msg(5), msg(6)];
    const newest = [msg(7), msg(8)];
    const thread = vi.fn(async (_c, opts) => (opts.after ? okRes({ items: missed, hasMore: false }) : okRes({ conversation: header, items: newest, hasMore: true })));
    const e = engineFor(ME, fakeApi({ thread }));
    await e.openThread(CONV);
    expect(e.getThread(CONV).messages.map((m) => m.body)).toEqual(["message 1", "message 2", "message 3", "message 4", "message 5", "message 6", "message 7", "message 8"]);
    expect(thread).toHaveBeenCalledWith(CONV, expect.objectContaining({ after: expect.objectContaining({ id: old[2].id }) }));
    e.dispose();
  });
});

describe("sending", () => {
  it("shows the message at once, persists it, and reconciles with the server copy (one bubble)", async () => {
    const api = fakeApi();
    const e = engineFor(ME, api);
    await e.openThread(CONV);
    const sent = e.send(CONV, { body: "  hello  " });
    expect(sent.ok).toBe(true);
    // synchronously visible, trimmed, marked as sending
    const before = e.getThread(CONV).messages.at(-1);
    expect(before.body).toBe("hello");
    expect(before.send.state).toMatch(/queued|sending/);
    expect(await sent.persisted).toBe(true);
    await settle();
    const after = e.getThread(CONV).messages;
    expect(after.filter((m) => m.body === "hello")).toHaveLength(1);
    expect(after.at(-1).send).toBeUndefined();
    expect(after.at(-1).key).toBe(sent.clientOpId); // same React key: the bubble does not remount
    expect(api.send).toHaveBeenCalledTimes(1);
    expect(await e.db.outbox.count()).toBe(0);
    e.dispose();
  });

  it("does not duplicate when the realtime event arrives BEFORE the acknowledgement", async () => {
    let finish;
    const gate = new Promise((r) => (finish = r));
    let captured;
    const api = fakeApi({
      send: vi.fn(async (conv, { body, clientOpId }) => {
        captured = msg(50, { body, client_op_id: clientOpId, sender_id: ME, conversation_id: conv });
        await gate;
        return okRes({ message: captured, replayed: false });
      }),
    });
    const e = engineFor(ME, api);
    await e.openThread(CONV);
    e.send(CONV, { body: "race" });
    await settle();
    e._ingest(captured, "realtime"); // event first
    finish();
    await settle();
    expect(e.getThread(CONV).messages.filter((m) => m.body === "race")).toHaveLength(1);
    expect(e.outbox.size).toBe(0);
    e.dispose();
  });

  it("does not duplicate when the realtime event arrives AFTER the acknowledgement, or twice", async () => {
    const api = fakeApi();
    const e = engineFor(ME, api);
    await e.openThread(CONV);
    const { clientOpId } = e.send(CONV, { body: "late event" });
    await settle();
    const stored = e.getThread(CONV).messages.at(-1);
    const event = { ...stored, client_op_id: clientOpId };
    e._ingest(event, "realtime");
    e._ingest(event, "realtime");
    await settle();
    expect(e.getThread(CONV).messages.filter((m) => m.body === "late event")).toHaveLength(1);
    e.dispose();
  });

  it("retries a network failure with the SAME key, then succeeds without a second bubble", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      let calls = 0;
      const keys = [];
      const api = fakeApi({
        send: vi.fn(async (conv, { body, clientOpId }) => {
          keys.push(clientOpId);
          calls += 1;
          if (calls < 3) return fail("network");
          return okRes({ message: msg(60, { body, client_op_id: clientOpId, sender_id: ME, conversation_id: conv }), replayed: calls > 1 });
        }),
      });
      let clock = 1_000_000;
      const e = engineFor(ME, api, { now: () => clock });
      await vi.runAllTimersAsync();
      await e.openThread(CONV);
      e.send(CONV, { body: "flaky" });
      for (let i = 0; i < 4; i++) {
        await vi.advanceTimersByTimeAsync(0);
        clock += 40_000;
        await vi.advanceTimersByTimeAsync(40_000);
      }
      expect(api.send).toHaveBeenCalledTimes(3);
      expect(new Set(keys).size).toBe(1);
      expect(e.getThread(CONV).messages.filter((m) => m.body === "flaky")).toHaveLength(1);
      expect(e.getThread(CONV).messages.at(-1).send).toBeUndefined();
      e.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops after a permanent refusal and offers retry (no loop)", async () => {
    const api = fakeApi({ send: vi.fn(async () => fail("permanent", { code: "cannot_send" })) });
    const e = engineFor(ME, api);
    await e.openThread(CONV);
    e.send(CONV, { body: "blocked" });
    await settle();
    const last = e.getThread(CONV).messages.at(-1);
    expect(last.send.state).toBe("failed");
    expect(last.send.code).toBe("cannot_send");
    expect(api.send).toHaveBeenCalledTimes(1);
    await e.flush();
    expect(api.send).toHaveBeenCalledTimes(1); // failed messages wait for the member
    e.dispose();
  });

  it("gives up after a bounded number of attempts and keeps the text for the member", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      let clock = 5_000_000;
      const api = fakeApi({ send: vi.fn(async () => fail("transient")) });
      const e = engineFor(ME, api, { now: () => clock });
      await vi.runAllTimersAsync();
      await e.openThread(CONV);
      e.send(CONV, { body: "never lands" });
      for (let i = 0; i < 20; i++) {
        await vi.advanceTimersByTimeAsync(0);
        clock += 60_000;
        await vi.advanceTimersByTimeAsync(60_000);
      }
      expect(api.send).toHaveBeenCalledTimes(LIMITS.maxAttempts);
      const last = e.getThread(CONV).messages.at(-1);
      expect(last.body).toBe("never lands");
      expect(last.send.state).toBe("failed");
      e.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a message pending (and does not burn attempts) while offline, and sends on reconnect", async () => {
    let online = false;
    const api = fakeApi();
    const e = engineFor(ME, api, { isOnline: () => online });
    await e.openThread(CONV);
    e.send(CONV, { body: "from the train" });
    await settle();
    expect(api.send).not.toHaveBeenCalled();
    expect(e.getThread(CONV).messages.at(-1).send.state).toBe("queued");
    online = true;
    await e.flush();
    await settle();
    expect(api.send).toHaveBeenCalledTimes(1);
    expect(e.getThread(CONV).messages.at(-1).send).toBeUndefined();
    e.dispose();
  });

  it("survives a reload: the outbox is read back and delivered", async () => {
    let online = false;
    const first = engineFor(ME, fakeApi(), { isOnline: () => online });
    await first.openThread(CONV);
    const sent = first.send(CONV, { body: "before the crash" });
    await sent.persisted;
    first.dispose();

    const api = fakeApi();
    const second = engineFor(ME, api);
    await second.ready;
    await settle();
    expect(api.send).toHaveBeenCalledWith(CONV, expect.objectContaining({ body: "before the crash", clientOpId: sent.clientOpId }));
    second.dispose();
  });

  it("rejects empty and oversized input before anything is queued", () => {
    const e = engineFor(ME, fakeApi());
    expect(e.send(CONV, { body: "   " })).toEqual({ ok: false, reason: "empty" });
    expect(e.send(CONV, { body: "x".repeat(LIMITS.maxBody + 1) })).toEqual({ ok: false, reason: "too_long" });
    expect(e.outbox.size).toBe(0);
    e.dispose();
  });
});

describe("incoming messages and unread counts", () => {
  it("counts an incoming message once, even if the event is delivered twice", async () => {
    const e = engineFor(ME, fakeApi());
    e.seedInbox([{ ...summary, unread: 0 }]);
    const m = msg(20, { sender_id: OTHER, body: "ping" });
    e._ingest(m, "realtime");
    e._ingest(m, "realtime");
    expect(e.inboxItem(CONV).unread).toBe(1);
    expect(e.inboxItem(CONV).last_message_preview).toBe("ping");
    e.dispose();
  });

  it("does not count a message in the conversation that is open and visible, and marks it read", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const api = fakeApi();
      const e = engineFor(ME, api);
      await vi.runAllTimersAsync();
      await e.openThread(CONV);
      e.seedInbox([{ ...summary, unread: 0 }]);
      e._ingest(msg(4, { sender_id: OTHER, body: "while reading" }), "realtime");
      expect(e.inboxItem(CONV).unread).toBe(0);
      await vi.advanceTimersByTimeAsync(400);
      expect(api.markRead).toHaveBeenCalledWith(CONV);
      e.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("moves the conversation to the top and updates only its row", async () => {
    const e = engineFor(ME, fakeApi());
    const A = { ...summary, id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", last_message_at: stamp(30) };
    const B = { ...summary, id: CONV, last_message_at: stamp(10) };
    e.seedInbox([A, B]);
    e._ingest(msg(40, { sender_id: OTHER }), "realtime");
    expect(e.getInbox().items.map((c) => c.id)).toEqual([CONV, A.id]);
    e.dispose();
  });

  it("does not let a stale copy undelete a deleted message", async () => {
    const e = engineFor(ME, fakeApi());
    await e.openThread(CONV);
    const m = msg(5, { sender_id: OTHER });
    e._ingest(m, "realtime");
    e._ingest({ ...m, status: "deleted", body: "" }, "realtime");
    e._ingest(m, "realtime");
    expect(e.getThread(CONV).messages.find((x) => x.id === m.id).status).toBe("deleted");
    e.dispose();
  });
});

describe("privacy and resilience of the local store", () => {
  it("keeps each account in its own database", async () => {
    const a = engineFor(ME, fakeApi({ thread: vi.fn(async () => okRes({ conversation: header, items: [msg(1, { body: "private to A" })], hasMore: false })) }));
    await a.openThread(CONV);
    await settle();
    a.dispose();

    const b = engineFor(OTHER, fakeApi({ thread: vi.fn(async () => fail("notfound")) }));
    await b.openThread(CONV);
    expect(b.getThread(CONV).messages).toHaveLength(0);
    expect(b.db.name).toBe(dbNameFor(OTHER));
    b.dispose();
  });

  it("works in memory when storage is unavailable", async () => {
    const api = fakeApi();
    const e = engineFor(ME, api, { openDb: () => ({ open: () => Promise.reject(Object.assign(new Error("blocked"), { name: "SecurityError" })) }) });
    await e.openThread(CONV);
    expect(e.persistent).toBe(false);
    const sent = e.send(CONV, { body: "no disk" });
    expect(await sent.persisted).toBe(false);
    await settle();
    expect(api.send).toHaveBeenCalledTimes(1);
    expect(e.getThread(CONV).messages.at(-1).body).toBe("no disk");
    e.dispose();
  });

  it("bounds the stored messages per conversation", async () => {
    const many = Array.from({ length: LIMITS.cachePerConversation + 40 }, (_, i) => msg(i + 1));
    const e = engineFor(ME, fakeApi({ thread: vi.fn(async () => okRes({ conversation: header, items: many, hasMore: false })) }));
    await e.openThread(CONV);
    await settle();
    await e._trimCache();
    expect(await e.db.messages.where("conversation_id").equals(CONV).count()).toBeLessThanOrEqual(LIMITS.cachePerConversation);
    e.dispose();
  });

  it("restores a draft after a reload", async () => {
    const first = engineFor(ME, fakeApi());
    await first.ready;
    first.setDraft(CONV, "half a thought");
    await first.flushDraft(CONV);
    first.dispose();
    const second = engineFor(ME, fakeApi());
    await second.ready;
    expect(second.getDraft(CONV)).toBe("half a thought");
    second.dispose();
  });
});
