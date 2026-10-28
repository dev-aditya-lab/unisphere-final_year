import { beforeEach, describe, expect, it, vi } from "vitest";

// The instant push for a direct message, with a fake database and a fake push sender.
const CONV = "11111111-1111-4111-8111-111111111111";
const state = { targets: [], rpcError: null, pushed: [], pushResult: {}, updates: [], afterRuns: [], afterThrows: false };

vi.mock("next/server", () => ({
  after: (task) => {
    if (state.afterThrows) throw new Error("`after` was called outside a request scope");
    state.afterRuns.push(task);
  },
}));
vi.mock("@/lib/services/push", () => ({
  pushToUser: vi.fn(async (userId, payload) => {
    state.pushed.push({ userId, payload });
    const result = state.pushResult[userId];
    if (result instanceof Error) throw result;
    return result ?? { devices: 1, delivered: 1 };
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async (name, args) => (state.lastRpc = { name, args }, { data: state.rpcError ? null : state.targets, error: state.rpcError }),
    from: (table) => ({
      update: (patch) => {
        const filters = [];
        const q = { eq: (c, v) => (filters.push(["eq", c, v]), q), in: (c, v) => (filters.push(["in", c, v]), q), is: (c, v) => (filters.push(["is", c, v]), q) };
        q.then = (resolve) => (state.updates.push({ table, patch, filters }), resolve({ error: null }));
        return q;
      },
    }),
  }),
}));

const { messagePushPayload, pushNewMessage, schedulePushNewMessage } = await import("@/lib/services/message-push");

beforeEach(() => {
  Object.assign(state, { targets: [], rpcError: null, pushed: [], pushResult: {}, updates: [], afterRuns: [], afterThrows: false, lastRpc: null });
});

describe("what a message push says", () => {
  it("names the sender and the page, and carries the one tag that collapses a conversation", () => {
    expect(messagePushPayload({ conversationId: CONV, senderName: "Asha Rao", unread: 1 })).toEqual({
      title: "Asha Rao", body: "Sent you a message", url: `/messages/${CONV}`, tag: `message:${CONV}`, category: "messages", urgent: true,
    });
  });

  it("counts a backlog instead of listing it, and stops counting at 99", () => {
    expect(messagePushPayload({ conversationId: CONV, senderName: "Asha", unread: 3 }).body).toBe("3 new messages");
    expect(messagePushPayload({ conversationId: CONV, senderName: "Asha", unread: 250 }).body).toBe("99+ new messages");
    expect(messagePushPayload({ conversationId: CONV, senderName: "Asha", unread: 0 }).body).toBe("Sent you a message");
  });

  it("never has a place for the message text", () => {
    const payload = messagePushPayload({ conversationId: CONV, senderName: "Asha", unread: 1, body: "my password is hunter2" });
    expect(JSON.stringify(payload)).not.toContain("hunter2");
  });

  it("has a title even when the sender has no name, and keeps it short enough for a lock screen", () => {
    expect(messagePushPayload({ conversationId: CONV, senderName: null, unread: 1 }).title).toBe("New message");
    expect(messagePushPayload({ conversationId: CONV, senderName: "x".repeat(300), unread: 1 }).title).toHaveLength(80);
  });
});

describe("sending a message push", () => {
  it("asks the database who to tell, then tells each of them with their own unread count", async () => {
    state.targets = [
      { user_id: "u1", unread: 1, sender_name: "Asha" },
      { user_id: "u2", unread: 4, sender_name: "Asha" },
    ];
    const res = await pushNewMessage({ conversationId: CONV, senderId: "sender" });
    expect(state.lastRpc).toEqual({ name: "message_push_targets", args: { p_conversation: CONV, p_sender: "sender" } });
    expect(res).toEqual({ sent: 2 });
    expect(state.pushed.map((p) => [p.userId, p.payload.body])).toEqual([["u1", "Sent you a message"], ["u2", "4 new messages"]]);
  });

  it("marks the bell's notification as pushed for the people reached, so the worker does not send it again", async () => {
    state.targets = [{ user_id: "u1", unread: 1, sender_name: "Asha" }];
    await pushNewMessage({ conversationId: CONV, senderId: "sender" });
    expect(state.updates).toHaveLength(1);
    const { table, patch, filters } = state.updates[0];
    expect(table).toBe("notifications");
    expect(patch.pushed_at).toBeTruthy();
    expect(filters).toEqual([["eq", "type", "message"], ["eq", "entity_id", CONV], ["in", "user_id", ["u1"]], ["is", "pushed_at", null]]);
  });

  it("leaves the notification for the worker when the push did not reach a device", async () => {
    state.targets = [{ user_id: "u1", unread: 1, sender_name: "Asha" }, { user_id: "u2", unread: 1, sender_name: "Asha" }];
    state.pushResult.u1 = { devices: 1, delivered: 0 };
    const res = await pushNewMessage({ conversationId: CONV, senderId: "sender" });
    expect(res).toEqual({ sent: 1 });
    expect(state.updates[0].filters.find(([op]) => op === "in")[2]).toEqual(["u2"]);
  });

  it("does nothing when nobody should be told", async () => {
    expect(await pushNewMessage({ conversationId: CONV, senderId: "sender" })).toEqual({ sent: 0 });
    expect(state.pushed).toHaveLength(0);
    expect(state.updates).toHaveLength(0);
  });

  it("never throws into the request: a missing function or a failing sender is only logged", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    state.rpcError = { code: "PGRST202", message: "could not find the function" };
    expect(await pushNewMessage({ conversationId: CONV, senderId: "sender" })).toEqual({ sent: 0 });

    state.rpcError = null;
    state.targets = [{ user_id: "u1", unread: 1, sender_name: "Asha" }];
    state.pushResult.u1 = new Error("boom");
    expect(await pushNewMessage({ conversationId: CONV, senderId: "sender" })).toEqual({ sent: 0 });
    log.mockRestore();
  });
});

describe("scheduling it", () => {
  it("runs after the response has been sent", async () => {
    state.targets = [{ user_id: "u1", unread: 1, sender_name: "Asha" }];
    schedulePushNewMessage({ conversationId: CONV, senderId: "sender" });
    expect(state.pushed).toHaveLength(0); // nothing yet: the response goes first
    expect(state.afterRuns).toHaveLength(1);
    await state.afterRuns[0]();
    expect(state.pushed).toHaveLength(1);
  });

  it("starts straight away when there is no request to wait for (a script, a test)", async () => {
    state.afterThrows = true;
    state.targets = [{ user_id: "u1", unread: 1, sender_name: "Asha" }];
    expect(() => schedulePushNewMessage({ conversationId: CONV, senderId: "sender" })).not.toThrow();
    await vi.waitFor(() => expect(state.pushed).toHaveLength(1));
  });
});
