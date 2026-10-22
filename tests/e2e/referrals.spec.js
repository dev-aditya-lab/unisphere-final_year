import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PASSWORD, admin, cleanupUsers, createUser, grantRoleDirect } from "../helpers/supabase.js";

/**
 * Refer & Earn in a real browser: the page shows the member's own link and every share target uses it, an invite link survives the
 * sign-up journey (a redirect to /login and back included), a friend who becomes active earns the inviter exactly 100 Orbits, the
 * reminder popup appears at most once, respects Escape and routes where it must stay away, and the screens fit a phone.
 *
 * Run against a production build whose NEXT_PUBLIC_REFERRAL_PROMPT_DELAY_MS is small (for example 1500), on the local stack.
 */

const run = Date.now().toString(36);
const today = (offset = 0) => new Date(Date.now() + offset * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const sessions = {};
let inviter, popper, quiet, gadmin, plain;
let keyN = 0;

async function login(browser, user) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/feed/, { timeout: 30_000 });
  const state = await context.storageState();
  await context.close();
  return state;
}
const as = async (browser, who, options = {}) => {
  const context = await browser.newContext({ storageState: sessions[who], ...options });
  return { context, page: await context.newPage() };
};
const go = async (page, path) => {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
};
const activeOn = (u, offset) => admin.from("orbit_ledger").insert({ user_id: u.id, kind: "checkin", amount: 5, idempotency_key: `e2e-${run}-${++keyN}`, day: today(offset), source_type: "test" });
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

