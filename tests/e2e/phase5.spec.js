import { test, expect } from "@playwright/test";
import { admin, cleanupUsers, createUser, grantRoleDirect, GREENFIELD, PASSWORD } from "../helpers/supabase.js";

async function login(page, email, expectUrl = /\/feed/) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(expectUrl, { timeout: 30_000 });
}

/** Opens a dialog from a button, fills its reason box and confirms. */
async function decide(page, trigger, reason, confirm = trigger, scope = page) {
  await scope.getByRole("button", { name: trigger, exact: true }).click();
  const dialog = page.getByRole("dialog");
  if (reason) await dialog.getByRole("textbox").fill(reason);
  await dialog.getByRole("button", { name: confirm, exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });
}

test.describe.serial("administration", () => {
  test.setTimeout(180_000); // first visits compile pages in dev mode
  let member, reporter, mod, mod2, gadmin, tag, post;
  test.beforeAll(async () => {
    tag = Math.random().toString(36).slice(2, 7);
    member = await createUser("p5e-member");
    reporter = await createUser("p5e-reporter");
    mod = await createUser("p5e-mod");
    mod2 = await createUser("p5e-mod2");
    gadmin = await createUser("p5e-admin");
    await grantRoleDirect(mod.id, "moderator", GREENFIELD);
    await grantRoleDirect(mod2.id, "moderator", GREENFIELD);
    await grantRoleDirect(gadmin.id, "global_admin");
    const { data } = await member.client.from("posts").insert({ author_id: member.id, slug: `p5e-${tag}`, title: `Spammy post ${tag}`, body: "Buy cheap followers now!!!", visibility: "public" }).select("id, slug").single();
    post = data;
  });

  test.afterAll(async () => {
    await admin.from("posts").delete().like("slug", `p5e-${tag}%`);
    await cleanupUsers();
  });

  test("members without a staff role cannot open the console", async ({ browser }) => {
    const page = await (await browser.newContext()).newPage();
    await login(page, member.email);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/forbidden/);
    expect((await page.request.get("/api/admin/audit")).status()).toBe(403);
    expect((await page.request.get("/api/admin/analytics")).status()).toBe(403);
    await page.goto("/settings/security");
    await expect(page.getByRole("link", { name: "Download my data" })).toBeVisible();
  });

  test("a moderator reviews a report, removes the post, and the author is told", async ({ browser }) => {
    const { error } = await reporter.client.rpc("submit_report", { p_target_type: "post", p_target_id: post.id, p_category: "spam", p_details: "Obvious spam" });
    expect(error).toBeNull();

    const page = await (await browser.newContext()).newPage();
    await login(page, mod.email);
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    // moderators see moderation tools but not system settings
    await expect(page.getByRole("link", { name: /^Reports/ }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Settings & flags" })).toHaveCount(0);

    await page.goto("/admin/reports");
    await expect(page.getByRole("heading", { name: "Reports", level: 1 })).toBeVisible();
    const { data: rep } = await admin.from("reports").select("id").eq("target_id", post.id).single();
    await page.goto(`/admin/reports/${rep.id}`);
    await expect(page.getByText("Buy cheap followers now!!!")).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Take this report" }).click();
    await expect(page.getByRole("button", { name: "Release" })).toBeVisible({ timeout: 15_000 });

    // a reason is mandatory
    await page.getByRole("button", { name: "Remove content", exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("button", { name: "Remove content", exact: true })).toBeDisabled();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();

    await decide(page, "Remove content", "Spam: unsolicited promotion");
    await expect(page.getByText("resolved").first()).toBeVisible({ timeout: 20_000 });
    expect((await admin.from("posts").select("status").eq("id", post.id).single()).data.status).toBe("removed");

    // the removed post is gone for everyone else, and the author was notified with the reason
    const other = await (await browser.newContext()).newPage();
    await login(other, reporter.email);
    // The post page streams behind a skeleton (loading.js), so a missing post answers 200 with the not-found page rather than a 404 status.
    await other.goto(`/posts/${post.slug}`);
    await expect(other.getByText("We could not find that page")).toBeVisible();
    const { data: notes } = await admin.from("notifications").select("data").eq("user_id", member.id).eq("type", "moderation_content_removed");
    expect(notes[0].data.reason).toBe("Spam: unsolicited promotion");
  });

  test("suspension, appeal and reinstatement work end to end", async ({ browser }) => {
    const modPage = await (await browser.newContext()).newPage();
    await login(modPage, gadmin.email);
    await modPage.goto(`/admin/users/${member.id}`);
    await expect(modPage.getByRole("heading", { name: member.username ? /Test p5e-member/ : /./ })).toBeVisible();
    await modPage.waitForLoadState("networkidle");
    await decide(modPage, "Suspend account", "Repeated spam after warnings");
    await expect.poll(async () => (await admin.from("profiles").select("status").eq("id", member.id).single()).data.status).toBe("suspended");

    // the suspended member sees the reason and can appeal
    const memberPage = await (await browser.newContext()).newPage();
    await login(memberPage, member.email, /\/suspended/);
    await expect(memberPage.getByRole("heading", { name: "Your account is suspended" })).toBeVisible();
    await expect(memberPage.getByText("Repeated spam after warnings")).toBeVisible();
    await memberPage.waitForLoadState("networkidle");
    await memberPage.getByRole("button", { name: "Appeal this decision" }).click();
    await memberPage.getByLabel(/Tell the reviewer/).fill("I understand and it will not happen again.");
    await memberPage.getByRole("button", { name: "Send appeal" }).click();
    await expect(memberPage.getByText("pending").first()).toBeVisible({ timeout: 20_000 });

    // another moderator upholds it
    const mod2Page = await (await browser.newContext()).newPage();
    await login(mod2Page, mod2.email);
    await mod2Page.goto("/admin/appeals");
    const appealItem = mod2Page.getByRole("listitem").filter({ hasText: `@${member.username}` });
    await expect(appealItem.getByText("I understand and it will not happen again.")).toBeVisible();
    await mod2Page.waitForLoadState("networkidle");
    await decide(mod2Page, "Uphold appeal", "First offence; apology accepted", "Uphold appeal", appealItem);
    await expect.poll(async () => (await admin.from("profiles").select("status").eq("id", member.id).single()).data.status).toBe("active");

    await memberPage.goto("/feed");
    await expect(memberPage).toHaveURL(/\/feed/);
    await memberPage.goto("/notifications");
    await expect(memberPage.getByText(/Your appeal was upheld/)).toBeVisible();
  });

  test("a global admin manages roles, settings and flags; changes are audited", async ({ browser }) => {
    const page = await (await browser.newContext()).newPage();
    await login(page, gadmin.email);

    await page.goto("/admin/roles");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Username").fill(reporter.username);
    await page.getByLabel("Role").selectOption("moderator");
    await page.getByLabel("College").selectOption({ index: 0 });
    await page.getByRole("button", { name: "Grant role" }).click();
    await expect(page.getByText(`@${reporter.username}`).first()).toBeVisible({ timeout: 20_000 });

    await page.goto("/admin/settings");
    await page.waitForLoadState("networkidle");
    const tagline = page.getByLabel("Tagline");
    const original = await tagline.inputValue();
    await tagline.fill(`Campus connections ${tag}`);
    const saveTagline = tagline.locator("xpath=following::button[normalize-space()='Save'][1]");
    await saveTagline.click();
    await expect(page.getByText("Tagline saved.")).toBeVisible({ timeout: 15_000 });
    await expect(saveTagline).toBeDisabled(); // the refreshed page now matches what was typed
    await tagline.fill(original);
    await expect(saveTagline).toBeEnabled();
    await saveTagline.click();
    await expect(page.getByText("Tagline saved.")).toBeVisible({ timeout: 15_000 });

    const flag = page.getByRole("switch", { name: "Opportunities" });
    await flag.click();
    await expect(page.getByText("Opportunities disabled.")).toBeVisible({ timeout: 15_000 });
    await flag.click();
    await expect(page.getByText("Opportunities enabled.")).toBeVisible({ timeout: 15_000 });

    await page.goto("/admin/audit?action=settings.");
    await expect(page.getByText("settings.updated").first()).toBeVisible();
    await page.goto("/admin/audit?action=role.");
    await expect(page.getByText("role.granted").first()).toBeVisible();
  });

  test("analytics, AI status and the other admin pages render for a global admin", async ({ browser }) => {
    const page = await (await browser.newContext()).newPage();
    await login(page, gadmin.email);
    for (const [path, heading] of [
      ["/admin/analytics", "Analytics"], ["/admin/ai", "AI status"], ["/admin/users", "Members"], ["/admin/verification", "College verification"],
      ["/admin/appeals", "Appeals"], ["/admin/posts", "Posts"], ["/admin/communities", "Communities"], ["/admin/events", "Events"],
      ["/admin/announcements", "Announcements"], ["/admin/support", "Support inbox"], ["/admin/deletions", "Account deletion"], ["/admin/colleges", "College directory"],
    ]) {
      const res = await page.goto(path);
      expect(res.status(), path).toBe(200);
      await expect(page.getByRole("heading", { level: 1, name: heading }), path).toBeVisible();
    }
    await page.goto("/admin/analytics?range=7");
    await expect(page.getByRole("img", { name: /New members.*in total/ })).toBeVisible();
    const csv = await page.request.get("/api/admin/analytics?range=7");
    expect(csv.status()).toBe(200);
    expect(await csv.text()).toContain("date,members,posts");
    await page.goto("/admin/users?q=p5e-");
    await expect(page.getByText(`@${member.username}`).first()).toBeVisible();
  });

  test("a member can download their own data", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await login(page, reporter.email);
    const res = await page.request.get("/api/account/export");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.account.email).toBe(reporter.email);
    expect(body.incomplete_sections).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain(member.email);
  });
});
