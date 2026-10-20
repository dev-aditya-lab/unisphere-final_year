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

test.describe.serial("projects, teammates and AI assist", () => {
  let owner, joiner, name;
  test.beforeAll(async () => {
    owner = await createUser("owner-e2e");
    joiner = await createUser("joiner-e2e");
    await admin.from("profiles").update({ skills: ["Figma", "User research"], open_to_collaboration: true }).eq("id", joiner.id);
    name = `Campus Lost and Found ${Math.random().toString(36).slice(2, 6)}`;
  });

  test("owner creates a recruiting project with an open role", async ({ browser }) => {
    const page = await (await browser.newContext()).newPage();
    await login(page, owner.email);
    await page.goto("/projects/new");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Project name").fill(name);
    await page.getByLabel("One-line summary").fill("Find lost items on campus faster");
    await page.getByRole("textbox", { name: "Required skills", exact: true }).fill("Figma");
    await page.keyboard.press("Enter");
    await page.getByRole("switch", { name: "Looking for members" }).click();
    await page.getByRole("button", { name: "Add role" }).click();
    await page.getByLabel("Role", { exact: true }).fill("UI designer");
    await page.getByRole("button", { name: "Create project" }).click();
    await expect(page.getByRole("heading", { name })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Recruiting")).toBeVisible();
    await expect(page.getByText("UI designer")).toBeVisible();
  });

  test("a teammate requests to join and the owner accepts", async ({ browser }) => {
    const { data: project } = await admin.from("projects").select("id, slug").eq("name", name).single();

    const jp = await (await browser.newContext()).newPage();
    await login(jp, joiner.email);
    await jp.goto(`/projects/${project.slug}`);
    await jp.waitForLoadState("networkidle");
    await jp.getByRole("button", { name: "Request to join" }).click();
    await jp.getByLabel("Why do you want to join?").fill("I do UI design and user research.");
    await jp.getByRole("button", { name: "Send request" }).click();
    await expect(jp.getByRole("button", { name: /Request sent/ })).toBeVisible();

    const op = await (await browser.newContext()).newPage();
    await login(op, owner.email);
    await op.goto(`/projects/${project.slug}/manage`);
    await op.waitForLoadState("networkidle");
    await expect(op.getByText("I do UI design and user research.")).toBeVisible();
    await op.getByRole("button", { name: "Accept" }).click();
    await expect.poll(async () => (await admin.from("project_members").select("user_id").eq("project_id", project.id)).data.length).toBe(2);

    await op.getByRole("tab", { name: /Team/ }).click();
    await expect(op.getByText("Test joiner-e2e")).toBeVisible();
  });

  test("suggested teammates list real matches with reasons from listed skills", async ({ browser }) => {
    const { data: project } = await admin.from("projects").select("id, slug").eq("name", name).single();
    const third = await createUser("third-e2e");
    await admin.from("profiles").update({ skills: ["Figma"], open_to_collaboration: true }).eq("id", third.id);
    const page = await (await browser.newContext()).newPage();
    await login(page, owner.email);
    await page.goto(`/projects/${project.slug}/manage`);
    await page.waitForLoadState("networkidle");
    await page.getByRole("tab", { name: "Suggested teammates" }).click();
    await page.getByRole("button", { name: "Find teammates" }).click();
    await expect(page.getByText("Test third-e2e").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Figma/).first()).toBeVisible();
    await expect(page.getByText(/score \d/).first()).toBeVisible();
  });

  test("AI assist in the composer suggests tags and finds related work, and the member stays in control", async ({ browser }) => {
    const author = await createUser("ai-author-e2e");
    await admin.from("posts").insert({ author_id: author.id, slug: `seed-${Date.now()}`, title: "Mess waste tracker", body: "Tracks leftover food in the hostel mess to reduce food waste.", category: "projects", visibility: "college" });
    const page = await (await browser.newContext()).newPage();
    await login(page, owner.email);
    await page.getByLabel("Start a post").click();
    await expect(page.getByTestId("ai-assist")).toBeVisible();
    // AI controls stay disabled until there is enough text to work with
    await expect(page.getByRole("button", { name: "Suggest tags" })).toBeDisabled();

    const draft = "I want to build an AI system that helps reduce food waste in college hostels by predicting meal demand.";
    await page.getByLabel("Post text").fill(draft);
    await page.getByRole("button", { name: "Suggest tags" }).click();
    await expect(page.getByRole("region", { name: "Hashtag ideas" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/AI suggestion, review before using/).first()).toBeVisible();
    // the draft is untouched until the member clicks a tag
    await expect(page.getByLabel("Post text")).toHaveValue(draft);
    await page.getByRole("region", { name: "Hashtag ideas" }).getByRole("button", { name: /^#/ }).first().click();
    await expect(page.getByLabel("Post text")).toHaveValue(new RegExp(`^${draft.slice(0, 20)}.*#\\w+`));

    await page.getByRole("group", { name: "Post type" }).getByRole("button", { name: "Idea" }).click();
    await page.getByRole("button", { name: "Find related work" }).click();
    await expect(page.getByRole("region", { name: "Related work on your campus" })).toBeVisible({ timeout: 40_000 });
    await expect(page.getByRole("region", { name: "Related work on your campus" }).getByText("Mess waste tracker").first()).toBeVisible();
    await expect(page.getByText(/Matched by keywords/)).toBeVisible();
  });

  test("members can switch AI assist off in privacy settings and the controls disappear", async ({ browser }) => {
    const page = await (await browser.newContext()).newPage();
    await login(page, joiner.email);
    await page.goto("/settings/privacy");
    await page.waitForLoadState("networkidle");
    await page.getByRole("switch", { name: "Allow AI assist" }).click();
    await page.getByRole("button", { name: "Save privacy settings" }).click();
    await expect(page.getByText("Privacy settings saved.")).toBeVisible();
    await page.goto("/feed");
    await page.getByLabel("Start a post").click();
    await expect(page.getByText("AI assist is turned off in your privacy settings.")).toBeVisible();
    await expect(page.getByTestId("ai-assist")).toHaveCount(0);
  });
});