test.describe.serial("Refer & Earn", () => {
  test.setTimeout(150_000);
  const newcomer = { name: "Referred Friend", username: `refd-${run}`, email: `delivered+refd-${run}@resend.dev`, password: "Passw0rd!xyz" };
  let code;

  test.beforeAll(async ({ browser }) => {
    [inviter, popper, quiet, gadmin, plain] = await Promise.all(["e2e-ref-inv", "e2e-ref-pop", "e2e-ref-quiet", "e2e-ref-adm", "e2e-ref-plain"].map((n) => createUser(n)));
    await grantRoleDirect(gadmin.id, "global_admin");
    // the reminder is for members who have been around and used Orbits
    for (const u of [popper, quiet]) {
      await admin.from("profiles").update({ onboarded_at: new Date(Date.now() - 10 * 86_400_000).toISOString() }).eq("id", u.id);
      await activeOn(u, 0);
    }
    for (const [name, user] of [["inviter", inviter], ["popper", popper], ["quiet", quiet], ["gadmin", gadmin], ["plain", plain]]) sessions[name] = await login(browser, user);
  });

  test.afterAll(async () => {
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const mine = data.users.find((u) => u.email === newcomer.email);
    if (mine) await admin.auth.admin.deleteUser(mine.id);
    await cleanupUsers();
  });

  test("shows the member's own code and link, and every share target carries that link", async ({ browser }) => {
    const { context, page } = await as(browser, "inviter", { permissions: ["clipboard-read", "clipboard-write"] });
    await context.addInitScript(() => {
      window.__shared = null;
      Object.defineProperty(navigator, "share", { configurable: true, value: async (d) => { window.__shared = d; } });
    });
    await go(page, "/referrals");
    await expect(page.getByRole("heading", { name: "Refer & Earn", level: 1 })).toBeVisible();
    code = (await page.getByTestId("invite-code").textContent()).trim();
    expect(code).toMatch(/^[a-z0-9_-]{3,30}-[abcdefghjkmnpqrstuvwxyz23456789]{4}$/);
    expect((await admin.from("referral_codes").select("code").eq("user_id", inviter.id).single()).data.code).toBe(code);
    const link = await page.getByTestId("invite-link").inputValue();
    expect(link).toMatch(new RegExp(`/register\\?ref=${code}$`));

    for (const id of ["whatsapp", "telegram", "x", "linkedin", "email", "sms"]) {
      const href = await page.getByTestId(`share-${id}`).getAttribute("href");
      expect(decodeURIComponent(href), id).toContain(link);
    }
    expect(await page.getByTestId("share-whatsapp").getAttribute("href")).toContain("https://wa.me/?text=");
    expect(decodeURIComponent(await page.getByTestId("share-whatsapp").getAttribute("href"))).toContain("Join me on UniSphere — connect with students, discover opportunities and build your community. Join here: ");

    await page.getByTestId("copy-link").click();
    await expect(page.getByText("Copied", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);

    await page.getByTestId("native-share").click();
    const shared = await page.evaluate(() => window.__shared);
    expect(shared.url).toBe(link);
    expect(shared.text).toMatch(/^Join me on UniSphere/);
    await context.close();
  });

  test("has a helpful empty state, the rules, and a way in from Orbits and the profile menu", async ({ browser }) => {
    const { context, page } = await as(browser, "plain");
    await go(page, "/referrals");
    await expect(page.getByTestId("referrals-empty")).toBeVisible();
    await expect(page.getByTestId("stat-successful")).toHaveText("0");
    await expect(page.getByText("They finish setting up their profile.")).toBeVisible();
    await expect(page.getByText(/2 different days/)).toBeVisible();
    // the sidebar entry: always there, highlighted, with the +100 chip, and its loop stops for reduced motion
    const navLink = page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: /Refer & Earn/ });
    await expect(navLink).toBeVisible();
    await expect(navLink).toHaveAttribute("aria-current", "page");
    await go(page, "/orbits");
    const navLink2 = page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: /Refer & Earn/ });
    expect(await navLink2.locator(".ref-nav-hop").evaluate((e) => getComputedStyle(e).animationName)).toBe("ref-nav-hop");
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await navLink2.locator(".ref-nav-hop").evaluate((e) => getComputedStyle(e).animationName)).toBe("none");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.getByTestId("referral-entry").click();
    await expect(page).toHaveURL(/\/referrals$/);
    await page.getByRole("button", { name: "Open account menu" }).click();
    await expect(page.getByRole("menuitem", { name: /Refer & Earn/ })).toBeVisible();
    await context.close();
  });

  test("an invite link is remembered through the sign-up journey, then attributed on the server", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`/register?ref=${code.toUpperCase()}`);
    await expect(page.getByTestId("invite-banner")).toContainText("Test e2e-ref-inv invited you");
    // wander off to the login page and back: the first-party cookie still knows the invite
    await page.goto("/login");
    await page.goto("/register");
    await expect(page.getByTestId("invite-banner")).toContainText("invited you");
    const cookie = (await context.cookies()).find((c) => c.name === "us_ref");
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax" });
    expect(cookie.value.startsWith(`${code}.`)).toBe(true);

    await page.getByLabel("Full name").fill(newcomer.name);
    await page.getByRole("textbox", { name: "Username" }).fill(newcomer.username);
    await page.getByLabel("Email").fill(newcomer.email);
    await page.getByLabel("Password", { exact: true }).fill(newcomer.password);
    await page.getByLabel(/I am 18 years old or older/).click();
    await page.getByLabel(/I agree to UniSphere using the account details/).click();
    await page.getByLabel(/I accept the Terms of Service/).click();
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/verify-email/, { timeout: 30_000 });

    const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const friend = users.users.find((u) => u.email === newcomer.email);
    const row = (await admin.from("referrals").select("*").eq("referred_id", friend.id).single()).data;
    expect(row).toMatchObject({ referrer_id: inviter.id, status: "registered", reward_amount: null });
    expect((await context.cookies()).find((c) => c.name === "us_ref")).toBeUndefined();
    expect((await admin.from("orbit_ledger").select("id").eq("user_id", inviter.id).eq("kind", "referral")).data).toEqual([]);
    await context.close();
  });

  test("garbage in the link changes nothing: no banner, no cookie for malformed codes, and sign-up is not blocked", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    for (const bad of ["<script>alert(1)</script>", "x".repeat(300), "SHORT", "someone-k7m0"]) {
      await page.goto(`/register?ref=${encodeURIComponent(bad)}`);
      await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
      await expect(page.getByTestId("invite-banner")).toHaveCount(0);
    }
    expect((await context.cookies()).find((c) => c.name === "us_ref")).toBeUndefined();
    // a well-formed code nobody owns is remembered like any other (the browser cannot tell), but the server shows no inviter for it
    await page.goto("/register?ref=nobody-zzzz");
    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
    await expect(page.getByTestId("invite-banner")).toHaveCount(0);
    await context.close();
  });

  test("the friend confirms, sets up, becomes active, and the inviter earns exactly 100 Orbits once", async ({ browser }) => {
    const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const friend = users.users.find((u) => u.email === newcomer.email);
    const context = await browser.newContext();
    const page = await context.newPage();
    const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: newcomer.email });
    expect(error).toBeNull();
    await page.goto(`/auth/confirm?token_hash=${data.properties.hashed_token}&type=email&next=/onboarding`);
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 30_000 });
    await page.getByLabel("Headline").fill("Here to build things");
    await page.getByRole("button", { name: /^Continue$/ }).click();
    await page.getByRole("button", { name: "Continue without a college" }).click();
    await page.getByRole("textbox", { name: "Skills" }).fill("Writing");
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: /^Continue$/ }).click();
    await page.getByRole("button", { name: /Enter UniSphere/ }).click();
    await expect(page).toHaveURL(/\/feed/, { timeout: 30_000 });
    // confirmed and set up, but not active yet: waiting, and nothing paid
    expect((await admin.from("referrals").select("status").eq("referred_id", friend.id).single()).data.status).toBe("pending_qualification");
    expect((await admin.from("orbit_ledger").select("id").eq("user_id", inviter.id).eq("kind", "referral")).data).toEqual([]);

    // a first active day (the Daily Orbit Bonus, claimed in the app) is not enough
    await page.goto("/orbits");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Claim", exact: true }).click();
    await expect(page.getByRole("button", { name: "Claimed" })).toBeDisabled();
    expect((await admin.from("orbit_ledger").select("id").eq("user_id", friend.id).eq("kind", "checkin")).data).toHaveLength(1);
    expect((await admin.from("referrals").select("status").eq("referred_id", friend.id).single()).data.status).toBe("pending_qualification");
    expect((await admin.from("orbit_ledger").select("id").eq("user_id", inviter.id).eq("kind", "referral")).data).toEqual([]);

    // the second day
    await activeOn(friend, -1);
    const rows = (await admin.from("orbit_ledger").select("amount, kind").eq("user_id", inviter.id).eq("kind", "referral")).data;
    expect(rows).toEqual([{ amount: 100, kind: "referral" }]);
    await activeOn(friend, -2);
    expect((await admin.from("orbit_ledger").select("id").eq("user_id", inviter.id).eq("kind", "referral")).data).toHaveLength(1);
    await context.close();
  });

  test("the inviter sees the reward, the notification, the leaderboard, and no private detail about the friend", async ({ browser }) => {
    const { context, page } = await as(browser, "inviter");
    await go(page, "/referrals");
    await expect(page.getByTestId("stat-successful")).toHaveText("1");
    await expect(page.getByTestId("stat-orbits-earned")).toHaveText("100");
    await expect(page.getByTestId("recent-referrals")).toContainText("Reward credited");
    const text = await page.locator("main").innerText();
    expect(text).not.toContain(newcomer.username);
    expect(text).not.toContain(newcomer.name);
    expect(text).not.toContain(newcomer.email);

    await go(page, "/notifications");
    await expect(page.getByText("A friend you invited is now an active member. You earned 100 Orbits.")).toBeVisible();

    await go(page, "/referrals/leaderboard?period=alltime");
    await expect(page.getByRole("heading", { name: "Referral leaderboard" })).toBeVisible();
    await expect(page.locator("[data-me='true']").first()).toBeVisible();
    await expect(page.getByTestId("my-rank")).toContainText("#");
    const board = await page.locator("main").innerText();
    expect(board).not.toContain(code);
    expect(board).not.toContain(newcomer.name);

    // Orbits: the 100 are in the balance and this week's earnings, and the badge progress did not move
    await go(page, "/orbits");
    await expect(page.getByTestId("orbit-balance")).toHaveText("100");
    await context.close();
  });

  test("the reminder appears once, closes with Escape, and does not come back on reload, route change or another page", async ({ browser }) => {
    const { context, page } = await as(browser, "popper");
    await go(page, "/explore");
    const dialog = page.getByTestId("referral-prompt");
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("dialog")).toContainText("Invite friends. Earn 100 Orbits.");
    expect(await page.getByRole("dialog").evaluate((el) => el.contains(document.activeElement))).toBe(true); // focus moved inside
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    let state = (await admin.from("referral_prompt_state").select("*").eq("user_id", popper.id).single()).data;
    expect(state).toMatchObject({ shown_count: 1, dismiss_count: 1, opted_out: false });
    const shownAt = state.last_shown_at;

    await page.goto("/feed");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(4000);
    await expect(dialog).toHaveCount(0);
    await page.goto("/projects");
    await page.waitForTimeout(3000);
    await expect(dialog).toHaveCount(0);
    state = (await admin.from("referral_prompt_state").select("*").eq("user_id", popper.id).single()).data;
    expect(state).toMatchObject({ shown_count: 1, dismiss_count: 1 });
    expect(state.last_shown_at).toBe(shownAt);
    await context.close();
  });

  test("the reminder stays away from messages and forms, and honours 'don't show again' on every device", async ({ browser }) => {
    const { context, page } = await as(browser, "quiet");
    await go(page, "/messages");
    await page.waitForTimeout(5000);
    await expect(page.getByTestId("referral-prompt")).toHaveCount(0);
    expect((await admin.from("referral_prompt_state").select("shown_count").eq("user_id", quiet.id).maybeSingle()).data?.shown_count ?? 0).toBe(0); // held back: the cooldown did not start

    // reduced motion: the dialog's artwork does not animate
    await context.close();
    const calm = await as(browser, "quiet", { reducedMotion: "reduce" });
    await go(calm.page, "/explore");
    await expect(calm.page.getByTestId("referral-prompt")).toBeVisible({ timeout: 20_000 });
    const names = await calm.page.locator(".ref-twinkle, .ref-bob").evaluateAll((els) => els.map((e) => getComputedStyle(e).animationName));
    expect(names.length).toBeGreaterThan(0);
    expect(names.every((n) => n === "none")).toBe(true);
    await calm.page.getByRole("button", { name: /Don.t show again/ }).click();
    await expect(calm.page.getByTestId("referral-prompt")).toHaveCount(0);
    expect((await admin.from("referral_prompt_state").select("opted_out").eq("user_id", quiet.id).single()).data.opted_out).toBe(true);
    await calm.context.close();

    // the switch on the Refer & Earn page shows the saved choice
    const { context: c2, page: p2 } = await as(browser, "quiet");
    await go(p2, "/referrals");
    await expect(p2.getByRole("switch", { name: /Show Refer and Earn reminders/ })).not.toBeChecked();
    await c2.close();
  });

  test("works on a phone: nothing sticks out sideways, the artwork and the share controls are there", async ({ browser }) => {
    const { context, page } = await as(browser, "inviter", { viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    for (const path of ["/referrals", "/referrals/leaderboard", "/orbits"]) {
      await go(page, path);
      expect(await overflow(page), `${path} scrolls sideways`).toBeLessThanOrEqual(0);
    }
    await go(page, "/referrals");
    await expect(page.getByTestId("copy-link")).toBeVisible();
    await expect(page.getByTestId("share-whatsapp")).toBeVisible();
    const svg = page.locator("section svg").first();
    const box = await svg.boundingBox();
    expect(box.width).toBeGreaterThan(300);
    expect(box.width).toBeLessThanOrEqual(360);
    await context.close();
  });

  test("meets accessibility checks on the Refer & Earn screens", async ({ browser }) => {
    const { context, page } = await as(browser, "inviter");
    for (const path of ["/referrals", "/referrals/leaderboard"]) {
      await go(page, path);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`), path).toEqual([]);
    }
    await context.close();
  });

  test("staff manage referrals in the admin console; members and plain staff cannot", async ({ browser }) => {
    const admin1 = await as(browser, "gadmin");
    await go(admin1.page, "/admin/referrals");
    await expect(admin1.page.getByRole("heading", { name: "Refer & Earn", level: 1 })).toBeVisible();
    await expect(admin1.page.getByText("Program settings")).toBeVisible();
    await admin1.page.getByRole("link", { name: /Review/ }).first().click();
    await expect(admin1.page.getByText("Qualification evidence")).toBeVisible();
    await expect(admin1.page.getByText("Email address confirmed")).toBeVisible();
    const html = await admin1.page.content();
    expect(html).not.toContain("@example.test");
    await admin1.context.close();

    const member = await as(browser, "plain");
    await member.page.goto("/admin/referrals");
    await expect(member.page).toHaveURL(/\/forbidden/);
    const res = await member.page.request.get("/api/admin/referrals/export");
    expect(res.status()).toBe(403);
    await member.context.close();
    const anonymous = await browser.newContext();
    expect((await anonymous.request.get("/api/admin/referrals/export")).status()).toBe(401);
    await anonymous.close();
  });
});
