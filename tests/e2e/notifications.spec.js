import { test, expect } from "@playwright/test";
import { admin, createUser, grantRoleDirect } from "../helpers/supabase.js";
import { CURRENT_NOTICE } from "../../lib/privacy/registry.js";

/**
 * Notifications end to end, against the real site and the local database: the Push switch per kind, an administrator's broadcast, a
 * message reaching the recipient's phone the moment it is sent, and the server pushing by itself.
 *
 *   PUSH_LOOP_SECONDS=5 (set on the server) E2E_BASE_URL=http://localhost:3100 npx playwright test tests/e2e/notifications.spec.js
 *
 * The phone side needs FIREBASE_SERVICE_ACCOUNT on the server. The "phones" here have made-up tokens: Google refuses them, and the server
 * deletes a device Google refuses, so a device that disappears is proof the server tried to send. The tests that need it skip without it.
 */
const BASE = process.env.E2E_BASE_URL || "http://localhost:3100";
const PUSH_READY = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT);
const tag = Math.random().toString(36).slice(2, 8);
const token = (n) => `fcm-e2e-${tag}-${n}:APA91b${"z".repeat(60)}`;
const phone = (user, n) => admin.from("push_devices").insert({ user_id: user.id, platform: "android", token: token(n) });
const hasPhone = async (user) => ((await admin.from("push_devices").select("id").eq("user_id", user.id)).data ?? []).length > 0;

const users = {};
const sessions = {};

async function signIn(browser, user) {
  const context = await browser.newContext({ baseURL: BASE });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill("Passw0rd!test-xyz");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
  const state = await context.storageState();
  await context.close();
  return state;
}
const as = async (browser, who) => {
  const context = await browser.newContext({ baseURL: BASE, storageState: sessions[who] });
  return { context, page: await context.newPage() };
};

test.beforeAll(async ({ browser }) => {
  await admin.rpc("publish_privacy_notice", {
    p_version: CURRENT_NOTICE.version,
    p_effective_at: CURRENT_NOTICE.effectiveAt,
    p_hash: CURRENT_NOTICE.fingerprint,
    p_purposes: [],
    p_document: {},
    p_reconsent: CURRENT_NOTICE.reconsentPurposes,
    p_summary: CURRENT_NOTICE.summary,
  });
  for (const who of ["staff", "asha", "ravi", "meera"]) users[who] = await createUser(`ne-${who}`);
  await grantRoleDirect(users.staff.id, "global_admin");
  await admin.from("profiles").update({ allow_messages_from: "everyone" }).in("id", [users.asha.id, users.ravi.id, users.meera.id]);
  for (const who of ["staff", "asha", "ravi"]) sessions[who] = await signIn(browser, users[who]);
});

test.afterAll(async () => {
  await admin.from("push_devices").delete().like("token", `fcm-e2e-${tag}-%`);
  await admin.from("admin_broadcasts").delete().like("title", `E2E ${tag}%`);
});

test.describe("choosing what reaches you", () => {
  test("every kind has its own In app, Push and Email switch, and a Push choice is kept", async ({ browser }) => {
    const { context, page } = await as(browser, "asha");
    await page.goto("/settings/notifications");
    const push = page.getByRole("switch", { name: "Reactions, comments & mentions: push notification" });
    await expect(push).toBeChecked();
    for (const label of ["Messages", "Events", "Communities", "Official announcements", "Moderation & account"]) {
      await expect(page.getByRole("switch", { name: `${label}: push notification` })).toBeVisible();
    }
    // Offers & invitations are shown only in the app: no Push or Email switch, and the page says so.
    await expect(page.getByRole("switch", { name: /Offers & invitations: push/ })).toHaveCount(0);

    await push.click();
    await expect(push).not.toBeChecked();
    await page.getByRole("button", { name: "Save preferences" }).click();
    await expect(page.getByText("Notification preferences saved.").first()).toBeVisible();

    await page.reload();
    await expect(page.getByRole("switch", { name: "Reactions, comments & mentions: push notification" })).not.toBeChecked();
    await expect(page.getByRole("switch", { name: "Messages: push notification" })).toBeChecked(); // another kind is untouched
    const stored = await admin.from("notification_preferences").select("push, in_app").eq("user_id", users.asha.id).eq("category", "social").single();
    expect(stored.data).toEqual({ push: false, in_app: true });
    await context.close();
  });

  test("turning the bell off for a kind switches its Push off with it, since push needs the bell", async ({ browser }) => {
    const { context, page } = await as(browser, "asha");
    await page.goto("/settings/notifications");
    const bell = page.getByRole("switch", { name: "Events: in app" });
    const push = page.getByRole("switch", { name: "Events: push notification" });
    await expect(push).toBeEnabled();
    await bell.click();
    await expect(push).toBeDisabled();
    await expect(push).not.toBeChecked();
    await bell.click(); // leave it as found
    await context.close();
  });
});

