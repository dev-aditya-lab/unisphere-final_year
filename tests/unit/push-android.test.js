import { beforeEach, describe, expect, it, vi } from "vitest";

// Push to the Android app, exercised with a fake database and a fake Firebase; nothing touches the network.
const state = { integrations: { push: false, fcm: true }, claimed: [], devices: {}, subs: {}, mine: [], results: {}, sent: [], calls: [] };

vi.mock("web-push", () => ({ default: { setVapidDetails: vi.fn(), sendNotification: vi.fn(async () => {}) } }));
vi.mock("@/lib/env", () => ({
  getEnv: () => ({ VAPID_SUBJECT: "mailto:t@example.test", NEXT_PUBLIC_VAPID_PUBLIC_KEY: "pub", VAPID_PRIVATE_KEY: "priv" }),
  getIntegrations: () => state.integrations,
}));
vi.mock("@/lib/services/fcm", () => ({
  sendFcm: vi.fn(async (token, payload) => {
    state.sent.push({ token, payload });
    return state.results[token] ?? { ok: true };
  }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));

/** A query that can be awaited as it is, or chained further (.order) like the real client. */
const rows = (data) => Object.assign(Promise.resolve({ data }), { order: async () => ({ data }) });
const deletion = (table, calls) => {
  const filters = [];
  const builder = {
    eq: (column, value) => (filters.push(["eq", column, value]), builder),
    in: (column, value) => (filters.push(["in", column, value]), builder),
    lt: (column, value) => (filters.push(["lt", column, value]), builder),
    then: (resolve, reject) => (calls.push({ table, op: "delete", filters }), Promise.resolve({ error: null }).then(resolve, reject)),
  };
  return builder;
};
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async () => ({ data: state.claimed, error: null }),
    from: (table) => ({
      select: () => ({ eq: (_column, userId) => rows(table === "push_devices" ? (userId === "me" && state.mine.length ? state.mine : (state.devices[userId] ?? [])) : (state.subs[userId] ?? [])) }),
      upsert: async (row, options) => (state.calls.push({ table, op: "upsert", row, options }), { error: null }),
      update: (patch) => ({ eq: async (_column, id) => void state.calls.push({ table, op: "update", patch, id }) }),
      delete: () => deletion(table, state.calls),
    }),
  }),
}));

const { processPushNotifications, saveDevice, removeDevice, sendTestPush } = await import("@/lib/services/push");

const TOKEN = "f3Gh-_9:APA91bHnqzXyKq0aYy2Jt8vVwq0tYy9a0r1Tt3Yp5cQ_x8LmN0pQ2";
const device = (id, over = {}) => ({ id, token: `${TOKEN}-${id}`, failure_count: 0, ...over });
const note = (over) => ({ id: crypto.randomUUID(), user_id: "u1", type: "reaction", category: "social", entity_id: crypto.randomUUID(), data: { title: "My post", slug: "my-post" }, actor_name: "Asha", ...over });
const deletes = (table = "push_devices") => state.calls.filter((c) => c.op === "delete" && c.table === table);
const updates = () => state.calls.filter((c) => c.op === "update");

beforeEach(() => {
  Object.assign(state, { integrations: { push: false, fcm: true }, claimed: [], devices: { u1: [device("d1"), device("d2")] }, subs: {}, mine: [], results: {}, sent: [], calls: [] });
});

