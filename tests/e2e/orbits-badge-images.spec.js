import { test, expect } from "@playwright/test";
import { PASSWORD, admin, cleanupUsers, createUser, grantRoleDirect } from "../helpers/supabase.js";

/**
 * Badge pictures: only an administrator can change one, the dialog guards what it accepts, and a member sees the custom picture
 * (or the built-in artwork when there is none). The tests never send a file to real storage: R2 credentials are blank, so an upload
 * answers "not configured", and the picture records are created directly in the database.
 */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
let member, gadmin, badge, key;
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
const as = async (browser, who) => {
  const context = await browser.newContext({ storageState: sessions[who] });
  return { context, page: await context.newPage() };
};
const go = async (page, path) => {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
};

test.describe.serial("Badge pictures", () => {
  test.setTimeout(120_000);

  test.beforeAll(async ({ browser }) => {
    member = await createUser("orbimg-member");
    gadmin = await createUser("orbimg-admin");
    await grantRoleDirect(gadmin.id, "global_admin");
    badge = (await admin.from("orbit_achievements").select("id, title, icon").eq("active", true).neq("category", "ranking").order("sort_order").limit(1).single()).data;
    await admin.from("orbit_achievements").update({ image_key: null }).eq("id", badge.id);
    await admin.from("orbit_user_achievements").insert({ user_id: member.id, achievement_id: badge.id, celebrated_at: new Date().toISOString() });
    key = `orbit_badge/${gadmin.id}/${crypto.randomUUID()}.png`;
    sessions.member = await login(browser, member);
    sessions.gadmin = await login(browser, gadmin);
  });
  test.afterAll(async () => {
    await admin.from("orbit_achievements").update({ image_key: null }).eq("id", badge.id);
    await admin.from("files").delete().eq("storage_key", key);
    await cleanupUsers();
  });

  test("a member cannot upload a badge picture, even by calling the upload route directly", async ({ browser }) => {
    const { context, page } = await as(browser, "member");
    await go(page, "/feed");
    const res = await page.evaluate(async (png) => {
      const body = new FormData();
      body.append("purpose", "orbit_badge");
      body.append("file", new Blob([Uint8Array.from(atob(png), (c) => c.charCodeAt(0))], { type: "image/png" }), "badge.png");
      const r = await fetch("/api/upload", { method: "POST", body });
      return { status: r.status, json: await r.json() };
    }, PNG.toString("base64"));
    expect(res.status).toBe(403);
    expect(res.json.ok).toBe(false);
    // and the admin page itself is closed to them
    await page.goto("/admin/orbits");
    await expect(page).not.toHaveURL(/\/admin\/orbits$/);
    await context.close();
  });

  test("the editor shows the current picture, rejects the wrong kind of file, previews a good one and reports storage problems", async ({ browser }) => {
    const { context, page } = await as(browser, "gadmin");
    await go(page, "/admin/orbits");
    const row = page.getByRole("listitem").filter({ hasText: badge.title }).first();
    await row.getByRole("button", { name: "Edit" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Badge picture")).toBeVisible();
    await expect(dialog.getByText("The built-in artwork is in use.")).toBeVisible();
    await expect(dialog.getByRole("img", { name: `Current picture of ${badge.title}` })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Use built-in artwork" })).toHaveCount(0);

    const input = dialog.locator("input[type=file]");
    await input.setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
    await expect(dialog.getByRole("alert")).toContainText("PNG, WebP or JPG");
    await input.setInputFiles({ name: "huge.png", mimeType: "image/png", buffer: Buffer.alloc(2 * 1024 * 1024 + 10) });
    await expect(dialog.getByRole("alert")).toContainText("under 2 MB");

    await input.setInputFiles({ name: "badge.png", mimeType: "image/png", buffer: PNG });
    await expect(dialog.getByRole("img", { name: "New picture, not saved yet" })).toBeVisible();
    await expect(dialog.getByText("badge.png is not saved yet.")).toBeVisible();
    await dialog.getByRole("button", { name: "Upload and use" }).click();
    await expect(dialog.getByRole("alert")).toContainText(/not available|not configured|failed/i, { timeout: 15_000 }); // blank R2 credentials in tests
    expect((await admin.from("orbit_achievements").select("image_key").eq("id", badge.id).single()).data.image_key).toBeNull();
    await context.close();
  });

  test("a member sees the custom picture on the badge, the built-in artwork on the others, and the admin list and reset follow", async ({ browser }) => {
    await admin.from("files").insert({ owner_id: gadmin.id, bucket: "public", storage_key: key, purpose: "orbit_badge", mime_type: "image/png", size_bytes: PNG.length, original_name: "badge.png", status: "ready", ready_at: new Date().toISOString() });
    await admin.from("orbit_achievements").update({ image_key: key }).eq("id", badge.id);

    const m = await as(browser, "member");
    await go(m.page, "/orbits/achievements");
    const tile = m.page.getByRole("listitem").filter({ hasText: badge.title }).first();
    await expect(tile.locator(`img[src*="${key}"]`)).toHaveCount(1);
    const other = m.page.locator('li[data-earned="false"] img[src*="icons%2Freward"]').first();
    await expect(other).toBeAttached(); // the others keep the built-in artwork
    await m.context.close();

    const a = await as(browser, "gadmin");
    await go(a.page, "/admin/orbits");
    const row = a.page.getByRole("listitem").filter({ hasText: badge.title }).first();
    await expect(row.locator(`img[src*="${key}"]`)).toHaveCount(1);
    await row.getByRole("button", { name: "Edit" }).click();
    const dialog = a.page.getByRole("dialog");
    await expect(dialog.getByText("A custom picture is in use.")).toBeVisible();
    await dialog.getByRole("button", { name: "Use built-in artwork" }).click();
    await expect(dialog.getByText("The built-in artwork is in use.")).toBeVisible({ timeout: 15_000 });
    expect((await admin.from("orbit_achievements").select("image_key").eq("id", badge.id).single()).data.image_key).toBeNull();
    expect((await admin.from("audit_logs").select("id").eq("actor_id", gadmin.id).eq("action", "orbits.badge_image")).data.length).toBeGreaterThan(0);
    await a.context.close();
  });
});
