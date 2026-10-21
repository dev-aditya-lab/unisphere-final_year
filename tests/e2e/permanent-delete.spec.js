import { test, expect } from "@playwright/test";
import { GREENFIELD, PASSWORD, admin, cleanupUsers, createUser, grantRoleDirect } from "../helpers/supabase.js";
import { NOTICE_VERSION } from "../../lib/privacy/registry.js";

/**
 * Permanent deletion in the real application: a member deleting their own post takes its comments and likes with it, and a global
 * administrator deletes through the three-step confirmation (a college admin is never offered it). One login per person.
 */

let gadmin, cadmin, author, fan;
const sessions = {};
const tag = Math.random().toString(36).slice(2, 7);
const slug = (p) => `${p}-${tag}-${Math.random().toString(36).slice(2, 7)}`;
const count = async (table, col, val) => (await admin.from(table).select("*", { count: "exact", head: true }).eq(col, val)).count;

/** Accounts created now must review their privacy choices before using the app; these tests are about something else. */
async function recordConsent(user) {
  const rows = ["age_confirmation", "core_service"].map((purpose) => ({ user_id: user.id, purpose, status: "granted", notice_version: NOTICE_VERSION }));
  const { error } = await admin.from("consent_current").upsert(rows);
  if (error) throw error;
}

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

async function seedBusyPost(title) {
  const s = slug("pd");
  const { data: post } = await admin.from("posts").insert({ author_id: author.id, slug: s, title, body: "Something worth discussing", visibility: "public" }).select("id").single();
  const { data: c } = await admin.from("comments").insert({ post_id: post.id, author_id: fan.id, body: "great point" }).select("id").single();
  await admin.from("comments").insert({ post_id: post.id, author_id: author.id, parent_id: c.id, body: "thank you" });
  await admin.from("post_reactions").insert({ post_id: post.id, user_id: fan.id, reaction: "like" });
  await admin.from("bookmarks").insert({ user_id: fan.id, post_id: post.id });
  return { id: post.id, slug: s, commentId: c.id };
}

