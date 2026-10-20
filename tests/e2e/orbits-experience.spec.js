import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PASSWORD, admin, cleanupUsers, createUser } from "../helpers/supabase.js";

/**
 * Orbits as part of the whole product: the header pill, the feed widget and strip, navigation, and the celebrations. The
 * numbers on screen are compared with the database, a reward is only celebrated once, and nothing moves for people who
 * ask for reduced motion.
 */

const tag = Math.random().toString(36).slice(2, 7);
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
let claimer, solver, calm;
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
const go = async (page, path) => {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
};
const balanceOf = async (u) => ((await admin.from("orbit_ledger").select("amount").eq("user_id", u.id)).data ?? []).reduce((s, r) => s + r.amount, 0);
const confetti = (page) => page.locator("body > canvas[aria-hidden='true']");
// null when the page fits; otherwise the elements sticking out (so a failure says which)
const sideScroll = (page) =>
  page.evaluate(() => {
    const W = window.innerWidth;
    if (document.documentElement.scrollWidth <= W + 1) return null;
    const out = [];
    document.querySelectorAll("body *").forEach((e) => {
      const b = e.getBoundingClientRect();
      if (b.right <= W + 1 || b.width === 0) return;
      for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) if (getComputedStyle(p).overflowX !== "visible") return;
      out.push(`${e.tagName}.${String(e.className).slice(0, 70)} right=${Math.round(b.right)}`);
    });
    return out.slice(0, 6);
  });

