import { test, expect } from "@playwright/test";
import { admin, cleanupUsers, createUser, grantRoleDirect, PASSWORD } from "../helpers/supabase.js";

const RGEC = "00000000-0000-4000-8000-0000000000a1";

async function login(page, email, expectUrl = /\/feed/) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(expectUrl, { timeout: 30_000 });
}

test.describe.serial("Feedback, roadmap and changelog", () => {
  test.setTimeout(180_000);
  let tag, s1, product, voter;
  test.beforeAll(async () => {
    tag = Math.random().toString(36).slice(2, 7);
    s1 = await createUser("p8-student1", { collegeId: RGEC });
    voter = await createUser("p8-voter", { collegeId: RGEC });
    product = await createUser("p8-product", { collegeId: RGEC });
    await grantRoleDirect(product.id, "global_admin");
  });
  test.afterAll(async () => {
    await admin.from("feedback_items").delete().like("title", `%${tag}%`);
    await admin.from("releases").delete().like("version", "9.%");
    await cleanupUsers();
  });

  test("members report bugs with context, suggest ideas and vote", async ({ browser }) => {
    const member = await (await browser.newContext()).newPage();
    await login(member, s1.email);
    await member.goto(`/feedback?kind=bug&from=${encodeURIComponent("/projects")}`);
    await member.waitForLoadState("networkidle");
    await member.getByLabel("What went wrong?").fill(`Project page freezes ${tag}`);
    await member.getByLabel(/What did you do/).fill("Opened a project, scrolled down and nothing responded after that.");
    await member.getByLabel("How bad is it?").selectOption("high");
    await member.getByRole("button", { name: "Send", exact: true }).click();
    await expect(member.getByText("Thanks. The team has your bug report.")).toBeVisible({ timeout: 20_000 });
    const { data: bug } = await admin.from("feedback_items").select("kind, severity, context, is_public").like("title", `Project page freezes ${tag}`).single();
    expect(bug).toMatchObject({ kind: "bug", severity: "high", is_public: false });
    expect(bug.context).toMatchObject({ path: "/projects" });
    expect(bug.context.app_version).toMatch(/^\d+\.\d+\.\d+$/);

    await member.getByRole("radio", { name: "Suggest a feature" }).check({ force: true });
    await member.getByLabel("Your idea in one line").fill(`Study group finder ${tag}`);
    await member.getByLabel("Why would it help?").fill("Find classmates preparing for the same exam, by subject and semester.");
    await member.getByRole("button", { name: "Send", exact: true }).click();
    await expect(member.getByText("Thanks. Your idea is on the board.")).toBeVisible({ timeout: 20_000 });
    await expect(member.getByRole("heading", { name: `Study group finder ${tag}` })).toBeVisible({ timeout: 20_000 });

    // another member from the same college votes; bugs are not on the board
    const other = await (await browser.newContext()).newPage();
    await login(other, voter.email);
    await other.goto("/feedback");
    await expect(other.getByRole("heading", { name: `Study group finder ${tag}` })).toBeVisible();
    await expect(other.getByText(`Project page freezes ${tag}`)).toHaveCount(0);
    await other.waitForLoadState("networkidle");
    const card = other.getByRole("listitem").filter({ hasText: `Study group finder ${tag}` });
    await card.getByRole("button", { name: /Vote for this idea/ }).click();
    await expect(card.getByRole("button", { name: /Remove your vote/ })).toBeVisible();
    await expect.poll(async () => (await admin.from("feedback_items").select("vote_count").like("title", `Study group finder ${tag}`).single()).data.vote_count).toBe(2);
  });

  test("the product team triages; the idea reaches the public roadmap and the member is notified", async ({ browser }) => {
    const page = await (await browser.newContext()).newPage();
    await login(page, product.email);
    await page.goto(`/admin/feedback?q=${tag}`);
    const bugItem = page.getByRole("listitem").filter({ hasText: `Project page freezes ${tag}` });
    await expect(bugItem).toBeVisible();
    await expect(bugItem.getByText("page /projects")).toBeVisible(); // reproduction context is shown
    await expect(bugItem.getByText("v0.8.0")).toBeVisible();
    await page.waitForLoadState("networkidle");

    const idea = page.getByRole("listitem").filter({ hasText: `Study group finder ${tag}` });
    await idea.getByRole("button", { name: "Triage" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Status").selectOption("planned");
    await dialog.getByLabel(/Reply to the member/).fill("Great idea. Planned for after exams.");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toBeHidden({ timeout: 20_000 });

    // the roadmap is for members only: a logged-out visitor is sent to the login page
    const anon = await (await browser.newContext()).newPage();
    await anon.goto("/roadmap");
    await expect(anon).toHaveURL(/\/login/);
    const reader = await (await browser.newContext()).newPage();
    await login(reader, voter.email);
    await reader.goto("/roadmap");
    const planned = reader.getByRole("region", { name: /Planned next/ });
    await expect(planned.getByText(`Study group finder ${tag}`)).toBeVisible();
    await expect(planned.getByText("Great idea. Planned for after exams.")).toBeVisible();
    await expect(reader.getByText(`Project page freezes ${tag}`)).toHaveCount(0);

    const member = await (await browser.newContext()).newPage();
    await login(member, s1.email);
    await member.goto("/notifications");
    await expect(member.getByText(new RegExp(`Study group finder ${tag}.*on the roadmap`))).toBeVisible();
    await member.goto("/feedback?tab=mine");
    await expect(member.getByText("Planned").first()).toBeVisible();
  });

  test("the team publishes release notes to the members-only changelog", async ({ browser }) => {
    const page = await (await browser.newContext()).newPage();
    await login(page, product.email);
    await page.goto("/admin/releases");
    await page.waitForLoadState("networkidle");
    const panel = page.getByRole("region").filter({ hasText: "New release" }).last();
    await page.getByLabel("Version", { exact: true }).last().fill("9.4.0");
    await page.getByLabel("Title", { exact: true }).last().fill(`E2E release ${tag}`);
    await page.getByLabel("Change 1", { exact: true }).last().fill(`Faster study group search ${tag}`);
    await page.getByRole("button", { name: "Publish" }).last().click();
    await expect(page.getByText("Published to the changelog.")).toBeVisible({ timeout: 20_000 });
    expect(panel).toBeTruthy();

    const anon = await (await browser.newContext()).newPage();
    await anon.goto("/changelog");
    await expect(anon).toHaveURL(/\/login/); // members only

    const reader = await (await browser.newContext()).newPage();
    await login(reader, voter.email);
    await reader.goto("/changelog");
    await expect(reader.getByRole("heading", { name: `E2E release ${tag}` })).toBeVisible();
    await expect(reader.getByText(`Faster study group search ${tag}`)).toBeVisible();
    await expect(reader.getByRole("heading", { name: "Foundation" })).toBeVisible(); // the real history is there too
    expect((await anon.request.get("/changelog/rss.xml", { maxRedirects: 0 })).status()).not.toBe(200); // no public feed any more
  });
});