describe("pushing to the Android app", () => {
  it("sends one message per phone with the notification text, its page and its category", async () => {
    state.claimed = [note({})];
    const res = await processPushNotifications();
    expect(res).toMatchObject({ claimed: 1, pushed: 2 });
    expect(state.sent.map((s) => s.token)).toEqual([`${TOKEN}-d1`, `${TOKEN}-d2`]);
    expect(state.sent[0].payload).toMatchObject({ title: "UniSphere", body: "Asha reacted to your post “My post”", url: "/posts/my-post", category: "social" });
  });

  it("never puts a message body on the lock screen", async () => {
    state.claimed = [note({ type: "message", category: "messages", data: { snippet: "my secret password is hunter2" }, entity_id: "c0c0c0c0-0000-4000-8000-000000000001" })];
    await processPushNotifications();
    expect(JSON.stringify(state.sent)).not.toContain("hunter2");
  });

  it("sends one summary for a burst, on the shared channel when every notification belongs to one", async () => {
    state.claimed = Array.from({ length: 4 }, () => note({ category: "messages", type: "message" }));
    await processPushNotifications();
    expect(state.sent).toHaveLength(2);
    expect(state.sent[0].payload).toMatchObject({ body: "You have 4 new notifications", url: "/notifications", category: "messages" });

    state.sent = [];
    state.claimed = [note({ category: "messages", type: "message" }), note(), note(), note()];
    await processPushNotifications();
    expect(state.sent[0].payload.category).toBe("updates");
  });

  it("does nothing, and says so, when neither Web Push nor the Firebase key is set up", async () => {
    state.integrations = { push: false, fcm: false };
    expect(await processPushNotifications()).toEqual({ skipped: "push not configured" });
    expect(state.sent).toHaveLength(0);
  });

  it("leaves the Android devices alone when only Web Push is set up", async () => {
    state.integrations = { push: true, fcm: false };
    state.claimed = [note({})];
    await processPushNotifications();
    expect(state.sent).toHaveLength(0);
  });

  it("deletes a phone Google says is gone, and records a delivery on the others", async () => {
    state.claimed = [note({})];
    state.results[`${TOKEN}-d1`] = { ok: false, reason: "gone" };
    const res = await processPushNotifications();
    expect(res.pushed).toBe(1);
    expect(deletes().some((d) => d.filters.some(([, column, value]) => column === "id" && value === "d1"))).toBe(true);
    expect(updates().some((u) => u.id === "d2" && u.patch.failure_count === 0 && u.patch.last_success_at)).toBe(true);
  });

  it("does not hold a device against its owner when Google is busy or our own setting is wrong", async () => {
    state.claimed = [note({})];
    state.results[`${TOKEN}-d1`] = { ok: false, reason: "retry" };
    state.results[`${TOKEN}-d2`] = { ok: false, reason: "config" };
    await processPushNotifications();
    expect(deletes()).toHaveLength(0);
    expect(updates()).toHaveLength(0);
  });

  it("counts a real failure and drops the phone after five in a row", async () => {
    state.devices = { u1: [device("d1", { failure_count: 1 }), device("d2", { failure_count: 4 })] };
    state.claimed = [note({})];
    state.results[`${TOKEN}-d1`] = { ok: false, reason: "failed" };
    state.results[`${TOKEN}-d2`] = { ok: false, reason: "failed" };
    await processPushNotifications();
    expect(updates().find((u) => u.id === "d1").patch).toEqual({ failure_count: 2 });
    expect(deletes().some((d) => d.filters.some(([, column, value]) => column === "id" && value === "d2"))).toBe(true);
  });

  it("drops phones that have not opened the app in 90 days, at most once an hour", async () => {
    // Only the clock is faked: the service remembers when it last purged, and earlier tests in this file already ran it.
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const purges = () => deletes().filter((d) => d.filters.some(([op, column]) => op === "lt" && column === "last_seen_at"));
      vi.setSystemTime(new Date(Date.now() + 5 * 3_600_000));
      await processPushNotifications();
      await processPushNotifications();
      expect(purges()).toHaveLength(1);
      const cutoff = new Date(purges()[0].filters[0][2]).getTime();
      expect(Date.now() - cutoff).toBeGreaterThan(89 * 86_400_000);
      expect(Date.now() - cutoff).toBeLessThan(91 * 86_400_000);

      vi.setSystemTime(new Date(Date.now() + 61 * 60_000));
      await processPushNotifications();
      expect(purges()).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("sends a test notification to the member's phones on the channel that pops up, like a real message", async () => {
    const res = await sendTestPush("u1");
    expect(res.ok).toBe(true);
    expect(state.sent[0].payload).toMatchObject({ url: "/settings/notifications", tag: "push-test", category: "messages", urgent: true });
  });

  it("says there is no phone yet, rather than succeeding, when the member has none", async () => {
    state.devices = {};
    const res = await sendTestPush("u1");
    expect(res.ok).toBe(false);
    expect(res.code).toBe("no_devices");
  });
});

describe("registering a phone", () => {
  it("stores the token for the signed-in member, taking it over from anyone who was signed in on that phone", async () => {
    const res = await saveDevice({ userId: "me", input: { token: TOKEN, platform: "android", appVersion: "2.6.0" } });
    expect(res.ok).toBe(true);
    const upsert = state.calls.find((c) => c.op === "upsert");
    expect(upsert.table).toBe("push_devices");
    expect(upsert.options).toEqual({ onConflict: "token" });
    expect(upsert.row).toMatchObject({ user_id: "me", platform: "android", token: TOKEN, app_version: "2.6.0", failure_count: 0 });
  });

  it("refuses a device that is not well formed, without touching the database", async () => {
    const res = await saveDevice({ userId: "me", input: { token: "short", platform: "android" } });
    expect(res.ok).toBe(false);
    expect(res.code).toBe("invalid");
    expect(state.calls).toHaveLength(0);
  });

  it("keeps at most ten phones per member, dropping the ones used longest ago", async () => {
    state.mine = Array.from({ length: 12 }, (_, i) => ({ id: `m${i}` }));
    await saveDevice({ userId: "me", input: { token: TOKEN, platform: "android" } });
    const removal = deletes().find((d) => d.filters.some(([op]) => op === "in"));
    expect(removal.filters.find(([op]) => op === "in")[2]).toEqual(["m10", "m11"]);
  });

  it("forgets a phone only for the member who asks", async () => {
    await removeDevice({ userId: "me", token: TOKEN });
    expect(deletes()[0].filters).toEqual([["eq", "token", TOKEN], ["eq", "user_id", "me"]]);
    expect((await removeDevice({ userId: "me", token: 42 })).ok).toBe(false);
  });
});