test.describe.serial("permanent deletion", () => {
  test.setTimeout(120_000);

  test.beforeAll(async ({ browser }) => {
    gadmin = await createUser("pdx-gadmin");
    cadmin = await createUser("pdx-cadmin");
    author = await createUser("pdx-author");
    fan = await createUser("pdx-fan");
    for (const u of [gadmin, cadmin, author, fan]) await recordConsent(u);
    await grantRoleDirect(gadmin.id, "global_admin");
    await grantRoleDirect(cadmin.id, "college_admin", GREENFIELD);
    sessions.gadmin = await login(browser, gadmin);
    sessions.cadmin = await login(browser, cadmin);
    sessions.author = await login(browser, author);
  });
  test.afterAll(async () => {
    await admin.from("posts").delete().like("slug", `%-${tag}-%`);
    await cleanupUsers();
  });

  test("a member's Delete post removes the post with its comments, replies, likes and bookmarks", async ({ browser }) => {
    const post = await seedBusyPost(`Own post ${tag}`);
    const { context, page } = await as(browser, "author");
    await page.goto(`/posts/${post.slug}`);
    await page.getByRole("button", { name: "More actions" }).first().click();
    await page.getByRole("menuitem", { name: /Delete post/ }).click();
    await expect(page.getByText(/deleted for good, together with its comments, likes and images/)).toBeVisible();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect.poll(async () => await count("posts", "id", post.id), { timeout: 15_000 }).toBe(0);
    expect(await count("comments", "post_id", post.id)).toBe(0);
    expect(await count("post_reactions", "post_id", post.id)).toBe(0);
    expect(await count("bookmarks", "post_id", post.id)).toBe(0);
    await context.close();
  });

  test("a college admin is offered Remove but not permanent deletion", async ({ browser }) => {
    await seedBusyPost(`Hidden delete ${tag}`);
    const { context, page } = await as(browser, "cadmin");
    await page.goto(`/admin/posts?q=${encodeURIComponent(`Hidden delete ${tag}`)}`);
    await expect(page.getByRole("button", { name: "Remove" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);
    await context.close();
  });

  test("a global administrator deletes through three steps, and each step guards the next", async ({ browser }) => {
    const post = await seedBusyPost(`Spam post ${tag}`);
    const { context, page } = await as(browser, "gadmin");
    await page.goto(`/admin/posts?q=${encodeURIComponent(`Spam post ${tag}`)}`);
    await page.getByRole("button", { name: "Delete", exact: true }).click();

    // 1 Review: the real counts are shown, and nothing is deleted yet.
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Permanently delete this post?")).toBeVisible();
    await expect(dialog.getByText("2 comments and replies")).toBeVisible();
    await expect(dialog.getByText("1 like and reaction")).toBeVisible();
    await expect(dialog.getByText("1 bookmark")).toBeVisible();
    await dialog.getByRole("button", { name: "Continue" }).click();

    // 2 Reason: needs 10 characters and the acknowledgement.
    const next = dialog.getByRole("button", { name: "Continue" });
    await expect(next).toBeDisabled();
    await dialog.getByLabel("Why is this being deleted?").fill("Spam");
    await dialog.getByLabel(/I understand this cannot be undone/).check();
    await expect(next).toBeDisabled();
    await dialog.getByLabel("Why is this being deleted?").fill("Repeated spam after two warnings");
    await expect(next).toBeEnabled();
    await next.click();

    // 3 Confirm: the address must match exactly and the password must be right.
    const final = dialog.getByRole("button", { name: "Delete post permanently" });
    await expect(final).toBeDisabled();
    await dialog.getByLabel(/to confirm/).fill("not-the-address");
    await dialog.getByLabel("Your password").fill(PASSWORD);
    await expect(final).toBeDisabled();
    await dialog.getByLabel(/to confirm/).fill(post.slug);
    await dialog.getByLabel("Your password").fill("definitely-wrong-password");
    await final.click();
    await expect(dialog.getByText("That password is not correct")).toBeVisible();
    expect(await count("posts", "id", post.id)).toBe(1);

    await dialog.getByLabel("Your password").fill(PASSWORD);
    await final.click();
    await expect(page.getByText("The post was permanently deleted.")).toBeVisible({ timeout: 15_000 });
    expect(await count("posts", "id", post.id)).toBe(0);
    expect(await count("comments", "post_id", post.id)).toBe(0);
    expect(await count("post_reactions", "post_id", post.id)).toBe(0);
    const { data: audit } = await admin.from("audit_logs").select("metadata").eq("action", "content.purged").eq("target_id", post.id);
    expect(audit).toHaveLength(1);
    expect(audit[0].metadata.reason).toBe("Repeated spam after two warnings");
    await context.close();
  });
  test("a global administrator erases a member's whole account, and the member's posts go with it", async ({ browser }) => {
    const victim = await createUser("pdx-victim");
    await recordConsent(victim);
    const { data: post } = await admin.from("posts").insert({ author_id: victim.id, slug: slug("vp"), body: "About to disappear", visibility: "public" }).select("id").single();
    await admin.from("comments").insert({ post_id: post.id, author_id: fan.id, body: "hello" });

    const { context, page } = await as(browser, "gadmin");
    await page.goto(`/admin/users/${victim.id}`);
    await page.getByRole("button", { name: "Erase account permanently" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(`@${victim.username}`)).toBeVisible();
    await dialog.getByRole("button", { name: "Continue" }).click();
    await dialog.getByLabel("Why is this being deleted?").fill("Fraudulent account, confirmed by the owner");
    await dialog.getByLabel(/I understand this cannot be undone/).check();
    await dialog.getByRole("button", { name: "Continue" }).click();
    await dialog.getByLabel(/to confirm/).fill(victim.username);
    await dialog.getByLabel("Your password").fill(PASSWORD);
    await dialog.getByRole("button", { name: "Delete account permanently" }).click();
    await expect(page.getByText("The account was permanently erased.")).toBeVisible({ timeout: 30_000 });

    expect(await count("profiles", "id", victim.id)).toBe(0);
    expect(await count("posts", "id", post.id)).toBe(0);
    expect(await count("comments", "post_id", post.id)).toBe(0);
    const { data: audit } = await admin.from("audit_logs").select("id").eq("action", "user.purge_started").eq("target_id", victim.id);
    expect(audit).toHaveLength(1);
    await context.close();
  });
});
