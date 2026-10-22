import { test, expect } from "@playwright/test";
import { admin, cleanupUsers, createUser } from "../helpers/supabase.js";

/** The settings area on a phone: one menu, one section per page, folded cards, and nothing that scrolls sideways. */

const PAGES = ["profile", "security", "privacy", "notifications", "blue-tick"];
const overflowX = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe.serial("settings on a phone", () => {
  let user, page;
  test.use({ viewport: { width: 360, height: 740 } });

  test.beforeAll(async ({ browser }) => {
    user = await createUser("settings-e2e", { collegeId: null });
    page = await browser.newPage({ viewport: { width: 360, height: 740 } });
    await page.goto("/login");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill("Passw0rd!test-xyz");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
  });
  test.afterAll(async () => {
    await page?.close();
    await cleanupUsers();
  });

  test("the menu lists every area as a row, with no tab strip to scroll", async () => {
    await page.goto("/settings");
    for (const href of ["/settings/profile", "/settings/security", "/settings/privacy", "/privacy-requests", "/settings/notifications", "/settings/blue-tick"]) {
      await expect(page.locator(`a[href="${href}"]:visible`).first(), href).toBeVisible();
    }
    expect(await overflowX(page)).toBeLessThanOrEqual(0);
    await expect(page.getByRole("navigation", { name: "Settings" })).toBeHidden(); // the sidebar is for wide screens
  });

  test("every section opens from the menu, shows a way back and fits the screen", async () => {
    for (const section of PAGES) {
      await page.goto("/settings");
      await page.locator(`a[href="/settings/${section}"]:visible`).first().click();
      await expect(page).toHaveURL(new RegExp(`/settings/${section}$`));
      await expect(page.getByRole("link", { name: "Settings", exact: true })).toBeVisible();
      expect(await overflowX(page), section).toBeLessThanOrEqual(0);
    }
    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await expect(page).toHaveURL(/\/settings$/);
  });

  test("the profile starts short: Basics open, the rest folded, and the checklist opens what it points at", async () => {
    await page.goto("/settings/profile");
    await expect(page.locator("details#basics")).toHaveAttribute("open", "");
    for (const id of ["college", "skills", "collaboration", "links", "photo", "achievements"]) {
      await expect(page.locator(`details#${id}`), id).not.toHaveAttribute("open", "");
    }
    await page.getByRole("link", { name: "Link GitHub or a portfolio" }).click();
    await expect(page.locator("details#links")).toHaveAttribute("open", "");
  });

  test("a mistake inside a folded section opens it and takes you to the field", async () => {
    await page.goto("/settings/profile");
    await page.locator("details#links > summary").click();
    await page.getByLabel("GitHub").fill("not a link");
    await page.locator("details#links > summary").click(); // fold it again
    await expect(page.locator("details#links")).not.toHaveAttribute("open", "");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.locator("details#links")).toHaveAttribute("open", "");
    await expect(page.getByText("Enter a valid http(s) URL")).toBeVisible();
    await expect(page.getByLabel("GitHub")).toBeFocused();
  });

  test("privacy: 'My college' is unavailable without a college, and 'Only me' explains itself", async () => {
    await page.goto("/settings/privacy");
    await expect(page.getByRole("radio", { name: /My college/ })).toBeDisabled();
    await page.getByRole("radio", { name: /Only me/ }).click();
    await expect(page.getByRole("note")).toContainText("nobody else can open your profile");
    await page.getByRole("button", { name: "Save privacy settings" }).click();
    await expect(page.getByText("Privacy settings saved.")).toBeVisible();
    expect((await admin.from("profiles").select("visibility").eq("id", user.id).single()).data.visibility).toBe("private");
  });

  test("notifications: the moderation notice cannot be switched off", async () => {
    await page.goto("/settings/notifications");
    await expect(page.getByRole("switch", { name: /Moderation & account: in app, always on/ })).toBeDisabled();
    await expect(page.getByRole("switch", { name: "Messages: in app" })).toBeEnabled();
  });

  test("security: the dangerous action is folded away and says it deletes nothing by itself", async () => {
    await page.goto("/settings/security");
    await expect(page.locator("details#delete")).not.toHaveAttribute("open", "");
    await page.locator("details#delete > summary").click();
    await expect(page.getByText("Nothing is deleted by opening the next page.")).toBeVisible();
  });
});
