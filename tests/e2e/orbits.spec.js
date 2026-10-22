import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { GREENFIELD, PASSWORD, admin, cleanupUsers, createUser, grantRoleDirect } from "../helpers/supabase.js";

/**
 * Orbits in the real application: claiming the daily bonus, answering the challenge (and what the page reveals before
 * that), the leaderboard, badges and the Orbit Card, privacy, administration, and phone layout. One login per person.
 */

const tag = Math.random().toString(36).slice(2, 7);
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const EXPLANATION = `Because ${tag} is the clearly documented answer in this test.`;
let member, viewer, gadmin, questionId;
const sessions = {};

async function login(browser, user) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await go(page, "/login");
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
// A streamed page briefly holds a hidden copy of its content; waiting for the network to settle keeps strict locators honest.
const go = async (page, path) => {
  const res = await page.goto(path);
  await page.waitForLoadState("networkidle");
  return res;
};
const ledgerTotal = async (u) => ((await admin.from("orbit_ledger").select("amount").eq("user_id", u.id)).data ?? []).reduce((s, r) => s + r.amount, 0);

test.describe.serial("Orbits", () => {
  test.setTimeout(120_000);

  test.beforeAll(async ({ browser }) => {
    await admin.from("orbit_questions").delete().gte("publish_date", today());
    member = await createUser("orbe-member");
    viewer = await createUser("orbe-viewer");
    gadmin = await createUser("orbe-gadmin");
    await grantRoleDirect(gadmin.id, "global_admin");
    questionId = (await admin.from("orbit_questions").insert({ question: `Which of these is the answer for ${tag}?`, options: ["Alpha", "Bravo", "Charlie", "Delta"], correct_index: 1, explanation: EXPLANATION, category: "general", publish_date: today(), status: "published" }).select("id").single()).data.id;
    sessions.member = await login(browser, member);
    sessions.viewer = await login(browser, viewer);
    sessions.gadmin = await login(browser, gadmin);
  });
  test.afterAll(async () => {
    await admin.from("orbit_questions").delete().gte("publish_date", today());
    await cleanupUsers();
  });

  test("the Daily Orbit Bonus is claimed once, and the new balance is the server's", async ({ browser }) => {
    const { context, page } = await as(browser, "member");
    await go(page, "/orbits");
    await expect(page.getByRole("heading", { name: "Orbits", level: 1 })).toBeVisible();
    await expect(page.getByTestId("orbit-balance")).toHaveText("0");
    const claim = page.getByRole("button", { name: "Claim" });
    await expect(claim).toBeEnabled();
    await expect(page.getByText("+5 Orbits").first()).toBeVisible(); // the reward is shown before it is claimed

    // keyboard: focus the button and press Enter; a second activation cannot pay again
    await claim.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("You earned +5 Orbits!").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Claimed" })).toBeDisabled();
    await expect(page.getByTestId("orbit-balance")).toHaveText("5", { timeout: 15_000 });
    expect((await admin.from("orbit_ledger").select("id").eq("user_id", member.id).eq("kind", "checkin")).data).toHaveLength(1);

    // another tab or device sees it already claimed
    const second = await context.newPage();
    await go(second, "/orbits");
    await expect(second.getByRole("button", { name: "Claimed" })).toBeDisabled();
    await context.close();
  });

  test("the page never contains the answer key or explanation before the member answers", async ({ browser }) => {
    const { context, page } = await as(browser, "viewer");
    const html = await (await page.request.get("/orbits")).text();
    expect(html).toContain(`Which of these is the answer for ${tag}?`);
    expect(html).not.toContain(EXPLANATION);
    expect(html).not.toContain("correct_index");
    await go(page, "/orbits");
    await expect(page.getByRole("radio")).toHaveCount(4);
    await context.close();
  });

  test("the Daily Challenge: keyboard selection, a wrong answer, the explanation and the Orbit breakdown", async ({ browser }) => {
    const { context, page } = await as(browser, "member");
    await go(page, "/orbits");
    const submit = page.getByRole("button", { name: "Submit answer" });
    await expect(submit).toBeDisabled();
    await page.getByRole("radio", { name: "Alpha" }).focus();
    await page.keyboard.press("ArrowDown"); // Bravo
    await page.keyboard.press("ArrowDown"); // Charlie
    await expect(page.getByRole("radio", { name: "Charlie" })).toHaveAttribute("aria-checked", "true");
    await submit.click();
    const result = page.getByRole("status").filter({ hasText: "Not quite." });
    await expect(result).toBeVisible({ timeout: 15_000 });
    await expect(result).toContainText(EXPLANATION);
    await expect(result).toContainText("Participation +5");
    // the right answer is marked in words, not just colour
    await expect(page.getByRole("radio", { name: /Bravo/ })).toContainText("Correct");
    await expect(page.getByRole("radio", { name: /Charlie/ })).toContainText("Your answer");
    await expect(page.getByRole("radio", { name: "Alpha" })).toBeDisabled();
    // a refresh shows the same recorded answer, and nothing is paid twice
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("status").filter({ hasText: "Not quite." })).toBeVisible();
    expect((await admin.from("orbit_ledger").select("id").eq("user_id", member.id).eq("kind", "challenge_participation")).data).toHaveLength(1);
    expect((await admin.from("orbit_ledger").select("id").eq("user_id", member.id).eq("kind", "challenge_correct")).data).toHaveLength(0);
    await expect(page.getByTestId("orbit-streak")).toContainText("1 day");
    await context.close();
  });

  test("a correct answer pays the bonus and unlocks a badge", async ({ browser }) => {
    const { context, page } = await as(browser, "viewer");
    await go(page, "/orbits");
    await page.getByRole("radio", { name: "Bravo" }).click();
    await page.getByRole("button", { name: "Submit answer" }).click();
    await expect(page.getByText("Correct answer!").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("correct answer +5")).toBeVisible();
    expect(await ledgerTotal(viewer)).toBe(15); // 5 + 5, plus the First Challenge badge bonus
    await go(page, "/orbits/achievements");
    const tile = page.locator('li[data-earned="true"]', { hasText: "First Challenge" });
    await expect(tile).toBeVisible();
    await expect(page.locator('li[data-earned="false"]', { hasText: "Challenge Master" })).toContainText("Locked");
    await context.close();
  });

  test("the leaderboard shows the member's real rank, and switches scope without a reload", async ({ browser }) => {
    const { context, page } = await as(browser, "viewer");
    await go(page, "/orbits");
    const board = page.getByRole("region", { name: "Leaderboard" });
    await expect(board.getByText(/Your rank:/)).toBeVisible();
    await expect(board.getByRole("img", { name: /Rank 1/ }).first()).toBeVisible(); // the 1st-place award artwork
    await board.getByRole("tab", { name: "Connections" }).click();
    await expect(board.getByRole("tab", { name: "Connections" })).toHaveAttribute("aria-selected", "true");
    await expect(board.getByText(/Your rank:|Connect with people/)).toBeVisible();
    await board.getByRole("tab", { name: "My college" }).click();
    await expect(board.getByText(/Your rank:/)).toBeVisible();
    // the switch really loaded that board (the member is on it) and did not trip the error page
    await expect(board.getByRole("list", { name: "Leaderboard" }).getByText("(you)")).toBeVisible();
    await expect(page.getByRole("heading", { name: /something went wrong/i })).toHaveCount(0);
    await expect(board.getByRole("alert")).toHaveCount(0);
    await go(page, "/orbits/leaderboard?scope=global&period=weekly");
    await expect(page.getByRole("navigation", { name: "Leaderboard scope" }).getByRole("link", { name: "Global" })).toHaveAttribute("aria-current", "true");
    await expect(page.getByText("In progress:")).toBeVisible();
    await expect(page.getByText(`@${viewer.username}`)).toBeVisible();
    await context.close();
  });

  test("an Orbit Card previews real data and downloads a 1080 x 1920 PNG, and nothing is shared automatically", async ({ browser }) => {
    const { context, page } = await as(browser, "viewer");
    await go(page, "/orbits/leaderboard?scope=global&period=weekly");
    await page.getByRole("button", { name: "Share this rank" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/is \d+(st|nd|rd|th) on the global leaderboard on UniSphere/)).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Download" })).toBeEnabled({ timeout: 15_000 });
    const preview = dialog.getByRole("img", { name: /Preview:/ });
    await expect(preview).toHaveAccessibleName(/on the global leaderboard/);
    const [download] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Download" }).click()]);
    expect(download.suggestedFilename()).toMatch(/\.png$/);
    const bytes = readFileSync(await download.path());
    expect(bytes.subarray(1, 4).toString()).toBe("PNG");
    expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([1080, 1920]);
    await dialog.getByRole("radio", { name: "Square 1:1" }).click();
    await expect.poll(() => page.evaluate(() => [document.querySelector("canvas").width, document.querySelector("canvas").height])).toEqual([1080, 1080]);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await context.close();
  });

  test("the profile shows Orbits as the owner allows, and privacy choices are enforced", async ({ browser }) => {
    const { context, page } = await as(browser, "member");
    await go(page, `/u/${viewer.username}`);
    await expect(page.getByRole("heading", { name: "Orbits", level: 2 })).toBeVisible();
    await expect(page.getByText("Orbit Balance").first()).toBeVisible();
    await expect(page.getByRole("img", { name: "First Challenge" })).toBeVisible();
    await go(page, `/u/${viewer.username}/orbits`);
    await expect(page.getByRole("heading", { name: "Orbit achievements" })).toBeVisible();

    // the owner hides everything: the other member's view loses the balance and the badges
    const own = await as(browser, "viewer");
    await go(own.page, "/settings/privacy");
    await own.page.locator("details#orbits > summary").click(); // the Orbits card is folded until opened
    await own.page.getByLabel("Show my Orbit Balance on my profile").click();
    await own.page.getByLabel("Show my badges and streak").click();
    await own.page.getByLabel("Appear on Orbit leaderboards").click();
    await own.page.getByRole("button", { name: "Save Orbits privacy" }).click();
    await expect(own.page.getByText("Orbits privacy saved.")).toBeVisible();
    await go(page, `/u/${viewer.username}`);
    await expect(page.getByText("Orbit Balance")).toHaveCount(0);
    await expect(page.getByRole("img", { name: "First Challenge" })).toHaveCount(0);
    await go(page, `/u/${viewer.username}/orbits`);
    await expect(page.getByText("keeps their badges private")).toBeVisible();
    await go(page, "/orbits/leaderboard?scope=global&period=alltime");
    await expect(page.getByText(`@${viewer.username}`)).toHaveCount(0);
    // and the owner still sees their own numbers
    await go(own.page, "/orbits");
    await expect(own.page.getByTestId("orbit-balance")).toHaveText("15");
    await own.context.close();
    await context.close();
  });

  test("a member cannot reach the Orbits admin tools, and an administrator creates a question that members never see early", async ({ browser }) => {
    const m = await as(browser, "member");
    await go(m.page, "/admin/orbits");
    await expect(m.page).toHaveURL(/forbidden/);
    await m.context.close();

    const { context, page } = await as(browser, "gadmin");
    await go(page, "/admin/orbits/questions");
    await page.getByRole("button", { name: "New question" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Question", { exact: true }).fill(`Which keyword declares a constant in JavaScript? ${tag}`);
    for (const [i, text] of ["var", "let", "const", "def"].entries()) await dialog.getByRole("textbox", { name: `Answer ${"ABCD"[i]}`, exact: true }).fill(text);
    await dialog.getByLabel("Answer C is correct").check();
    await dialog.getByLabel("Explanation shown after answering").fill("const declares a binding that cannot be reassigned.");
    const future = new Date(Date.now() + 40 * 86_400_000).toLocaleDateString("en-CA");
    await dialog.getByLabel("Date (IST)").fill(future);
    await dialog.getByLabel("Status").selectOption("scheduled");
    await dialog.getByRole("button", { name: "Save question" }).click();
    await expect(dialog.getByRole("alert")).toHaveCount(0);
    await expect(dialog).toHaveCount(0, { timeout: 15_000 }); // saved: the dialog closes
    await expect(page.getByRole("table", { name: "Daily questions" })).toContainText(`Which keyword declares a constant in JavaScript? ${tag}`);
    const found = await admin.from("orbit_questions").select("correct_index, status, reviewed_by, question").like("question", `%${tag}`);
    expect(found.error, JSON.stringify(found.error)).toBeNull();
    expect(found.data, JSON.stringify(found.data)).toHaveLength(1);
    const saved = found.data[0];
    expect(saved).toMatchObject({ correct_index: 2, status: "scheduled", reviewed_by: gadmin.id });
    expect((await admin.from("audit_logs").select("action").eq("actor_id", gadmin.id).eq("action", "orbits.question_saved")).data.length).toBeGreaterThan(0);

    // a duplicate date is refused with a clear message
    await page.getByRole("button", { name: "New question" }).click();
    const again = page.getByRole("dialog");
    await again.getByLabel("Question", { exact: true }).fill(`Another question for the same day? ${tag}`);
    for (const [i, text] of ["w", "x", "y", "z"].entries()) await again.getByRole("textbox", { name: `Answer ${"ABCD"[i]}`, exact: true }).fill(text);
    await again.getByLabel("Explanation shown after answering").fill("A second question cannot take the same date.");
    await again.getByLabel("Date (IST)").fill(future);
    await again.getByLabel("Status").selectOption("scheduled");
    await again.getByRole("button", { name: "Save question" }).click();
    await expect(again.getByText("Another question is already scheduled for that date.")).toBeVisible({ timeout: 15_000 });
    await context.close();
  });

  test("the ledger page and a documented correction work, with a reason and an audit entry", async ({ browser }) => {
    const { context, page } = await as(browser, "gadmin");
    await go(page, `/admin/orbits/ledger?user=${member.username}`);
    await expect(page.getByRole("table", { name: "Ledger" })).toContainText("Daily Orbit Bonus");
    await page.getByLabel("Member ID").fill(member.id);
    await page.getByLabel("Orbits (negative takes away)").fill("-3");
    const apply = page.getByRole("button", { name: "Apply correction" });
    await expect(apply).toBeDisabled(); // a reason is required
    await page.getByLabel("Reason (kept in the ledger and audit log)").fill("Test of the correction tool");
    await apply.click();
    await expect.poll(async () => (await admin.from("orbit_balances").select("balance").eq("user_id", member.id).single()).data.balance).toBe(12); // 5 bonus + 5 participation + 5 badge bonus - 3
    expect((await admin.from("audit_logs").select("action").eq("target_id", member.id).eq("action", "orbits.manual_adjustment")).data).toHaveLength(1);
    await go(page, "/admin/orbits/seasons");
    await expect(page.getByRole("heading", { name: "Orbit seasons" })).toBeVisible();
    await context.close();
  });

  test("every Orbits page fits a 360 px phone, and with reduced motion nothing keeps animating", async ({ browser }) => {
    const { context, page } = await as(browser, "member", { viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
    for (const path of ["/orbits", "/orbits/leaderboard", "/orbits/achievements", "/orbits/learning", "/orbits/history", `/u/${member.username}/orbits`]) {
      const res = await go(page, path);
      expect(res.status(), path).toBeLessThan(400);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(1);
    }
    await go(page, "/orbits");
    // priorities on a phone: the challenge and daily bonus come before the balance and the leaderboard
    const order = await page.evaluate(() => [...document.querySelectorAll("main section[aria-label]")].map((s) => s.getAttribute("aria-label")));
    expect(order.indexOf("Daily Challenge")).toBeLessThan(order.indexOf("Orbit Balance"));
    expect(order.indexOf("Orbit Streak")).toBeLessThan(order.indexOf("Leaderboard"));
    const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running" && a.effect?.getTiming().iterations === Infinity).map((a) => a.animationName ?? "unnamed"));
    expect(running).toEqual([]);
    await context.close();
  });
});
