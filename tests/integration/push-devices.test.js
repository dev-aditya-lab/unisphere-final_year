import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, anon, cleanupUsers, createUser } from "../helpers/supabase.js";

/** Android app push devices (migration 0061): who can see them, that the token never reaches a client, and what the worker claims. */
let alice, bob, carol;
const tag = Math.random().toString(36).slice(2, 8);
const token = (n) => `fcm-${tag}-${n}:APA91b${"x".repeat(60)}`;
const note = (user, over = {}) => ({ user_id: user.id, type: "reaction", category: "social", data: {}, ...over });

beforeAll(async () => {
  alice = await createUser("pd-alice");
  bob = await createUser("pd-bob");
  carol = await createUser("pd-carol");
});
afterAll(async () => {
  await admin.from("push_devices").delete().like("token", `fcm-${tag}-%`);
  await cleanupUsers();
});

describe("who can see a registered phone", () => {
  beforeAll(async () => {
    const { error } = await admin.from("push_devices").insert([
      { user_id: alice.id, platform: "android", token: token(1), app_version: "2.6.0" },
      { user_id: bob.id, platform: "android", token: token(2) },
    ]);
    expect(error).toBeNull();
  });

  it("shows a member their own phones and nobody else's", async () => {
    const mine = await alice.client.from("push_devices").select("id, user_id, platform, app_version, created_at, last_seen_at");
    expect(mine.error).toBeNull();
    expect(mine.data).toHaveLength(1);
    expect(mine.data[0]).toMatchObject({ user_id: alice.id, platform: "android", app_version: "2.6.0" });
    expect((await carol.client.from("push_devices").select("id")).data).toEqual([]);
    expect((await anon().from("push_devices").select("id")).data ?? []).toEqual([]);
  });

  it("never lets a client read the token, not even its own", async () => {
    for (const column of ["token", "failure_count"]) {
      const res = await alice.client.from("push_devices").select(column);
      expect(res.error?.message ?? "", column).toMatch(/permission denied/i);
      expect(res.data).toBeNull();
    }
    expect((await alice.client.from("push_devices").select("*")).error).not.toBeNull(); // "*" includes the token
    // Filtering on it would also leak whether a token exists, so that is refused too.
    expect((await alice.client.from("push_devices").select("id").eq("token", token(1))).error).not.toBeNull();
  });

  it("refuses to let a client register or change a phone: that goes through the server", async () => {
    const insert = await alice.client.from("push_devices").insert({ user_id: alice.id, platform: "android", token: token(3) });
    expect(insert.error).not.toBeNull();
    const update = await alice.client.from("push_devices").update({ user_id: bob.id }).eq("user_id", alice.id);
    expect(update.error).not.toBeNull();
    expect((await admin.from("push_devices").select("id").eq("token", token(3))).data).toEqual([]);
  });

  it("lets a member remove their own phone, and only theirs", async () => {
    const other = await bob.client.from("push_devices").delete().eq("user_id", alice.id);
    expect(other.error).toBeNull(); // no error, but it matches nothing: RLS hides the row
    expect((await admin.from("push_devices").select("id").eq("token", token(1))).data).toHaveLength(1);

    const own = await alice.client.from("push_devices").delete().eq("user_id", alice.id);
    expect(own.error).toBeNull();
    expect((await admin.from("push_devices").select("id").eq("token", token(1))).data).toEqual([]);
  });

  it("stores each token once, so a phone that changes hands moves to the new member", async () => {
    const dup = await admin.from("push_devices").insert({ user_id: carol.id, platform: "android", token: token(2) });
    expect(dup.error?.code).toBe("23505"); // unique(token): the server upserts on it
    const moved = await admin.from("push_devices").upsert({ user_id: carol.id, platform: "android", token: token(2), failure_count: 0 }, { onConflict: "token" });
    expect(moved.error).toBeNull();
    expect((await admin.from("push_devices").select("user_id").eq("token", token(2))).data).toEqual([{ user_id: carol.id }]);
  });

  it("only accepts a plausible token and a platform the server can send to", async () => {
    const short = await admin.from("push_devices").insert({ user_id: bob.id, platform: "android", token: "short" });
    expect(short.error).not.toBeNull();
    const ios = await admin.from("push_devices").insert({ user_id: bob.id, platform: "ios", token: token(9) });
    expect(ios.error).not.toBeNull();
  });
});

describe("what the worker claims", () => {
  const claimFor = async (user) => (await admin.rpc("claim_push_notifications", { p_limit: 500 })).data.filter((r) => r.user_id === user.id);

  it("claims a notification for a member whose only device is an Android phone, once, with its category", async () => {
    const dev = await createUser("pd-android-only");
    await admin.from("push_devices").insert({ user_id: dev.id, platform: "android", token: token(20) });
    const { data: inserted, error } = await admin.from("notifications").insert(note(dev, { category: "messages", type: "message" })).select("id").single();
    expect(error).toBeNull();

    const first = await claimFor(dev);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ id: inserted.id, category: "messages", type: "message" });
    expect(await claimFor(dev)).toHaveLength(0); // never twice
    const { data: row } = await admin.from("notifications").select("pushed_at").eq("id", inserted.id).single();
    expect(row.pushed_at).not.toBeNull();
  });

  it("still claims for a member with a Web Push subscription and no phone", async () => {
    const web = await createUser("pd-web-only");
    await admin.from("push_subscriptions").insert({ user_id: web.id, endpoint: `https://push.invalid/${tag}`, p256dh: "k", auth: "a" });
    await admin.from("notifications").insert(note(web));
    expect(await claimFor(web)).toHaveLength(1);
  });

  it("leaves members with no device alone, but marks nothing for them either until they have one", async () => {
    const none = await createUser("pd-none");
    await admin.from("notifications").insert(note(none));
    expect(await claimFor(none)).toHaveLength(0);
    const { data: row } = await admin.from("notifications").select("pushed_at").eq("user_id", none.id).single();
    expect(row.pushed_at).toBeNull(); // so the bell shows it, and push still sends it if they turn push on within two hours
  });

  it("skips what is already read, and anything older than two hours", async () => {
    const dev = await createUser("pd-filters");
    await admin.from("push_devices").insert({ user_id: dev.id, platform: "android", token: token(21) });
    await admin.from("notifications").insert([
      note(dev, { read_at: new Date().toISOString(), dedupe_key: "read" }),
      note(dev, { created_at: new Date(Date.now() - 3 * 3_600_000).toISOString(), dedupe_key: "old" }),
    ]);
    expect(await claimFor(dev)).toHaveLength(0);
  });

  it("can be called only by the server", async () => {
    expect((await alice.client.rpc("claim_push_notifications", { p_limit: 5 })).error).not.toBeNull();
    expect((await anon().rpc("claim_push_notifications", { p_limit: 5 })).error).not.toBeNull();
  });
});

describe("erasing an account", () => {
  it("removes the member's phones with the account", async () => {
    const leaver = await createUser("pd-leaver");
    await admin.from("push_devices").insert({ user_id: leaver.id, platform: "android", token: token(30) });
    expect((await admin.from("push_devices").select("id").eq("user_id", leaver.id)).data).toHaveLength(1);
    const { error } = await admin.auth.admin.deleteUser(leaver.id);
    expect(error).toBeNull();
    expect((await admin.from("push_devices").select("id").eq("token", token(30))).data).toEqual([]);
  });
});
