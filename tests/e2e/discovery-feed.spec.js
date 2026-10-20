import { test, expect } from "@playwright/test";
import { admin, cleanupUsers, createUser, PASSWORD } from "../helpers/supabase.js";

/**
 * The composer's @ and # suggestions, and the personalised "For you" feed, in the real application.
 * Typed into the real composer, selected with the real keyboard; nothing is stubbed.
 */

const run = Date.now().toString(36);
const TOPIC = `rbt${run}`;
let me, friend, author;
let matchPost, otherPost;
let session; // one login for the whole file (the login endpoint is rate limited)

async function signedIn(browser) {
  const context = await browser.newContext({ storageState: session });
  const page = await context.newPage();
  await page.goto("/feed");
  return page;
}

async function login(page, email) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/feed/, { timeout: 30_000 });
}

async function seedPost(authorId, row) {
  const { data, error } = await admin
    .from("posts")
    .insert({ author_id: authorId, slug: `e2e-${Math.random().toString(36).slice(2, 10)}`, visibility: "public", ...row })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

test.describe.serial("composer suggestions and the For you feed", () => {
  test.setTimeout(120_000);

  test.beforeAll(async ({ browser }) => {
    await admin.from("posts").delete().or("title.like.Filler %,title.like.Long read %"); // leftovers of an earlier interrupted run
    me = await createUser("disc-me");
    friend = await createUser(`zq${run.slice(-4)}`);
    author = await createUser("disc-author");
    matchPost = await seedPost(author.id, { category: "projects", title: `Building a ${TOPIC} arm`, body: `We are building a ${TOPIC} arm for the lab and need people who like electronics. `.repeat(3) });
    otherPost = await seedPost(friend.id, { category: "general", title: `Hostel notice about water ${TOPIC}x`, body: "The water will be off on Sunday morning for maintenance, please plan ahead and store enough. ".repeat(2) });
    // a public tag that exists in the database, to be suggested
    const { data: tag } = await admin.from("hashtags").upsert({ tag: `${TOPIC}tag` }, { onConflict: "tag" }).select("id").single();
    await admin.from("post_hashtags").insert({ post_id: matchPost, hashtag_id: tag.id });
    const context = await browser.newContext();
    await login(await context.newPage(), me.email);
    session = await context.storageState();
    await context.close();
  });
  test.afterAll(async () => {
    // also the posts this file seeds inside tests, so a failed test cannot leave fresh posts that crowd later runs
    await admin.from("posts").delete().eq("author_id", author.id);
    await admin.from("posts").delete().in("id", [matchPost, otherPost].filter(Boolean));
    await cleanupUsers();
  });

  test("typing @ in the composer lists people, and Enter inserts the mention at the caret", async ({ browser }) => {
    const page = await signedIn(browser);
    await page.locator('[aria-label="Start a post"]:visible').click();
    const body = page.getByLabel("Post text");
    await expect(body).toBeFocused();

    await body.fill("Thanks  for the help");
    // put the caret between the two spaces: "Thanks |" + " for the help"
    await body.evaluate((el) => el.setSelectionRange(7, 7));
    await body.pressSequentially(`@${friend.username.slice(0, 6)}`);
    const option = page.getByRole("option", { name: new RegExp(`@${friend.username}`) });
    await expect(option).toBeVisible();
    await page.keyboard.press("Enter");

    // the suggestion replaces the typed word and takes over one of the two spaces: no double space is left behind
    await expect(body).toHaveValue(`Thanks @${friend.username} for the help`);
    const caret = await body.evaluate((el) => el.selectionStart);
    expect(caret).toBe(`Thanks @${friend.username} `.length);
    await expect(page.getByRole("listbox")).toHaveCount(0);
  });

  test("backspacing to the @ reopens suggestions, and Escape closes only the list", async ({ browser }) => {
    const page = await signedIn(browser);
    await page.locator('[aria-label="Start a post"]:visible').click();
    const body = page.getByLabel("Post text");
    await body.pressSequentially(`hi @${friend.username.slice(0, 6)}`);
    await expect(page.getByRole("option", { name: new RegExp(`@${friend.username}`) })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toBeVisible(); // the editor is still open, the draft untouched
    await expect(body).toHaveValue(`hi @${friend.username.slice(0, 6)}`);
    await page.keyboard.press("Backspace");
    await expect(page.getByRole("option", { name: new RegExp(`@${friend.username}`) })).toBeVisible();
  });

  test("an email address is not a mention", async ({ browser }) => {
    const page = await signedIn(browser);
    await page.locator('[aria-label="Start a post"]:visible').click();
    await page.getByLabel("Post text").pressSequentially(`write to ${friend.username.slice(0, 4)}@example.com`);
    await expect(page.getByRole("listbox")).toHaveCount(0);
  });

  test("typing # suggests an existing public tag, and arrow keys + Enter insert it", async ({ browser }) => {
    const page = await signedIn(browser);
    await page.locator('[aria-label="Start a post"]:visible').click();
    const body = page.getByLabel("Post text");
    await body.pressSequentially(`I love #${TOPIC}`);
    const existing = page.getByRole("option", { name: new RegExp(`#${TOPIC}tag`) });
    await expect(existing).toBeVisible();
    // the best existing match is first, so Enter completes it without moving the highlight
    await expect(existing).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Enter");
    await expect(body).toHaveValue(`I love #${TOPIC}tag `);
  });

  test("a hashtag typed in the middle of a sentence is completed in place", async ({ browser }) => {
    const page = await signedIn(browser);
    await page.locator('[aria-label="Start a post"]:visible').click();
    const body = page.getByLabel("Post text");
    await body.fill("Join us  tonight");
    await body.evaluate((el) => el.setSelectionRange(8, 8));
    await body.pressSequentially(`#${TOPIC}t`);
    await expect(page.getByRole("option", { name: new RegExp(`#${TOPIC}tag`) })).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(body).toHaveValue(`Join us #${TOPIC}tag tonight`);
  });

  test("comments suggest people too", async ({ browser }) => {
    const page = await signedIn(browser);
    await page.goto(`/posts/${(await admin.from("posts").select("slug").eq("id", otherPost).single()).data.slug}`);
    await page.getByLabel("Write a comment").pressSequentially(`@${friend.username.slice(0, 6)}`);
    await expect(page.getByRole("option", { name: new RegExp(`@${friend.username}`) })).toBeVisible();
  });

  test("For you is the default feed and shows posts with no interests or history", async ({ browser }) => {
    const page = await signedIn(browser);
    await expect(page.getByRole("navigation", { name: "Whose posts" }).getByRole("link", { name: "For you" })).toHaveAttribute("aria-current", "true");
    // Which posts land on page one is the ranking's business (the unit tests cover it); a member with no signals still gets a feed.
    await expect(page.getByRole("article").first()).toBeVisible();
    expect(await page.getByRole("article").count()).toBeGreaterThan(1);
  });

  test("choosing interests puts matching posts first and says why; 'show less' hides a post for good", async ({ browser }) => {
    const page = await signedIn(browser);
    await page.getByRole("button", { name: "Tune your feed" }).click();
    // two interests, one unique word per seeded post (by two different authors: the same author twice is penalised for variety), so both rank to the top whatever else is in a shared database
    for (const term of [TOPIC, `${TOPIC}x`]) {
      await page.getByLabel("Add an interest").fill(term);
      await page.getByRole("button", { name: "Add", exact: true }).click();
      await expect(page.getByRole("list", { name: "Your interests" })).toContainText(term);
    }
    await page.keyboard.press("Escape");
    // closing the popover re-ranks the feed
    const project = page.getByRole("article", { name: new RegExp(`Building a ${TOPIC} arm`) });
    await expect(project).toContainText(`Matches your interest in ${TOPIC}`, { timeout: 15_000 });
    expect(await page.getByRole("article").first().textContent()).toMatch(/Matches your interest in/);

    const notice = page.getByRole("article", { name: /Hostel notice about water/ });
    await expect(notice).toContainText(`Matches your interest in ${TOPIC}x`);
    await notice.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Show less like this" }).click();
    await expect(notice).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("article", { name: /Hostel notice about water/ })).toHaveCount(0);
    // private to this member
    const { data } = await admin.from("post_feedback").select("user_id").eq("post_id", otherPost);
    expect(data.map((r) => r.user_id)).toEqual([me.id]);
  });

  test("turning personalisation off ignores the interest", async ({ page }) => {
    await admin.from("profiles").update({ personalize_feed: false }).eq("id", me.id);
    await login(page, me.email);
    await expect(page.getByRole("article").first()).not.toContainText("Matches your interest");
    await admin.from("profiles").update({ personalize_feed: true }).eq("id", me.id);
  });

  test("pages already scrolled through come back when returning to the feed, and logging out wipes them", async ({ browser }) => {
    // Seed enough visible posts for a second page.
    const ids = [];
    for (let i = 0; i < 20; i++) ids.push(await seedPost(author.id, { category: "general", title: `Filler ${run} ${i}`, body: `Filler post number ${i} with enough words to count as a real post for the feed. `.repeat(2), created_at: new Date(Date.now() - (i + 5) * 60_000).toISOString() }));
    // its own login: logging out must not end the session the other tests share
    const own = await browser.newContext();
    const page = await own.newPage();
    await login(page, me.email);
    await expect(page.getByRole("article").first()).toBeVisible();
    const firstPage = await page.getByRole("article").count();
    const more = page.getByRole("button", { name: "Load more" });
    await more.scrollIntoViewIfNeeded();
    await more.click();
    await expect.poll(() => page.getByRole("article").count()).toBeGreaterThan(firstPage);
    const loaded = await page.getByRole("article").count();
    await page.waitForTimeout(1200); // the copy on the device is written shortly after the page loads

    await page.goto("/notifications");
    await page.goto("/feed");
    await expect.poll(() => page.getByRole("article").count(), { timeout: 15_000 }).toBeGreaterThanOrEqual(loaded);

    await page.getByRole("button", { name: "Open account menu" }).click();
    await page.getByRole("menuitem", { name: /Log out/ }).click();
    await expect(page).not.toHaveURL(/\/feed/, { timeout: 20_000 }); // logging out leaves the app (to the home page)
    await expect.poll(async () => (await page.evaluate(() => indexedDB.databases())).map((d) => d.name)).not.toContain("unisphere-feed");
    await admin.from("posts").delete().in("id", ids);
    await own.close();
  });

  test("a long post can be summarised on request, and an AI failure leaves the post and feed untouched", async ({ browser }) => {
    const long = await seedPost(author.id, { category: "general", title: `Long read ${run}`, body: "The student council met to plan the annual technical festival, budget, sponsors, volunteers and the schedule. ".repeat(8) });
    const page = await signedIn(browser);
    await page.goto("/feed?scope=college");
    const card = page.getByRole("article", { name: new RegExp(`Long read ${run}`) });
    await expect(card).toBeVisible();
    const button = card.getByRole("button", { name: /Summarize with AI/ });
    if (!(await button.count())) test.skip(true, "AI assist is not enabled in this environment");
    await button.click();
    // Either a labelled summary, or a calm message with a retry: never a broken page.
    await expect(card.getByRole("region", { name: "AI summary" }).or(card.getByRole("alert")).first()).toBeVisible({ timeout: 45_000 });
    await expect(card.getByText(`The student council met`).first()).toBeVisible(); // the original text is still there
    await expect(page.locator('[aria-label="Start a post"]:visible')).toBeVisible();
    await admin.from("posts").delete().eq("id", long);
  });

  test("on a phone nothing scrolls sideways and the editor fills the screen", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, storageState: session });
    const page = await context.newPage();
    await page.goto("/feed");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.locator('[aria-label="Start a post"]:visible').click();
    const box = await page.getByRole("dialog").boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(359);
    expect(box.height).toBeGreaterThanOrEqual(735);
    const post = await page.getByRole("button", { name: "Post", exact: true }).boundingBox();
    expect(post.y + post.height).toBeLessThanOrEqual(741);
    await context.close();
  });
});
