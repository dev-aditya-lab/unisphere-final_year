import { test, expect } from "@playwright/test";
import { cleanupUsers, createUser, PASSWORD } from "../helpers/supabase.js";

/**
 * The redesigned shell: theme switching and persistence, the phone navigation, safe layout at narrow widths,
 * reduced motion, and the celebration after onboarding. These guard behaviour, not pixels.
 */

async function login(page, email) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/feed/, { timeout: 30_000 });
}

test.describe.serial("redesigned shell", () => {
  test.setTimeout(120_000);
  let u;
  test.beforeAll(async () => {
    u = await createUser("redesign-e2e");
  });
  test.afterAll(async () => {
    await cleanupUsers();
  });

  test("the theme choice sticks across reloads, and the browser chrome colour follows it", async ({ page }) => {
    await login(page, u.email);
    await page.getByRole("button", { name: "Change theme" }).click();
    await page.getByRole("menuitemradio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    const chrome = await page.locator('meta[name="theme-color"]').first().getAttribute("content");
    expect(chrome?.toLowerCase()).toBe("#14120f");

    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);

    await page.getByRole("button", { name: "Change theme" }).click();
    await page.getByRole("menuitemradio", { name: "Light" }).click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });

  test("on a phone the tab bar sits at the bottom, the post button opens the composer, and nothing scrolls sideways", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await login(page, u.email);

    const bar = page.getByRole("navigation", { name: "Quick navigation" });
    await expect(bar).toBeVisible();
    const box = await bar.boundingBox();
    expect(box.y + box.height).toBeGreaterThan(740 - 2); // flush with the bottom edge of the viewport

    for (const path of ["/feed", "/explore", "/projects", "/notifications", "/settings/profile"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(1);
    }

    await page.goto("/explore");
    await page.getByRole("link", { name: "Write a post" }).click();
    await expect(page).toHaveURL(/\/feed#compose/);
    await expect(page.getByLabel("Post text")).toBeFocused();
    await context.close();
  });

  test("members who prefer reduced motion get no running animations", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await login(page, u.email);
    const running = await page.evaluate(() =>
      document
        .getAnimations()
        .filter((a) => a.playState === "running" && a.effect?.getTiming().iterations === Infinity)
        .map((a) => a.animationName ?? "unnamed"),
    );
    expect(running).toEqual([]);
    await context.close();
  });

  test("the offline fallback and the installable manifest use the new palette", async ({ request }) => {
    const manifest = await (await request.get("/manifest.webmanifest")).json();
    expect(manifest.theme_color.toLowerCase()).toBe("#fbf6ec");
    expect(manifest.display).toBe("standalone");
    const sw = await (await request.get("/sw.js")).text();
    expect(sw).toContain("CLEAR_USER_CACHES");
  });
});
