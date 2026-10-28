import { beforeEach, describe, expect, it, vi } from "vitest";
import { audienceForDatabase, audienceSchema, broadcastSchema, splitNames } from "@/lib/validators/broadcast";

const COLLEGE = "00000000-0000-4000-8000-000000000001";

// The database and the administrator's session are faked; the real permission and reach rules are tested against Postgres.
const state = { communities: [], calls: [], result: null };
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({ select: () => ({ in: () => ({ is: async () => ({ data: state.communities }) }) }) }),
  }),
}));
vi.mock("@/lib/services/admin", () => ({
  mutate: async (name, args) => {
    state.calls.push({ name, args });
    return state.result;
  },
}));

describe("choosing an audience", () => {
  it("needs at least one part, so an empty form never reaches everyone by accident", () => {
    expect(audienceSchema.safeParse({}).success).toBe(false);
    expect(audienceSchema.safeParse({ accountTypes: ["student"] }).success).toBe(false); // narrowing alone is not an audience
    expect(audienceSchema.safeParse({ everyone: true }).success).toBe(true);
    expect(audienceSchema.safeParse({ colleges: [COLLEGE] }).success).toBe(true);
    expect(audienceSchema.safeParse({ usernames: ["asha"] }).success).toBe(true);
    expect(audienceSchema.safeParse({ communities: ["robotics-club"] }).success).toBe(true);
  });

  it("refuses things that are not colleges, usernames, community addresses or account types", () => {
    expect(audienceSchema.safeParse({ colleges: ["all"] }).success).toBe(false);
    expect(audienceSchema.safeParse({ usernames: ["not a name!"] }).success).toBe(false);
    expect(audienceSchema.safeParse({ communities: ["Has Spaces"] }).success).toBe(false);
    expect(audienceSchema.safeParse({ everyone: true, accountTypes: ["admin"] }).success).toBe(false);
  });

  it("keeps each part within a size the database can handle", () => {
    expect(audienceSchema.safeParse({ usernames: Array.from({ length: 201 }, (_, i) => `user${i}`) }).success).toBe(false);
    expect(audienceSchema.safeParse({ communities: Array.from({ length: 21 }, (_, i) => `club-${i}`) }).success).toBe(false);
  });

  it("splits what an administrator types into names, without @ signs, capitals or repeats", () => {
    expect(splitNames("Asha, @rahul_k\nmeera;  asha")).toEqual(["asha", "rahul_k", "meera"]);
    expect(splitNames("")).toEqual([]);
    expect(splitNames(undefined)).toEqual([]);
  });

  it("writes the audience the way the database function reads it", () => {
    const audience = audienceSchema.parse({ colleges: [COLLEGE], usernames: ["asha"], accountTypes: ["alumni"] });
    expect(audienceForDatabase(audience, ["c1"])).toEqual({ colleges: [COLLEGE], communities: ["c1"], usernames: ["asha"], account_types: ["alumni"] });
    expect(audienceForDatabase(audienceSchema.parse({ everyone: true }), [])).toMatchObject({ everyone: true });
  });
});

describe("writing a broadcast", () => {
  const base = { title: "Fest this Friday", body: "Doors open at 5.", audience: { everyone: true } };

  it("accepts a plain message and defaults to push on, with no link", () => {
    expect(broadcastSchema.parse(base)).toMatchObject({ title: "Fest this Friday", href: "", push: true });
  });

  it("needs a title and a message, within the limits", () => {
    expect(broadcastSchema.safeParse({ ...base, title: "   " }).success).toBe(false);
    expect(broadcastSchema.safeParse({ ...base, body: "" }).success).toBe(false);
    expect(broadcastSchema.safeParse({ ...base, title: "x".repeat(101) }).success).toBe(false);
    expect(broadcastSchema.safeParse({ ...base, body: "x".repeat(2001) }).success).toBe(false);
  });

  it("only links to a page on this site", () => {
    for (const href of ["/events", "/posts/my-post#comments", "/"]) expect(broadcastSchema.safeParse({ ...base, href }).success, href).toBe(true);
    for (const href of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "events"]) {
      expect(broadcastSchema.safeParse({ ...base, href }).success, href).toBe(false);
    }
  });
});

describe("sending it", () => {
  let svc;
  beforeEach(async () => {
    Object.assign(state, { communities: [], calls: [], result: { ok: true, data: { id: "b1", targeted: 3, delivered: 3, count: 3, sample: ["asha"], global: true } } });
    svc = await import("@/lib/services/broadcast");
  });

  it("turns community addresses into ids before asking the database, and sends exactly what was written", async () => {
    state.communities = [{ id: "c1", slug: "robotics-club" }];
    const audience = audienceSchema.parse({ communities: ["robotics-club"], usernames: ["asha"] });
    const res = await svc.sendBroadcast({ title: "Hi", body: "There", href: "/events", push: false, audience });
    expect(res).toMatchObject({ ok: true, targeted: 3, delivered: 3 });
    expect(state.calls[0]).toEqual({
      name: "send_broadcast",
      args: { p_title: "Hi", p_body: "There", p_href: "/events", p_audience: { colleges: [], communities: ["c1"], usernames: ["asha"], account_types: [] }, p_push: false },
    });
  });

  it("stops, without sending, when a community address is not found", async () => {
    const audience = audienceSchema.parse({ communities: ["no-such-club"] });
    const res = await svc.sendBroadcast({ title: "Hi", body: "There", href: "", push: true, audience });
    expect(res).toMatchObject({ ok: false, code: "unknown_community" });
    expect(res.error).toContain("no-such-club");
    expect(state.calls).toHaveLength(0);
  });

  it("says how many turned this kind of notification off", async () => {
    state.result = { ok: true, data: { id: "b1", targeted: 10, delivered: 7 } };
    const res = await svc.sendBroadcast({ title: "Hi", body: "There", href: "", push: true, audience: audienceSchema.parse({ everyone: true }) });
    expect(res.message).toBe("Sent to 7 members (3 turned this kind of notification off).");
  });

  it("passes the database's refusal straight on", async () => {
    state.result = { ok: false, error: "You do not have permission to do that.", code: "forbidden" };
    const res = await svc.sendBroadcast({ title: "Hi", body: "There", href: "", push: true, audience: audienceSchema.parse({ everyone: true }) });
    expect(res).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("previews the reach without sending anything", async () => {
    const res = await svc.previewBroadcast({ audience: audienceSchema.parse({ usernames: ["asha"] }) });
    expect(res).toMatchObject({ ok: true, count: 3, sample: ["asha"], global: true });
    expect(state.calls.map((c) => c.name)).toEqual(["broadcast_preview"]);
  });
});
