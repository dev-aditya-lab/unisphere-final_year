import { beforeEach, describe, expect, it, vi } from "vitest";

const env = { CRON_SECRET: "c".repeat(48) };
const executeAccountDeletion = vi.fn(async () => ({ ok: true }));
vi.mock("@/lib/env", () => ({ getEnv: () => env }));
vi.mock("@/lib/ai/embeddings/jobs", () => ({ processEmbeddingJobs: async () => ({}) }));
vi.mock("@/lib/services/notification-email", () => ({ processNotificationEmails: async () => ({}) }));
vi.mock("@/lib/services/push", () => ({ processPushNotifications: async () => ({}) }));
vi.mock("@/lib/services/maintenance", () => ({ runMaintenanceTasks: async () => ({}) }));
vi.mock("@/lib/services/orbit-question-automation", () => ({ draftNextDailyQuestion: async () => ({}), publishDueDailyQuestion: async () => ({}) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ auth: { admin: { getUserById: async () => ({ data: { user: { id: "x" } } }) } } }) }));
vi.mock("@/lib/services/account-deletion", () => ({ executeAccountDeletion: (...a) => executeAccountDeletion(...a) }));

const tick = await import("@/app/api/cron/tick/route");
const replay = await import("@/app/api/cron/erasure-replay/route");
const url = (p) => `http://localhost${p}`;
const entry = { entries: [{ user_ref: "7f9c2c1e-3b0a-4e44-9d0e-1a2b3c4d5e6f" }] };

beforeEach(() => {
  env.CRON_SECRET = "c".repeat(48);
  executeAccountDeletion.mockClear();
});

describe("/api/cron/tick", () => {
  it("refuses callers without the secret", async () => {
    for (const req of [
      new Request(url("/api/cron/tick")),
      new Request(url("/api/cron/tick"), { headers: { authorization: "Bearer wrong" } }),
      new Request(url("/api/cron/tick?secret=wrong")),
      new Request(url("/api/cron/tick"), { headers: { authorization: `Bearer ${"c".repeat(47)}` } }),
      new Request(url("/api/cron/tick"), { headers: { authorization: `Bearer ${"c".repeat(49)}` } }),
    ]) {
      expect((await tick.GET(req)).status).toBe(401);
    }
  });

  it("accepts the secret as a Bearer header or, for monitors that cannot send headers, in the query", async () => {
    expect((await tick.GET(new Request(url("/api/cron/tick"), { headers: { authorization: `Bearer ${env.CRON_SECRET}` } }))).status).toBe(200);
    expect((await tick.POST(new Request(url(`/api/cron/tick?secret=${env.CRON_SECRET}`), { method: "POST" }))).status).toBe(200);
  });

  it("is closed when no secret is configured, even to an empty one", async () => {
    env.CRON_SECRET = undefined;
    expect((await tick.GET(new Request(url("/api/cron/tick?secret=")))).status).toBe(401);
    expect((await tick.GET(new Request(url("/api/cron/tick"), { headers: { authorization: "Bearer " } }))).status).toBe(401);
  });
});

describe("/api/cron/erasure-replay (deletes accounts)", () => {
  const post = (headers = {}, query = "", data = entry) => replay.POST(new Request(url(`/api/cron/erasure-replay${query}`), { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(data) }));

  it("accepts the Authorization header only: never the query string", async () => {
    expect((await post({}, `?secret=${env.CRON_SECRET}`)).status).toBe(401);
    expect((await post({ authorization: "Bearer nope" })).status).toBe(401);
    expect(executeAccountDeletion).not.toHaveBeenCalled();
    expect((await post({ authorization: `Bearer ${env.CRON_SECRET}` })).status).toBe(200);
    expect(executeAccountDeletion).toHaveBeenCalledTimes(1);
  });

  it("bounds and validates the batch", async () => {
    const auth = { authorization: `Bearer ${env.CRON_SECRET}` };
    expect((await post(auth, "", { entries: [] })).status).toBe(400);
    expect((await post(auth, "", { entries: Array.from({ length: 26 }, () => entry.entries[0]) })).status).toBe(400);
    expect((await post(auth, "", { entries: [{ user_ref: "not-a-uuid" }] })).status).toBe(400);
    expect(executeAccountDeletion).not.toHaveBeenCalled();
  });
});
