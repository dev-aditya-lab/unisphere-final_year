import { test, expect } from "@playwright/test";
import { ADMIN_NAV } from "../../lib/admin/nav.js";
import { GREENFIELD, PASSWORD, admin, cleanupUsers, createUser, grantRoleDirect } from "../helpers/supabase.js";

/**
 * The admin area in the real application: who can open it, the member directory, the member page and its tools.
 * One login per person (the login endpoint is rate limited), reused through storage state.
 */

let member, cadmin, gadmin, target;
const sessions = {};

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

test.describe.serial("admin: access, member directory and member tools", () => {
  test.setTimeout(120_000);

  test.beforeAll(async ({ browser }) => {
    member = await createUser("adm-member");
    cadmin = await createUser("adm-cadmin");
    gadmin = await createUser("adm-gadmin");
    target = await createUser("adm-target");
    await grantRoleDirect(cadmin.id, "college_admin", GREENFIELD);
    await grantRoleDirect(gadmin.id, "global_admin");
    sessions.member = await login(browser, member);
    sessions.cadmin = await login(browser, cadmin);
    sessions.gadmin = await login(browser, gadmin);
  });
  test.afterAll(async () => {
    await cleanupUsers();
  });

  test("an ordinary member cannot open admin pages or call admin endpoints", async ({ browser }) => {
    const { context, page } = await as(browser, "member");
    await page.goto("/admin");
    await expect(page).toHaveURL(/forbidden/);
    await page.goto(`/admin/users/${target.id}`);
    await expect(page).toHaveURL(/forbidden/);
    expect((await page.request.get("/api/admin/audit")).status()).toBe(403);
    expect((await page.request.get("/api/admin/analytics")).status()).toBe(403);
    expect((await page.request.get(`/api/admin/users/${target.id}/export`)).status()).toBe(403);
    await context.close();

    const anonymous = await browser.newContext();
    expect((await anonymous.request.get("/api/admin/audit")).status()).toBe(401);
    expect((await anonymous.request.get(`/api/admin/users/${target.id}/export`)).status()).toBe(401);
    await anonymous.close();
  });

  test("a college administrator finds a member by ID and by username, and sees the right columns", async ({ browser }) => {
    const { context, page } = await as(browser, "cadmin");
    await page.goto(`/admin/users?q=${target.id}`);
    await expect(page.getByRole("table", { name: "Members" }).getByRole("row")).toHaveCount(2); // header + the one match
    await expect(page.getByText(`@${target.username}`)).toBeVisible();
    await page.goto(`/admin/users?q=${target.username}&status=suspended`);
    await expect(page.getByText("No members match.")).toBeVisible();
    await page.goto("/admin/users?q=adm-&sort=name&dir=asc");
    const names = await page.locator("tbody tr td:first-child p.font-medium").allTextContents();
    expect(names.length).toBeGreaterThan(1);
    expect(names.map((n) => n.toLowerCase())).toEqual([...names.map((n) => n.toLowerCase())].sort());
    await context.close();
  });

  test("notes, a timed restriction and reinstatement work from the member page, and are audited", async ({ browser }) => {
    const { context, page } = await as(browser, "cadmin");
    await page.goto(`/admin/users/${target.id}`);

    await page.getByLabel("Add an internal note").fill("Spoke to them; keeping an eye on it");
    await page.getByRole("button", { name: "Add note" }).click();
    await expect(page.getByText("Spoke to them; keeping an eye on it")).toBeVisible();
    await expect(page.getByText("Internal note").first()).toBeVisible();

    await page.getByRole("button", { name: "Restrict account" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("How long").selectOption("7");
    await expect(dialog.getByRole("button", { name: "Restrict account" })).toBeDisabled(); // a reason is required
    await dialog.getByLabel("Reason shown to the member").fill("Posting the same link repeatedly");
    await dialog.getByRole("button", { name: "Restrict account" }).click();
    await expect(page.getByText("Restriction ends")).toBeVisible({ timeout: 15_000 });
    const row = (await admin.from("profiles").select("status, restricted_until").eq("id", target.id).single()).data;
    expect(row.status).toBe("restricted");
    expect(new Date(row.restricted_until).getTime()).toBeGreaterThan(Date.now() + 6 * 86_400_000);

    // the member sees what was decided, never the note
    const mine = await target.client.from("moderation_actions").select("action, reason").eq("target_user_id", target.id);
    expect(mine.data.map((a) => a.action)).toContain("restrict");
    expect(mine.data.map((a) => a.action)).not.toContain("note");

    await page.getByRole("button", { name: "Reinstate account" }).click();
    await page.getByRole("dialog").getByLabel("Note to the member").fill("Thanks for fixing it");
    await page.getByRole("dialog").getByRole("button", { name: "Reinstate account" }).click();
    await expect.poll(async () => (await admin.from("profiles").select("status, restricted_until").eq("id", target.id).single()).data).toEqual({ status: "active", restricted_until: null });

    const audit = (await admin.from("audit_logs").select("action").eq("target_id", target.id)).data.map((r) => r.action);
    expect(audit).toEqual(expect.arrayContaining(["moderation.note", "moderation.restrict", "moderation.reinstate"]));
    await context.close();
  });

  test("a college administrator does not get the global-only export, and a refused call is audited", async ({ browser }) => {
    const { context, page } = await as(browser, "cadmin");
    await page.goto(`/admin/users/${target.id}`);
    await expect(page.getByRole("link", { name: "Export member data" })).toHaveCount(0);
    expect((await page.request.get(`/api/admin/users/${target.id}/export`)).status()).toBe(403);
    await context.close();
  });

  test("a global administrator corrects a profile, signs a member out, and exports their data", async ({ browser }) => {
    const { context, page } = await as(browser, "gadmin");
    await page.goto(`/admin/users/${target.id}`);

    await page.getByRole("button", { name: "Correct profile" }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("Headline").fill("Corrected headline");
    await dialog.getByLabel("Reason").fill("Headline broke the guidelines");
    await dialog.getByRole("button", { name: "Save correction" }).click();
    await expect.poll(async () => (await admin.from("profiles").select("headline").eq("id", target.id).single()).data.headline).toBe("Corrected headline");

    await page.getByRole("button", { name: "Sign out everywhere" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Reason (kept in the audit log)").fill("Reported as compromised");
    await dialog.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByText(/Signed out of \d+ session/)).toBeVisible({ timeout: 15_000 });
    expect((await target.client.auth.refreshSession()).error).not.toBeNull();

    const res = await page.request.get(`/api/admin/users/${target.id}/export`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-disposition"]).toContain("attachment");
    const body = await res.json();
    expect(body.profile.id).toBe(target.id);
    expect(JSON.stringify(body)).not.toMatch(/password|refresh_token/i);
    const audit = (await admin.from("audit_logs").select("action").eq("target_id", target.id)).data.map((r) => r.action);
    expect(audit).toEqual(expect.arrayContaining(["user.profile_edited", "user.sessions_revoked", "user.exported"]));
    await context.close();
  });

  test("the dashboard shows real recent actions, and the admin pages fit a phone", async ({ browser }) => {
    const { context, page } = await as(browser, "gadmin", { viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
    await page.goto("/admin");
    await expect(page.getByText("Recent administrative actions")).toBeVisible();
    await expect(page.getByText("user.exported")).toBeVisible();
    for (const path of [...ADMIN_NAV.map((i) => i.href), `/admin/users/${target.id}`]) {
      const res = await page.goto(path);
      expect(res.status(), `${path} should load for a global administrator`).toBeLessThan(400);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(1);
    }
    await context.close();
  });
});