test.describe("an administrator's broadcast", () => {
  test("a member cannot open the broadcast page", async ({ browser }) => {
    const { context, page } = await as(browser, "asha");
    const res = await page.goto("/admin/broadcast");
    await expect(page).not.toHaveURL(/\/admin\/broadcast$/);
    expect(res.status()).toBeLessThan(500);
    await context.close();
  });

  test("staff pick people, see how many it reaches, confirm, and the member finds it in the bell", async ({ browser }) => {
    const { context, page } = await as(browser, "staff");
    await page.goto("/admin/broadcast");
    await expect(page.getByRole("heading", { name: "Broadcast", exact: true })).toBeVisible();

    await expect(page.getByRole("button", { name: "Review and send" })).toBeDisabled(); // nothing chosen yet
    await page.getByLabel(/Specific people/).fill(`${users.asha.username}, ${users.ravi.username.toUpperCase()}`);
    await expect(page.getByRole("status").filter({ hasText: "2 people" })).toBeVisible();

    await page.getByLabel("Title").fill(`E2E ${tag} fest`);
    await page.getByLabel(/^Message/).fill("Doors open at 5 on Friday.");
    await page.getByLabel(/Where tapping it goes/).fill("/events");
    await expect(page.getByLabel("Preview")).toContainText(`Announcement: E2E ${tag} fest`);

    await page.getByRole("button", { name: "Review and send" }).click();
    const confirm = page.getByRole("alertdialog", { name: "Confirm sending" });
    await expect(confirm).toContainText("2 people");
    await expect(confirm).toContainText("It cannot be unsent");
    await confirm.getByRole("button", { name: "Yes, send it" }).click();
    await expect(page.getByText("Sent to 2 members.").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: `E2E ${tag} fest` })).toBeVisible(); // in "Sent so far"
    await context.close();

    const rows = await admin.from("notifications").select("user_id, type, category, data").eq("type", "announcement").like("dedupe_key", "bc:%").in("user_id", [users.asha.id, users.ravi.id]);
    expect(rows.data.filter((r) => r.data.title === `E2E ${tag} fest`)).toHaveLength(2);

    const member = await as(browser, "asha");
    await member.page.goto("/notifications");
    const item = member.page.getByText(`Announcement: E2E ${tag} fest`);
    await expect(item).toBeVisible();
    await item.click();
    await expect(member.page).toHaveURL(/\/events/);
    await member.context.close();
  });

  test("a message with a link that leaves the site is refused before anything is sent", async ({ browser }) => {
    const { context, page } = await as(browser, "staff");
    await page.goto("/admin/broadcast");
    await page.getByLabel(/Specific people/).fill(users.asha.username);
    await page.getByLabel("Title").fill(`E2E ${tag} bad link`);
    await page.getByLabel(/^Message/).fill("Click here");
    await page.getByLabel(/Where tapping it goes/).fill("https://evil.example");
    await expect(page.getByRole("status").filter({ hasText: "1 person" })).toBeVisible();
    await page.getByRole("button", { name: "Review and send" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Yes, send it" }).click();
    await expect(page.getByText(/Use a page on UniSphere/).first()).toBeVisible();
    expect((await admin.from("admin_broadcasts").select("id").eq("title", `E2E ${tag} bad link`)).data).toEqual([]);
    await context.close();
  });
});

