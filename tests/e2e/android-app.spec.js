import { mkdirSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { admin, createUser } from "../helpers/supabase.js";
import { ANDROID_UA, installFakeAndroid } from "../helpers/fake-android.js";
import { CURRENT_NOTICE } from "../../lib/privacy/registry.js";

/**
 * The Android app, in a real browser against the real site and the local database. Only the phone is fake (tests/helpers/fake-android.js):
 * Capacitor's own bridge script runs in the page, so plugin calls take exactly the path they take in the app.
 *
 *   E2E_BASE_URL=http://localhost:3100 npx playwright test tests/e2e/android-app.spec.js
 *
 * Push needs FIREBASE_SERVICE_ACCOUNT on the server (otherwise the app says push is not set up, and those tests skip). Set
 * E2E_FCM_TOKEN to a real phone's token to also send a real notification through Google. E2E_SHOTS is where screenshots go.
 */
const BASE = process.env.E2E_BASE_URL || "http://localhost:3100";
const SHOTS = process.env.E2E_SHOTS || "test-results/android";
const PUSH_READY = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT);
mkdirSync(SHOTS, { recursive: true });

let user;
let session; // storageState of the signed-in member, so the login limiter is only used once

test.beforeAll(async ({ browser }) => {
  // A fresh database has no archived privacy notice yet (the site archives it the first time someone signs up), and without it the
  // test members cannot record their consent and every page sends them to the privacy review. Idempotent, like the site's own call.
  await admin.rpc("publish_privacy_notice", {
    p_version: CURRENT_NOTICE.version,
    p_effective_at: CURRENT_NOTICE.effectiveAt,
    p_hash: CURRENT_NOTICE.fingerprint,
    p_purposes: [],
    p_document: {},
    p_reconsent: CURRENT_NOTICE.reconsentPurposes,
    p_summary: CURRENT_NOTICE.summary,
  });
  user = await createUser("android-e2e");
  const context = await browser.newContext({ baseURL: BASE });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill("Passw0rd!test-xyz");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
  session = await context.storageState();
  await context.close();
});

test.afterAll(async () => {
  await admin.from("push_devices").delete().eq("user_id", user.id);
});

/** A page inside the app: the app's user agent, a phone-sized screen, the fake Android, and (unless asked otherwise) signed in. */
async function inApp(browser, { phone = {}, signedIn = true, colorScheme = "light" } = {}) {
  const context = await browser.newContext({
    baseURL: BASE,
    userAgent: ANDROID_UA,
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme,
    ...(signedIn ? { storageState: session } : {}),
  });
  const fake = await installFakeAndroid(context, { serverUrl: BASE, ...phone });
  const page = await context.newPage();
  return { context, page, fake };
}
// The status line under "Push notifications". The toast that says "Notifications are on for this phone." is a different element.
const onFor = (page) => page.locator('p[role="status"]', { hasText: "On for this phone." });
const devices = async () => (await admin.from("push_devices").select("id, platform, app_version").eq("user_id", user.id)).data;
const popup = (page) => page.getByRole("dialog").filter({ has: page.getByText(/Don't miss what matters|Notifications are off/) });
/** The pop-up waits for a quiet moment, so another dialog (a welcome message, say) is closed to let it through, as a member would. */
async function waitForPopup(page, timeout = 30_000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await popup(page).isVisible()) return popup(page);
    if (await page.getByRole("dialog").first().isVisible().catch(() => false)) await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  }
  throw new Error("the notifications pop-up never appeared");
}

test.describe("opening the app", () => {
  test("skips the landing page: the feed when signed in, the login page when not", async ({ browser }) => {
    const a = await inApp(browser);
    await a.page.goto("/");
    await expect(a.page).toHaveURL(/\/feed/);
    await a.context.close();

    const b = await inApp(browser, { signedIn: false });
    await b.page.goto("/");
    await expect(b.page).toHaveURL(/\/login/);
    await b.context.close();
  });

  test("a normal browser still gets the home page", async ({ browser }) => {
    const context = await browser.newContext({ baseURL: BASE });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page).toHaveURL(`${BASE}/`);
    await context.close();
  });

  test("the app knows it is the app: the real Capacitor bridge says so, and the status bar follows the theme", async ({ browser }) => {
    for (const [scheme, style] of [["light", "LIGHT"], ["dark", "DARK"]]) {
      const { context, page, fake } = await inApp(browser, { colorScheme: scheme });
      await page.goto("/feed");
      expect(await page.evaluate(() => window.Capacitor.isNativePlatform())).toBe(true);
      await expect.poll(async () => (await fake.calls(page)).filter((c) => c.id === "SystemBars.setStyle").at(-1)?.options?.style).toBe(style);
      await context.close();
    }
  });
});

