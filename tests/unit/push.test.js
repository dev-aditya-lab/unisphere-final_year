import { beforeEach, describe, expect, it, vi } from "vitest";

// The push sender is exercised with a fake push service and a fake database; nothing touches the network.
const state = { claimed: [], subs: {}, sent: [], failWith: null, deleted: [], updates: [] };

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(async (sub, body) => {
      if (state.failWith) throw Object.assign(new Error("push service error"), { statusCode: state.failWith });
      state.sent.push({ endpoint: sub.endpoint, payload: JSON.parse(body) });
    }),
  },
}));
vi.mock("@/lib/env", () => ({
  getEnv: () => ({ VAPID_SUBJECT: "mailto:t@example.test", NEXT_PUBLIC_VAPID_PUBLIC_KEY: "pub", VAPID_PRIVATE_KEY: "priv" }),
  getIntegrations: () => ({ push: true }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async () => ({ data: state.claimed, error: null }),
    from: () => ({
      select: () => ({ eq: async (_c, userId) => ({ data: state.subs[userId] ?? [] }) }),
      update: (patch) => ({ eq: async (_c, id) => void state.updates.push({ id, patch }) }),
      delete: () => ({ eq: async (_c, id) => void state.deleted.push(id) }),
    }),
  }),
}));

const { processPushNotifications, parseSubscription } = await import("@/lib/services/push");

const sub = (id, userId) => ({ id, endpoint: `https://fcm.googleapis.com/fcm/send/${id}`, p256dh: "k", auth: "a", failure_count: 0, userId });
const note = (over) => ({ id: crypto.randomUUID(), user_id: "u1", type: "reaction", category: "social", entity_id: crypto.randomUUID(), data: { title: "My post", slug: "my-post" }, actor_name: "Asha", ...over });

beforeEach(() => {
  Object.assign(state, { claimed: [], subs: { u1: [sub("s1"), sub("s2")] }, sent: [], failWith: null, deleted: [], updates: [] });
});

describe("parseSubscription", () => {
  it("accepts only well-formed https push subscriptions", () => {
    expect(parseSubscription({ endpoint: "https://fcm.googleapis.com/x", keys: { p256dh: "a", auth: "b" } })).toEqual({ endpoint: "https://fcm.googleapis.com/x", p256dh: "a", auth: "b" });
    expect(parseSubscription({ endpoint: "http://insecure.test/x", keys: { p256dh: "a", auth: "b" } })).toBeNull();
    expect(parseSubscription({ endpoint: "https://ok.test/x", keys: { p256dh: "a" } })).toBeNull();
    expect(parseSubscription({ endpoint: "https://ok.test/" + "x".repeat(1300), keys: { p256dh: "a", auth: "b" } })).toBeNull();
    expect(parseSubscription(null)).toBeNull();
  });
});

describe("processPushNotifications", () => {
  it("sends one push per device with a readable lock-screen text and a link", async () => {
    state.claimed = [note({})];
    const res = await processPushNotifications();
    expect(res).toMatchObject({ claimed: 1, pushed: 2 });
    expect(state.sent).toHaveLength(2);
    expect(state.sent[0].payload).toMatchObject({ title: "UniSphere", body: "Asha reacted to your post “My post”", url: "/posts/my-post" });
  });

  it("never puts a message body on the lock screen", async () => {
    state.claimed = [note({ type: "message", data: { snippet: "my secret password is hunter2" }, entity_id: "c0c0c0c0-0000-4000-8000-000000000001" })];
    await processPushNotifications();
    const text = JSON.stringify(state.sent);
    expect(text).toContain("Asha sent you a message");
    expect(text).not.toContain("hunter2");
  });

  it("collapses a burst into one summary push", async () => {
    state.claimed = [note({}), note({}), note({}), note({})];
    const res = await processPushNotifications();
    expect(res.pushed).toBe(2); // one summary x two devices
    expect(state.sent.every((s) => s.payload.body === "You have 4 new notifications" && s.payload.url === "/notifications")).toBe(true);
  });

  it("removes devices the push service says are gone, and keeps counting other failures", async () => {
    state.claimed = [note({})];
    state.failWith = 410;
    await processPushNotifications();
    expect(state.deleted.sort()).toEqual(["s1", "s2"]);

    state.deleted = [];
    state.failWith = 503;
    state.claimed = [note({})];
    await processPushNotifications();
    expect(state.deleted).toEqual([]);
    expect(state.updates.filter((u) => u.patch.failure_count === 1)).toHaveLength(2);
  });

  it("never calls an address that is not a browser push service, and drops the stored row (SSRF)", async () => {
    state.subs = { u1: [{ ...sub("bad"), endpoint: "https://169.254.169.254/latest/meta-data/" }, sub("good")] };
    state.claimed = [note({})];
    const res = await processPushNotifications();
    expect(res.pushed).toBe(1);
    expect(state.sent.map((s) => s.endpoint ?? s.subscription?.endpoint)).not.toContain("https://169.254.169.254/latest/meta-data/");
    expect(state.deleted).toContain("bad");
  });

  it("does nothing when nothing is waiting", async () => {
    expect(await processPushNotifications()).toMatchObject({ claimed: 0, pushed: 0 });
    expect(state.sent).toEqual([]);
  });
});