test.describe("a message reaches the other person's phone at once", () => {
  test.skip(!PUSH_READY, "needs FIREBASE_SERVICE_ACCOUNT on the server");
  let browser0;
  test.beforeAll(({ browser }) => {
    browser0 = browser;
  });

  // Every test gets a member of its own: the server pushes whatever a member has waiting as soon as they have a device, so a notification
  // left over from another test would reach the next test's device and look like this test's push.
  const recipient = async (n) => {
    const user = await createUser(`ne-r${n}`);
    await admin.from("profiles").update({ allow_messages_from: "everyone" }).eq("id", user.id);
    const conv = (await users.asha.client.rpc("start_direct_conversation", { p_other: user.id })).data;
    expect(conv).toBeTruthy();
    await phone(user, 10 + n);
    return { user, conv };
  };
  const send = async (conv, body) => {
    const { context, page } = await as(browser0, "asha");
    const res = await page.request.post(`/api/messages/${conv}`, { data: { body, fileIds: [], clientOpId: crypto.randomUUID() }, headers: { Origin: BASE } });
    const [ok, text] = [res.ok(), await res.text()];
    await context.close();
    expect(ok, text).toBe(true);
  };
  // Google refuses the made-up token and the server deletes a device Google refuses, so the device disappearing means the server tried to send.
  const tried = (user, timeout = 12_000) => expect.poll(() => hasPhone(user), { timeout, intervals: [250] }).toBe(false);
  const quiet = async (user) => {
    await new Promise((r) => setTimeout(r, 6000));
    expect(await hasPhone(user), "the server sent although it should not have").toBe(true);
  };

  test("the recipient's device is sent to within seconds, not at the next background run", async () => {
    const { user, conv } = await recipient(1);
    const started = Date.now();
    await send(conv, "hello");
    // The background loop cannot be what did it: it leaves a message alone for its first 15 seconds.
    await tried(user);
    expect(Date.now() - started).toBeLessThan(13_000);
  });

  test("a muted conversation sends nothing, and the same phone is sent to as soon as it is unmuted", async () => {
    const { user, conv } = await recipient(2);
    await admin.from("conversation_members").update({ muted: true }).eq("conversation_id", conv).eq("user_id", user.id);
    await send(conv, "are you there?");
    await quiet(user);
    await admin.from("conversation_members").update({ muted: false }).eq("conversation_id", conv).eq("user_id", user.id);
    await send(conv, "now?");
    await tried(user); // the control: this phone really would have been sent to
  });

  test("a member who switched Messages push off gets nothing, and gets it again when they switch it on", async () => {
    const { user, conv } = await recipient(3);
    await admin.from("notification_preferences").upsert({ user_id: user.id, category: "messages", in_app: true, push: false, email: false }, { onConflict: "user_id,category" });
    await send(conv, "still there?");
    await quiet(user);
    await admin.from("notification_preferences").update({ push: true }).eq("user_id", user.id).eq("category", "messages");
    await send(conv, "and now?");
    await tried(user);
  });

  test("a member who blocked the sender gets nothing", async () => {
    const { user, conv } = await recipient(4);
    expect((await user.client.rpc("block_user", { p_target: users.asha.id })).error).toBeNull();
    const { context, page } = await as(browser0, "asha");
    const res = await page.request.post(`/api/messages/${conv}`, { data: { body: "hello?", fileIds: [], clientOpId: crypto.randomUUID() }, headers: { Origin: BASE } });
    await context.close();
    expect(res.ok()).toBe(false); // the conversation is closed to the sender
    await quiet(user);
  });

  test("a message to someone with no phone just works, and the sender is not kept waiting", async () => {
    const { user, conv } = await recipient(5);
    await admin.from("push_devices").delete().eq("user_id", user.id);
    const started = Date.now();
    await send(conv, "no phone for you");
    expect(Date.now() - started).toBeLessThan(5_000);
    expect((await admin.from("messages").select("id").eq("conversation_id", conv)).data).toHaveLength(1);
  });
});

test.describe("the server pushes by itself", () => {
  test.skip(!PUSH_READY, "needs FIREBASE_SERVICE_ACCOUNT on the server");

  test("a new notification is picked up within seconds, without anyone calling the background job", async () => {
    await phone(users.meera, 3);
    const { data: row } = await admin
      .from("notifications")
      .insert({ user_id: users.meera.id, type: "reaction", category: "social", data: { title: "Hello", slug: "hello" } })
      .select("id")
      .single();
    // PUSH_LOOP_SECONDS=5 on the test server; the default is 15.
    await expect
      .poll(async () => (await admin.from("notifications").select("pushed_at").eq("id", row.id).single()).data.pushed_at, { timeout: 40_000, intervals: [1000] })
      .not.toBeNull();
  });
});