test.describe.serial("Orbits across the app", () => {
  test.setTimeout(120_000);

  test.beforeAll(async ({ browser }) => {
    await admin.from("orbit_questions").delete().gte("publish_date", today());
    claimer = await createUser("orbx-claimer");
    solver = await createUser("orbx-solver");
    calm = await createUser("orbx-calm");
    await admin.from("orbit_questions").insert({ question: `Which one is right for ${tag}?`, options: ["Alpha", "Bravo", "Charlie", "Delta"], correct_index: 1, explanation: `Because ${tag}.`, category: "general", publish_date: today(), status: "published" });
    sessions.claimer = await login(browser, claimer);
    sessions.solver = await login(browser, solver);
    sessions.calm = await login(browser, calm);
  });
  test.afterAll(async () => {
    await admin.from("orbit_questions").delete().gte("publish_date", today());
    await cleanupUsers();
  });

  test("a wide screen shows the header pill and the sidebar widget with the member's real numbers, and claiming updates both without a reload", async ({ browser }) => {
    const { context, page } = await as(browser, "claimer", { viewport: { width: 1440, height: 900 } });
    await go(page, "/feed");
    const pill = page.getByTestId("orbit-pill");
    const widget = page.getByRole("region", { name: "Your Orbits" });
    await expect(widget).toBeVisible();
    await expect(page.getByRole("region", { name: "Your Orbits today" })).toBeHidden(); // the strip is for screens without the sidebar
    await expect(pill).toHaveAccessibleName(/Orbits, 0 Orbits, daily bonus ready/);
    await expect(widget.getByTestId("widget-orbit-balance")).toHaveText("0");
    await expect(widget.getByRole("link", { name: /Answer today.s challenge/ })).toHaveCount(0); // the bonus comes first

    const claim = widget.getByRole("button", { name: "Claim +5 Orbits" });
    await claim.click();
    await expect(confetti(page)).toHaveCount(1, { timeout: 5000 }); // a confirmed claim, and only that, celebrates
    await expect(widget.getByTestId("widget-orbit-balance")).toHaveText("5", { timeout: 15_000 });
    await expect(pill).toHaveAccessibleName(/Orbits, 5 Orbits/, { timeout: 15_000 });
    await expect(widget.getByRole("status")).toContainText("You earned +5 Orbits. Your balance is now 5.");
    await expect(widget.getByRole("button", { name: /Claim/ })).toHaveCount(0);
    // the state-aware action moves on to the challenge
    await expect(widget.getByRole("link", { name: /Answer today.s challenge/ })).toBeVisible();
    expect(await balanceOf(claimer)).toBe(5);
    expect((await admin.from("orbit_ledger").select("id").eq("user_id", claimer.id).eq("kind", "checkin")).data).toHaveLength(1);

    // a reload (or another tab) shows the same state and never celebrates again
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("region", { name: "Your Orbits" }).getByTestId("widget-orbit-balance")).toHaveText("5");
    await expect(confetti(page)).toHaveCount(0);
    await page.waitForTimeout(1200);
    await expect(confetti(page)).toHaveCount(0);

    // the widget links to real destinations
    await widget.getByRole("link", { name: /Answer today.s challenge/ }).click();
    await expect(page).toHaveURL(/\/orbits#challenge/);
    await context.close();
  });

  test("the sidebar entry is distinct, labelled, and the header pill opens the Orbits page", async ({ browser }) => {
    const { context, page } = await as(browser, "claimer", { viewport: { width: 1440, height: 900 } });
    await go(page, "/feed");
    const side = page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: /Orbits/ });
    await expect(side).toHaveAttribute("title", /Orbits/);
    await expect(side.locator("svg").first()).toBeAttached(); // the orbital ring
    await page.getByTestId("orbit-pill").click();
    await expect(page).toHaveURL(/\/orbits$/);
    await expect(page.getByTestId("orbit-pill")).toHaveAttribute("aria-current", "page");
    await context.close();
  });

  test("a tablet and a phone get the compact strip instead of the widget, and nothing makes the page scroll sideways", async ({ browser }) => {
    for (const viewport of [{ width: 900, height: 900 }, { width: 390, height: 844 }, { width: 360, height: 740 }]) {
      const { context, page } = await as(browser, "claimer", { viewport });
      await go(page, "/feed");
      const strip = page.getByRole("region", { name: "Your Orbits today" });
      await expect(strip).toBeVisible();
      await expect(page.getByRole("region", { name: "Your Orbits", exact: true })).toBeHidden();
      await expect(strip.getByTestId("strip-orbit-balance")).toHaveText("5");
      expect(await sideScroll(page), `${viewport.width}px`).toBeNull();
      // the header keeps a usable search box next to the pill
      const search = await page.getByLabel("Search UniSphere").boundingBox();
      expect(search.width).toBeGreaterThan(viewport.width < 400 ? 90 : 150);
      await expect(page.getByTestId("orbit-pill")).toBeVisible();
      if (viewport.width === 390) {
        // the "next step" card is state-aware: the bonus is claimed, so it points to the challenge
        await expect(strip.getByRole("link", { name: /Daily Challenge/ })).toBeVisible();
        // phone navigation: More shows Orbits with the balance first
        await page.getByRole("navigation", { name: "Quick navigation" }).getByRole("button", { name: /More/ }).click();
        const sheet = page.getByRole("dialog");
        await expect(sheet.getByRole("link", { name: /Orbits.*5/ }).first()).toBeVisible();
        await page.keyboard.press("Escape");
      }
      await context.close();
    }
  });

  test("a correct answer shows one celebration for the new badge, with its real name and criteria, and a reload never repeats it", async ({ browser }) => {
    const { context, page } = await as(browser, "solver", { viewport: { width: 1440, height: 900 } });
    await go(page, "/orbits");
    await page.getByRole("radio", { name: "Bravo" }).click();
    await page.getByRole("button", { name: "Submit answer" }).click();
    await expect(page.getByText("Correct answer!").first()).toBeVisible({ timeout: 15_000 });

    const card = page.getByTestId("achievement-celebration");
    await expect(card).toBeVisible({ timeout: 15_000 });
    const earned = (await admin.from("orbit_user_achievements").select("achievement_id, celebrated_at, orbit_achievements(title, description)").eq("user_id", solver.id)).data;
    expect(earned.length).toBeGreaterThan(0);
    await expect(card).toContainText("New badge unlocked");
    await expect(card).toContainText(earned[0].orbit_achievements.title);
    await expect(card).toContainText(earned[0].orbit_achievements.description);
    await expect(card.getByRole("button", { name: "Share achievement" })).toBeVisible();
    expect(earned.every((e) => e.celebrated_at)).toBe(true); // marked as seen the moment it was taken

    // the card does not trap the page: it can be dismissed, and the app keeps working
    await card.getByRole("button", { name: "Dismiss" }).click();
    await expect(card).toHaveCount(0);

    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);
    await expect(page.getByTestId("achievement-celebration")).toHaveCount(0);
    await expect(confetti(page)).toHaveCount(0);
    await go(page, "/feed");
    await expect(page.getByTestId("achievement-celebration")).toHaveCount(0);
    await context.close();
  });

  test("two tabs cannot celebrate the same badge, because taking it is atomic in the database", async () => {
    const user = await createUser("orbx-atomic");
    const row = (await admin.from("orbit_achievements").select("id").eq("active", true).limit(1).single()).data;
    await admin.from("orbit_user_achievements").insert({ user_id: user.id, achievement_id: row.id });
    const { createClient } = await import("@supabase/supabase-js");
    const mk = async () => {
      const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
      await c.auth.signInWithPassword({ email: user.email, password: PASSWORD });
      return c;
    };
    const [a, b] = await Promise.all([mk(), mk()]);
    const [ra, rb] = await Promise.all([a.rpc("orbit_take_celebrations"), b.rpc("orbit_take_celebrations")]);
    expect(ra.data.length + rb.data.length).toBe(1);
    expect((await a.rpc("orbit_glance")).data.pending).toBe(0);
  });

  test("with reduced motion there is no confetti and no travelling lights, and the reward still works", async ({ browser }) => {
    const { context, page } = await as(browser, "calm", { viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    await go(page, "/feed");
    await expect(page.locator("animateMotion")).toHaveCount(0);
    await page.getByRole("region", { name: "Your Orbits" }).getByRole("button", { name: "Claim +5 Orbits" }).click();
    await expect(page.getByTestId("widget-orbit-balance")).toHaveText("5", { timeout: 15_000 });
    await expect(confetti(page)).toHaveCount(0);
    expect(await balanceOf(calm)).toBe(5);
    await context.close();
  });

  test("the widget, strip and header pill pass an accessibility scan", async ({ browser }) => {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const { context, page } = await as(browser, "claimer", { viewport });
      await go(page, "/feed");
      const results = await new AxeBuilder({ page }).include("[aria-label='Your Orbits'], [aria-label='Your Orbits today'], [data-testid='orbit-pill']").analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 120)}`), `${viewport.width}px`).toEqual([]);
      await context.close();
    }
  });
});