test.describe("Settings > Notifications in the app", () => {
  test.skip(!PUSH_READY, "FIREBASE_SERVICE_ACCOUNT is not set on this server");

  test("shows the phone's own switch (never the browser's), and turning it on registers the phone", async ({ browser }) => {
    const { context, page, fake } = await inApp(browser);
    await page.goto("/settings/notifications");
    await expect(page.getByRole("heading", { name: "Notifications on this phone" })).toBeVisible();
    await expect(page.getByText("does not support push")).toHaveCount(0);
    // Not stuck on "Checking…": the phone answered.
    await expect(page.getByText("Get a notification for new messages")).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Turn on", exact: true }).click();
    await expect(onFor(page)).toBeVisible({ timeout: 15_000 });
    const ids = await fake.callIds(page);
    expect(ids).toEqual(expect.arrayContaining(["PushNotifications.requestPermissions", "PushNotifications.register"]));
    expect(ids.filter((id) => id === "PushNotifications.createChannel")).toHaveLength(3);

    const rows = await devices();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ platform: "android", app_version: "2.6.0" });
    await page.screenshot({ path: `${SHOTS}/settings-on.png` });

    // Turning it off forgets the phone on the server and discards the token on the phone.
    await page.getByRole("button", { name: "Turn off" }).click();
    await expect(page.getByText("Get a notification for new messages")).toBeVisible({ timeout: 10_000 });
    expect(await fake.callIds(page)).toContain("PushNotifications.unregister");
    expect(await devices()).toHaveLength(0);
    await context.close();
  });

  test("'Send a test' gives the member time to leave the app, then sends and says what happened", async ({ browser }) => {
    test.setTimeout(90_000);
    const { context, page } = await inApp(browser);
    await page.goto("/settings/notifications");
    await page.getByRole("button", { name: "Turn on", exact: true }).click();
    await expect(onFor(page)).toBeVisible({ timeout: 15_000 });
    await expect(onFor(page)).toContainText("press the Home button");

    const send = page.getByRole("button", { name: "Send a test" });
    await send.click();
    await expect(page.getByText("Press the Home button now. The test arrives in 8 seconds.")).toBeVisible();
    await expect(send).toBeDisabled(); // no second test while one is waiting
    // After the wait the server sends. With this test's made-up token Google says the phone is gone (or, offline, the send fails), so
    // the member is told it did not arrive: what matters here is that the outcome is always stated, never silence.
    const outcome = page.locator("[data-sonner-toast]").filter({ hasText: /Test sent|could not be delivered|not set up|No device/ });
    await expect(outcome.first()).toBeVisible({ timeout: 40_000 });
    await context.close();
  });

  test("when Android has blocked notifications, the screen says so and offers the phone's settings", async ({ browser }) => {
    const { context, page, fake } = await inApp(browser, { phone: { permission: "denied" } });
    await page.goto("/settings/notifications");
    await expect(page.getByText("Blocked in your phone's settings")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Open settings" }).click();
    const call = (await fake.calls(page)).find((c) => c.id === "NativeSettings.openAndroid");
    expect(call?.options).toEqual({ option: "app_notification" });
    await context.close();
  });

  test("signing out forgets the phone on the server, so the next person on it never gets these notifications", async ({ browser }) => {
    // Its own member: signing out revokes every session of that member, which would end the others' sign-in.
    const leaver = await createUser("android-e2e-out");
    const context = await browser.newContext({ baseURL: BASE, userAgent: ANDROID_UA, viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
    const fake = await installFakeAndroid(context, { serverUrl: BASE });
    const page = await context.newPage();
    try {
      await page.goto("/login");
      await page.getByLabel("Email").fill(leaver.email);
      await page.getByLabel("Password", { exact: true }).fill("Passw0rd!test-xyz");
      await page.getByRole("button", { name: "Log in" }).click();
      await expect(page).not.toHaveURL(/\/login/);
      await page.goto("/settings/notifications");
      await page.getByRole("button", { name: "Turn on", exact: true }).click();
      await expect(onFor(page)).toBeVisible({ timeout: 15_000 });
      const mine = async () => (await admin.from("push_devices").select("id").eq("user_id", leaver.id)).data;
      expect(await mine()).toHaveLength(1);

      await page.getByRole("button", { name: "Open account menu" }).click();
      await page.getByRole("menuitem", { name: "Log out" }).click();
      await expect(page).toHaveURL(/\/(login)?$/, { timeout: 20_000 });
      await expect.poll(mine, { timeout: 15_000 }).toHaveLength(0);
      expect(await page.evaluate(() => localStorage.getItem("unisphere:native-push"))).toBeNull();
      expect(await page.evaluate(() => localStorage.getItem("unisphere:fcm-token"))).toBeNull();
    } finally {
      await admin.from("push_devices").delete().eq("user_id", leaver.id);
      await context.close();
    }
  });

  test("a real notification reaches a real phone (only with E2E_FCM_TOKEN)", async ({ browser }) => {
    test.skip(!process.env.E2E_FCM_TOKEN, "set E2E_FCM_TOKEN to a real phone's token to send through Google");
    const { context, page } = await inApp(browser, { phone: { token: process.env.E2E_FCM_TOKEN } });
    await page.goto("/settings/notifications");
    await page.getByRole("button", { name: "Turn on", exact: true }).click();
    await expect(onFor(page)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Send a test" }).click();
    await expect(page.getByText("Test sent. With the app closed it shows in your notifications")).toBeVisible({ timeout: 30_000 });
    await context.close();
  });
});

test.describe("the turn-on pop-up", () => {
  test.skip(!PUSH_READY, "FIREBASE_SERVICE_ACCOUNT is not set on this server");

  test("comes by itself after the first sign-in, looks right in light and dark, and 'Not now' keeps it away for days", async ({ browser }) => {
    test.setTimeout(120_000);
    for (const scheme of ["light", "dark"]) {
      const { context, page } = await inApp(browser, { colorScheme: scheme });
      await page.goto("/feed");
      const dialog = await waitForPopup(page);
      await expect(dialog.getByText("Don't miss what matters")).toBeVisible();
      for (const text of ["New messages", "Replies and reactions", "Event reminders", "Message text never appears on your lock screen"]) await expect(dialog.getByText(text)).toBeVisible();
      await page.waitForTimeout(700); // the slide-in finishes
      await page.screenshot({ path: `${SHOTS}/popup-ask-${scheme}.png` });

      await dialog.getByRole("button", { name: "Not now" }).click();
      await expect(popup(page)).toHaveCount(0);
      expect(JSON.parse(await page.evaluate(() => localStorage.getItem("unisphere:native-push-nudge")))).toMatchObject({ count: 1, never: false });

      // A reload soon after does not bring it back: the next one is three days away.
      await page.reload();
      await page.waitForTimeout(8000);
      await expect(popup(page)).toHaveCount(0);
      await context.close();
    }
  });

  test("stays away from the notifications settings screen, where the switch is already in front of the member", async ({ browser }) => {
    const { context, page } = await inApp(browser);
    await page.goto("/settings/notifications");
    await expect(page.getByRole("heading", { name: "Notifications on this phone" })).toBeVisible();
    await page.waitForTimeout(9000); // well past the usual four seconds
    await expect(popup(page)).toHaveCount(0);
    await context.close();
  });

  test("'Turn on notifications' leads through Android's permission box to a registered phone", async ({ browser }) => {
    const { context, page, fake } = await inApp(browser);
    await page.goto("/feed");
    const dialog = await waitForPopup(page);
    await dialog.getByRole("button", { name: "Turn on notifications" }).click();
    await expect(page.getByText("Notifications are on for this phone.")).toBeVisible({ timeout: 15_000 });
    await expect(popup(page)).toHaveCount(0);
    expect(await fake.callIds(page)).toEqual(expect.arrayContaining(["PushNotifications.requestPermissions", "PushNotifications.register"]));
    expect(await devices()).toHaveLength(1);
    await admin.from("push_devices").delete().eq("user_id", user.id);
    await context.close();
  });

  test("a member who refuses is thanked, not nagged, and nothing is registered", async ({ browser }) => {
    const { context, page } = await inApp(browser, { phone: { askResult: "denied" } });
    await page.goto("/feed");
    const dialog = await waitForPopup(page);
    await dialog.getByRole("button", { name: "Turn on notifications" }).click();
    await expect(page.getByText("No problem. You can turn notifications on any time")).toBeVisible({ timeout: 15_000 });
    await expect(popup(page)).toHaveCount(0);
    expect(await devices()).toHaveLength(0);
    await context.close();
  });

  test("once Android has stopped asking, it explains the three taps, opens the phone's settings, and finishes by itself on return", async ({ browser }) => {
    test.setTimeout(120_000);
    const { context, page, fake } = await inApp(browser, { phone: { permission: "denied" } });
    await page.goto("/feed");
    const dialog = await waitForPopup(page);
    await expect(dialog.getByText("Notifications are off")).toBeVisible();
    for (const step of ["Tap Open settings below.", "Switch notifications on for UniSphere.", "Come back here. We finish the rest."]) await expect(dialog.getByText(step)).toBeVisible();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${SHOTS}/popup-settings-light.png` });

    await dialog.getByRole("button", { name: "Open settings" }).click();
    await expect(popup(page)).toHaveCount(0);
    expect((await fake.calls(page)).find((c) => c.id === "NativeSettings.openAndroid")?.options).toEqual({ option: "app_notification" });

    // The member switches notifications on in the phone's settings and comes back to the app.
    await fake.setPermission(page, "granted");
    await fake.fire(page, "App", "appStateChange", { isActive: true });
    await expect(page.getByText("Notifications are on for this phone.")).toBeVisible({ timeout: 15_000 });
    expect(await devices()).toHaveLength(1);
    await admin.from("push_devices").delete().eq("user_id", user.id);
    await context.close();
  });

  test("'Don't ask me again' ends it for good", async ({ browser }) => {
    const { context, page } = await inApp(browser);
    await page.goto("/feed");
    const dialog = await waitForPopup(page);
    await dialog.getByRole("button", { name: "Don't ask me again" }).click();
    await expect(page.getByText("OK, we won't ask again.")).toBeVisible();
    expect(JSON.parse(await page.evaluate(() => localStorage.getItem("unisphere:native-push-nudge")))).toMatchObject({ never: true });
    // Even three weeks later.
    await page.evaluate(() => {
      const h = JSON.parse(localStorage.getItem("unisphere:native-push-nudge"));
      localStorage.setItem("unisphere:native-push-nudge", JSON.stringify({ ...h, lastAt: Date.now() - 21 * 86_400_000 }));
    });
    await page.reload();
    await page.waitForTimeout(8000);
    await expect(popup(page)).toHaveCount(0);
    await context.close();
  });

  test("comes back after the wait, and stops after the fourth time", async ({ browser }) => {
    test.setTimeout(120_000);
    const { context, page } = await inApp(browser);
    await page.goto("/feed");
    await page.evaluate(() => localStorage.setItem("unisphere:native-push-nudge", JSON.stringify({ count: 1, lastAt: Date.now() - 4 * 86_400_000, never: false })));
    await page.reload();
    await waitForPopup(page); // 4 days after the first: the second is due
    await context.close();

    const late = await inApp(browser);
    await late.page.goto("/feed");
    await late.page.evaluate(() => localStorage.setItem("unisphere:native-push-nudge", JSON.stringify({ count: 4, lastAt: Date.now() - 365 * 86_400_000, never: false })));
    await late.page.reload();
    await late.page.waitForTimeout(8000);
    await expect(popup(late.page)).toHaveCount(0);
    await late.context.close();
  });
});

test.describe("what the phone can do to the page", () => {
  test.skip(!PUSH_READY, "FIREBASE_SERVICE_ACCOUNT is not set on this server");

  test("tapping a notification opens the page it is about, and only pages on this site", async ({ browser }) => {
    const { context, page, fake } = await inApp(browser);
    await page.goto("/feed");
    await expect.poll(async () => (await fake.callIds(page)).includes("PushNotifications.addListener")).toBe(true);
    await fake.fire(page, "PushNotifications", "pushNotificationActionPerformed", { notification: { data: { origin: "unisphere", url: "/notifications" } } });
    await expect(page).toHaveURL(/\/notifications/);

    await page.goto("/feed");
    await expect.poll(async () => (await fake.callIds(page)).includes("PushNotifications.addListener")).toBe(true);
    await fake.fire(page, "PushNotifications", "pushNotificationActionPerformed", { notification: { data: { origin: "unisphere", url: "https://evil.example/phish" } } });
    await expect(page).toHaveURL(/\/notifications/); // sent to our own notifications page, never away
    await context.close();
  });

  test("a push that arrives while the app is open shows as a banner (Android shows nothing by itself), and Open goes to its page", async ({ browser }) => {
    const { context, page, fake } = await inApp(browser);
    await page.goto("/settings");
    await expect.poll(async () => (await fake.callIds(page)).includes("PushNotifications.addListener")).toBe(true);
    await fake.fire(page, "PushNotifications", "pushNotificationReceived", { id: "1", title: "UniSphere", body: "Ravi sent you a message", data: { origin: "unisphere", url: "/notifications" } });
    const banner = page.locator("[data-sonner-toast]").filter({ hasText: "Ravi sent you a message" });
    await expect(banner).toBeVisible();
    await banner.getByRole("button", { name: "Open" }).click();
    await expect(page).toHaveURL(/\/notifications/);

    // Something UniSphere did not send is not shown.
    await fake.fire(page, "PushNotifications", "pushNotificationReceived", { id: "2", title: "Spam", body: "Win a prize", data: { url: "/feed" } });
    await page.waitForTimeout(600);
    await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Win a prize" })).toHaveCount(0);
    await context.close();
  });

  test("a push about the page the member is already on is not shown again (a new message in the open conversation)", async ({ browser }) => {
    const { context, page, fake } = await inApp(browser);
    await page.goto("/notifications");
    await expect.poll(async () => (await fake.callIds(page)).includes("PushNotifications.addListener")).toBe(true);
    const banner = (text) => page.locator("[data-sonner-toast]").filter({ hasText: text });

    await fake.fire(page, "PushNotifications", "pushNotificationReceived", { id: "1", title: "Asha", body: "Sent you a message", data: { origin: "unisphere", url: "/notifications" } });
    await page.waitForTimeout(800);
    await expect(banner("Sent you a message")).toHaveCount(0); // already here

    await fake.fire(page, "PushNotifications", "pushNotificationReceived", { id: "2", title: "Ravi", body: "Replied to your post", data: { origin: "unisphere", url: "/feed" } });
    await expect(banner("Replied to your post")).toBeVisible(); // somewhere else: shown
    await context.close();
  });

  test("the back button closes what is open, then goes back, and on a top-level screen leaves the app", async ({ browser }) => {
    const { context, page, fake } = await inApp(browser);
    await page.goto("/feed");
    await page.goto("/settings/notifications");
    await expect.poll(async () => (await fake.callIds(page)).includes("App.addListener")).toBe(true);
    await fake.fire(page, "App", "backButton", { canGoBack: true });
    await expect(page).toHaveURL(/\/feed/);

    // On a top-level screen the app goes to the background instead of walking back through history. (Going back loaded the feed afresh,
    // so wait for the new page to start listening, as the phone would only send the button once the app is running.)
    await expect.poll(async () => (await fake.callIds(page)).includes("App.addListener")).toBe(true);
    await fake.fire(page, "App", "backButton", { canGoBack: true });
    await expect.poll(async () => (await fake.callIds(page)).includes("App.minimizeApp")).toBe(true);
    await context.close();
  });

  test("the back button closes the pop-up first", async ({ browser }) => {
    const { context, page, fake } = await inApp(browser);
    await page.goto("/feed");
    await waitForPopup(page);
    await fake.fire(page, "App", "backButton", { canGoBack: true });
    await expect(popup(page)).toHaveCount(0);
    expect(await fake.callIds(page)).not.toContain("App.minimizeApp");
    await context.close();
  });

  test("a link the app was opened with lands on its page, once", async ({ browser }) => {
    const { context, page } = await inApp(browser, { phone: { launchUrl: `${BASE}/notifications` } });
    await page.goto("/feed");
    await expect(page).toHaveURL(/\/notifications/);
    await page.goto("/feed"); // a full reload later does not send the member back
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/\/feed/);
    await context.close();
  });

  test("a link to another site is never followed", async ({ browser }) => {
    const { context, page, fake } = await inApp(browser);
    await page.goto("/feed");
    await expect.poll(async () => (await fake.callIds(page)).includes("App.addListener")).toBe(true);
    await fake.fire(page, "App", "appUrlOpen", { url: "https://evil.example/notifications" });
    await page.waitForTimeout(800);
    await expect(page).toHaveURL(/\/feed/);
    await fake.fire(page, "App", "appUrlOpen", { url: `${BASE}/notifications` });
    await expect(page).toHaveURL(/\/notifications/);
    await context.close();
  });
});

test.describe("the blue tick in the app", () => {
  test("is not offered or priced: status only, and the pricing page has no price", async ({ browser }) => {
    const { context, page } = await inApp(browser);
    await page.goto("/settings/blue-tick");
    await expect(page.getByText("The blue tick is not managed in the UniSphere app")).toBeVisible();
    await expect(page.getByRole("button", { name: /Pay|Buy|Opening payment/ })).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("₹");
    await page.screenshot({ path: `${SHOTS}/blue-tick-app.png` });

    await page.goto("/pricing");
    await expect(page.getByRole("heading", { name: "The blue tick", exact: true })).toBeVisible();
    await expect(page.locator("main")).not.toContainText("₹");
    await expect(page.locator("main")).not.toContainText(/pay once|payment/i);
    await context.close();
  });

  test("is unchanged in a normal browser", async ({ browser }) => {
    const context = await browser.newContext({ baseURL: BASE, storageState: session });
    const page = await context.newPage();
    await page.goto("/pricing");
    await expect(page.getByRole("heading", { name: "The blue tick (optional)" })).toBeVisible();
    await page.goto("/settings/blue-tick");
    await expect(page.getByText("not managed in the UniSphere app")).toHaveCount(0);
    await context.close();
  });
});
