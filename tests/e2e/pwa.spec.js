import { test, expect } from "@playwright/test";
import { admin, createUser, PASSWORD } from "../helpers/supabase.js";

async function login(page, email) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/feed/, { timeout: 30_000 });
}

const fakeSubscription = (id) => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/${id}`,
  keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" },
});

test.describe("installable app", () => {
  test("the manifest describes an installable app and every icon exists", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.status()).toBe(200);
    const m = await res.json();
    expect(m).toMatchObject({ short_name: "UniSphere", display: "standalone", scope: "/", lang: "en-IN" });
    expect(m.name).toContain("UniSphere");
    expect(m.start_url).toMatch(/^\/feed/);
    const sizes = m.icons.map((i) => `${i.sizes}:${i.purpose}`);
    expect(sizes).toEqual(expect.arrayContaining(["192x192:any", "512x512:any", "512x512:maskable"]));
    for (const icon of m.icons) {
      const r = await request.get(icon.src);
      expect(r.status(), icon.src).toBe(200);
      expect(r.headers()["content-type"]).toContain("image/png");
    }
    expect(m.shortcuts.length).toBeGreaterThan(0);
  });

  test("the service worker is served fresh, from the root scope", async ({ request }) => {
    const res = await request.get("/sw.js");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("javascript");
    expect(res.headers()["cache-control"]).toContain("no-cache");
    expect(res.headers()["service-worker-allowed"]).toBe("/");
    const body = await res.text();
    expect(body).toContain("push");
    expect(body).toContain("notificationclick");
  });

  test("offline, a page that cannot load shows a friendly offline screen instead of a browser error", async ({ browser }) => {
    const context = await browser.newContext({ serviceWorkers: "allow" });
    const page = await context.newPage();
    await page.goto("/about");
    await page.evaluate(async () => {
      await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
    });
    await page.reload(); // now controlled by the worker
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

    await context.setOffline(true);
    await page.goto("/features").catch(() => {});
    await expect(page.getByRole("heading", { name: "You are offline" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
    await context.setOffline(false);
    await page.goto("/features");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await context.close();
  });
});

test.describe.serial("signed-in app and push", () => {
  let user;
  test.beforeAll(async () => {
    user = await createUser("pwa-user");
  });
  test.afterAll(async () => {
    await admin.from("push_subscriptions").delete().eq("user_id", user.id);
  });

  test("a member sees an install nudge, can dismiss it, and it stays dismissed", async ({ page }) => {
    await login(page, user.email);
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => {
      const e = new Event("beforeinstallprompt", { cancelable: true });
      e.prompt = () => {};
      e.userChoice = Promise.resolve({ outcome: "dismissed" });
      window.dispatchEvent(e);
    });
    const banner = page.getByRole("region", { name: "Install UniSphere" });
    await expect(banner).toBeVisible();
    await banner.getByRole("button", { name: "Not now" }).click();
    await expect(banner).toBeHidden();
    await page.reload();
    await page.evaluate(() => {
      const e = new Event("beforeinstallprompt", { cancelable: true });
      e.prompt = () => {};
      e.userChoice = Promise.resolve({ outcome: "dismissed" });
      window.dispatchEvent(e);
    });
    await expect(page.getByRole("region", { name: "Install UniSphere" })).toBeHidden();
  });

  test("notification settings explain push honestly: blocked by default in headless, controls once allowed", async ({ page, browser }) => {
    await login(page, user.email);
    await page.goto("/settings/notifications");
    await expect(page.getByRole("heading", { name: "UniSphere on this device" })).toBeVisible();
    await expect(page.getByText("Blocked in your browser settings for this site.")).toBeVisible();

    // Headless Chromium reports "denied"; simulate a normal browser that has not been asked yet.
    const allowed = await browser.newContext();
    const page2 = await allowed.newPage();
    await page2.addInitScript(() => Object.defineProperty(Notification, "permission", { get: () => "default" }));
    await login(page2, user.email);
    await page2.goto("/settings/notifications");
    await expect(page2.getByText("Push notifications", { exact: true })).toBeVisible();
    await expect(page2.getByRole("button", { name: "Turn on" })).toBeVisible();
    await allowed.close();
  });

  test("the subscribe endpoint validates, authenticates and refuses other origins", async ({ page, request, baseURL }) => {
    const anon = await request.post("/api/push/subscribe", { data: { subscription: fakeSubscription("anon") } });
    expect(anon.status()).toBe(401);

    await login(page, user.email);
    const post = (data, headers = {}) => page.request.post("/api/push/subscribe", { data, headers });
    expect((await post({ subscription: { endpoint: "http://insecure.test/x", keys: { p256dh: "a", auth: "b" } } })).status()).toBe(400);
    // The server later POSTs to the stored address, so anything that is not a real browser push service is refused (SSRF).
    for (const endpoint of ["https://169.254.169.254/latest/meta-data/", "https://localhost:3000/api/health", "https://fcm.googleapis.com.evil.example/x"]) {
      expect((await post({ subscription: { endpoint, keys: { p256dh: "a", auth: "b" } } })).status()).toBe(400);
    }
    expect((await post({ subscription: fakeSubscription("evil") }, { Origin: "https://evil.example" })).status()).toBe(403);

    const ok = await post({ subscription: fakeSubscription("device-1") }, { Origin: baseURL });
    expect(ok.status()).toBe(200);
    expect((await admin.from("push_subscriptions").select("user_id").eq("endpoint", fakeSubscription("device-1").endpoint).single()).data.user_id).toBe(user.id);

    // the same browser profile later used by someone else: the endpoint moves, it is never duplicated
    const other = await createUser("pwa-other");
    const page2 = await page.context().browser().newPage();
    await login(page2, other.email);
    expect((await page2.request.post("/api/push/subscribe", { data: { subscription: fakeSubscription("device-1") } })).status()).toBe(200);
    const { data: rows } = await admin.from("push_subscriptions").select("user_id").eq("endpoint", fakeSubscription("device-1").endpoint);
    expect(rows).toEqual([{ user_id: other.id }]);
    await page2.close();

    const del = await page.request.delete("/api/push/subscribe", { data: { endpoint: fakeSubscription("device-1").endpoint } });
    expect(del.status()).toBe(200); // not theirs any more, so nothing is removed
    expect((await admin.from("push_subscriptions").select("id").eq("endpoint", fakeSubscription("device-1").endpoint)).data).toHaveLength(1);
    await admin.from("push_subscriptions").delete().eq("user_id", other.id);
  });

  test("the worker claims new notifications for subscribed members, once", async ({ request }) => {
    await admin.from("push_subscriptions").insert({ user_id: user.id, endpoint: fakeSubscription("device-2").endpoint, p256dh: "k", auth: "a" });
    const { data: n } = await admin.from("notifications").insert({ user_id: user.id, type: "follow", category: "social", data: {} }).select("id").single();
    expect((await admin.from("notifications").select("pushed_at").eq("id", n.id).single()).data.pushed_at).toBeNull();

    const headers = { Authorization: `Bearer ${process.env.CRON_SECRET}` };
    const first = await (await request.post("/api/cron/tick", { headers })).json();
    expect(first.push.claimed).toBeGreaterThanOrEqual(1);
    expect((await admin.from("notifications").select("pushed_at").eq("id", n.id).single()).data.pushed_at).not.toBeNull();
    const second = await (await request.post("/api/cron/tick", { headers })).json();
    expect(second.push.claimed).toBe(0); // never pushed twice
  });
});
