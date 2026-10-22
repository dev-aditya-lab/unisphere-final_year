import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { cleanupUsers, createUser, PASSWORD } from "../helpers/supabase.js";

/**
 * Session persistence. A returning member must stay signed in across a reload, a browser restart and an
 * installed-app relaunch, and an expired access token must be refreshed without anyone noticing.
 * These tests read and rewrite the real Supabase auth cookie, so they exercise the proxy exactly as a browser does.
 */

const AUTH_COOKIE = /^sb-.+-auth-token(\.\d+)?$/;

async function login(page, email) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/feed/, { timeout: 30_000 });
}

/** The session stored in the (possibly chunked) auth cookie, plus the cookie names that hold it. */
async function readSession(context) {
  const cookies = (await context.cookies()).filter((c) => AUTH_COOKIE.test(c.name));
  if (!cookies.length) return null;
  cookies.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const raw = cookies.map((c) => c.value).join("");
  const json = Buffer.from(raw.replace(/^base64-/, ""), "base64url").toString("utf8");
  return { session: JSON.parse(json), cookies };
}

/** Rewrites the stored session so the access token looks expired; the refresh token stays valid. */
async function expireAccessToken(context) {
  const stored = await readSession(context);
  const base = stored.cookies[0];
  const name = base.name.replace(/\.\d+$/, "");
  const next = { ...stored.session, expires_at: 1 };
  const value = `base64-${Buffer.from(JSON.stringify(next), "utf8").toString("base64url")}`;
  await context.clearCookies({ name: /^sb-.+-auth-token/ });
  await context.addCookies([{ name, value, domain: base.domain, path: "/", expires: base.expires, httpOnly: false, secure: false, sameSite: "Lax" }]);
  return stored.session.refresh_token;
}

test.describe.serial("a signed-in member stays signed in", () => {
  test.setTimeout(120_000);
  let u;
  test.beforeAll(async () => {
    u = await createUser("session-e2e");
  });
  test.afterAll(async () => {
    await cleanupUsers();
  });

  test("survives a reload and a browser restart; the cookie is persistent, not a session cookie", async ({ page, context, browser }) => {
    await login(page, u.email);
    await page.reload();
    await expect(page).toHaveURL(/\/feed/);

    const stored = await readSession(context);
    expect(stored).not.toBeNull();
    const longest = Math.min(...stored.cookies.map((c) => c.expires));
    expect(longest).toBeGreaterThan(Date.now() / 1000 + 30 * 24 * 3600); // weeks, not "until the tab closes"
    // The session never lives in localStorage.
    const leaked = await page.evaluate(() => Object.keys(localStorage).filter((k) => /auth-token|supabase|sb-/.test(k)));
    expect(leaked).toEqual([]);

    // "Closing the browser" keeps persistent cookies: a brand-new context built from them is still signed in.
    const state = await context.storageState();
    const restarted = await browser.newContext({ storageState: state });
    const again = await restarted.newPage();
    await again.goto("/feed");
    await expect(again).toHaveURL(/\/feed/);
    await expect(again.getByRole("navigation", { name: "Primary" }).first()).toBeVisible();
    // The installed app opens at its start_url and lands in the same signed-in state.
    await again.goto("/feed?source=pwa");
    await expect(again).toHaveURL(/\/feed/);
    await restarted.close();
  });

  test("an expired access token is refreshed transparently and the rotated token is stored", async ({ page, context }) => {
    await login(page, u.email);
    const before = await expireAccessToken(context);

    await page.goto("/feed");
    await expect(page).toHaveURL(/\/feed/);
    const after = (await readSession(context)).session;
    expect(after.refresh_token).not.toBe(before); // Supabase rotated it and the browser kept the new one
    expect(after.expires_at).toBeGreaterThan(Date.now() / 1000);

    // ...and the new token works for the next request (this is what broke when the rotated cookie was dropped).
    await page.goto("/settings/profile");
    await expect(page).toHaveURL(/\/settings\/profile/);
  });

  test("a refresh that happens on a redirect still reaches the browser", async ({ page, context }) => {
    await login(page, u.email);
    const before = await expireAccessToken(context);

    // /login bounces a signed-in member to the feed: the proxy answers with a redirect, not the page.
    const res = await context.request.get("/login", { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers().location).toContain("/feed");
    expect(res.headers()["set-cookie"] ?? "").toMatch(/sb-.+-auth-token/);

    const after = (await readSession(context)).session;
    expect(after.refresh_token).not.toBe(before);
    await page.goto("/feed");
    await expect(page).toHaveURL(/\/feed/);
  });

  test("explicit log out ends the session on this device", async ({ page, context }) => {
    await login(page, u.email);
    await page.getByRole("button", { name: "Open account menu" }).click();
    await page.getByRole("menuitem", { name: /Log out/ }).click();
    await expect(page).toHaveURL(/localhost:\d+\/?$/);
    expect(await readSession(context)).toBeNull();
    await page.goto("/feed");
    await expect(page).toHaveURL(/\/login/);
  });

  test("logging out on one device leaves the member signed in on their other devices", async ({ browser }) => {
    const laptop = await browser.newContext();
    const phone = await browser.newContext();
    const laptopPage = await laptop.newPage();
    const phonePage = await phone.newPage();
    await login(laptopPage, u.email);
    await login(phonePage, u.email);

    await laptopPage.getByRole("button", { name: "Open account menu" }).click();
    await laptopPage.getByRole("menuitem", { name: /Log out/ }).click();
    await expect(laptopPage).toHaveURL(/localhost:\d+\/?$/);

    // The phone's refresh token is untouched: expire its access token and it must refresh, not be sent to login.
    await expireAccessToken(phone);
    await phonePage.goto("/feed");
    await expect(phonePage).toHaveURL(/\/feed/);
    await laptop.close();
    await phone.close();
  });

  test("a session revoked elsewhere never causes a redirect loop: it ends cleanly once the access token expires", async ({ page, context }) => {
    await login(page, u.email);
    // Another device ends every session of this account. The access token in this browser is still valid for a while.
    const other = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    await other.auth.signInWithPassword({ email: u.email, password: PASSWORD });
    await other.auth.signOut({ scope: "global" });

    // Pages verify the signed token locally (fast), so this browser keeps working until the token runs out: no loop.
    await page.goto("/projects");
    await expect(page).toHaveURL(/\/projects/);

    // When the token needs refreshing, the revoked session is refused and the member is sent to log in. (Supabase lets
    // a just-revoked refresh token through for 10 seconds, to absorb races between tabs, so wait that out.)
    await page.waitForTimeout(11_000);
    await expireAccessToken(context);
    await page.goto("/projects");
    await expect(page).toHaveURL(/\/login\?next=%2Fprojects/);
    expect(await readSession(context)).toBeNull();
    await page.goto("/login");
    await expect(page).toHaveURL(/\/login/); // reachable: no bounce back into the app
  });
});
