import { beforeEach, describe, expect, it, vi } from "vitest";

// sendMessage tells the recipient's phone once per new message, never for a replay, and never lets that get in the way of the send.
const state = { rpc: null, scheduled: [] };

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: async () => state.rpc }) }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: async () => null }));
vi.mock("@/lib/services/message-push", () => ({ schedulePushNewMessage: (args) => state.scheduled.push(args) }));

const { sendMessage } = await import("@/lib/services/messages");
const stored = { id: "m1", conversation_id: "c1", sender_id: "me", body: "hi", status: "sent", created_at: "2026-10-28T10:00:00Z" };

beforeEach(() => {
  state.scheduled = [];
});

describe("sendMessage and the instant push", () => {
  it("schedules the push for a new message, with the conversation and the sender", async () => {
    state.rpc = { data: { message: stored, replayed: false }, error: null };
    const res = await sendMessage({ user: { id: "me" }, conversationId: "c1", body: "hi", clientOpId: "op1" });
    expect(res.ok).toBe(true);
    expect(state.scheduled).toEqual([{ conversationId: "c1", senderId: "me" }]);
  });

  it("does not push again for a replay of the same send", async () => {
    state.rpc = { data: { message: stored, replayed: true }, error: null };
    const res = await sendMessage({ user: { id: "me" }, conversationId: "c1", body: "hi", clientOpId: "op1" });
    expect(res.ok).toBe(true);
    expect(res.replayed).toBe(true);
    expect(state.scheduled).toEqual([]);
  });

  it("does not push for a message that was refused", async () => {
    state.rpc = { data: null, error: { message: "cannot_send" } };
    const res = await sendMessage({ user: { id: "me" }, conversationId: "c1", body: "hi", clientOpId: "op1" });
    expect(res.ok).toBe(false);
    expect(state.scheduled).toEqual([]);
  });
});
