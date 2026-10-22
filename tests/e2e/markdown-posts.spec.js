import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { admin, cleanupUsers, createUser, PASSWORD } from "../helpers/supabase.js";

/**
 * Markdown in posts, in a real browser: the toolbar edits the selected words and keeps the selection, the preview is the published post,
 * hostile text published through the real composer stays inert in the feed and on the post page, an existing post can be edited with
 * the same tools, and it all fits a phone.
 */

const run = Math.random().toString(36).slice(2, 7);
let author, reader;
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
const openComposer = async (page) => {
  await page.goto("/feed");
  await page.waitForLoadState("networkidle");
  await page.locator('[aria-label="Start a post"]:visible').click();
  await expect(page.getByLabel("Post text")).toBeVisible();
};
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
/** Selects the first occurrence of `text` inside the Post text box, the way a person drags over it. */
const select = (page, text) =>
  page.getByLabel("Post text").evaluate((el, t) => {
    const i = el.value.indexOf(t);
    el.focus();
    el.setSelectionRange(i, i + t.length);
  }, text);
const selection = (page) => page.getByLabel("Post text").evaluate((el) => el.value.slice(el.selectionStart, el.selectionEnd));

test.describe.serial("Markdown posts", () => {
  test.setTimeout(120_000);
  const marker = `Notes ${run}`;

  test.beforeAll(async ({ browser }) => {
    [author, reader] = await Promise.all([createUser("e2e-md-a"), createUser("e2e-md-r")]);
    // members who already have a post are not shown the "write your first post" prompt, which would cover the page
    for (const u of [author, reader]) await admin.from("posts").insert({ author_id: u.id, body: `Seed post ${run} ${u.username}`, category: "general", visibility: "public", slug: `md-${run}-seed-${u.username.slice(-4)}`, status: "published" });
    sessions.author = await login(browser, author);
    sessions.reader = await login(browser, reader);
  });
  test.afterAll(async () => {
    await admin.from("posts").delete().like("body", `%${run}%`);
    await cleanupUsers();
  });

  test("the toolbar formats the selected words, keeps them selected, and toggles back", async ({ browser }) => {
    const { context, page } = await as(browser, "author");
    await openComposer(page);
    const box = page.getByLabel("Post text");
    await box.fill(`${marker} make this loud please`);
    await select(page, "this loud");
    await page.getByRole("button", { name: "Bold" }).click();
    await expect(box).toHaveValue(`${marker} make **this loud** please`);
    expect(await selection(page)).toBe("this loud"); // the selection is where it was
    await expect(box).toBeFocused(); // and the keyboard would stay up
    await page.getByRole("button", { name: "Bold" }).click();
    await expect(box).toHaveValue(`${marker} make this loud please`);

    await select(page, "please");
    await page.keyboard.press("Control+i");
    await expect(box).toHaveValue(`${marker} make this loud *please*`);
    await box.fill("apples\npears\nplums");
    await box.evaluate((el) => { el.focus(); el.setSelectionRange(0, el.value.length); });
    await page.getByRole("button", { name: "Bulleted list" }).click();
    await expect(box).toHaveValue("- apples\n- pears\n- plums");
    await box.fill("see the docs");
    await select(page, "the docs");
    await page.getByRole("button", { name: "Link" }).click();
    await expect(box).toHaveValue("see [the docs](https://)");
    expect(await selection(page)).toBe("https://");
    await context.close();
  });

  test("the preview is the published post: same text, same structure", async ({ browser }) => {
    const { context, page } = await as(browser, "author");
    await openComposer(page);
    const text = `${marker}\n\nA **bold** claim, *italic* aside, and \`code\`.\n\n- first item\n- second item\n\n> a quote\n\nhttps://example.com/docs and #robotics`;
    await page.getByLabel("Post text").fill(text);
    await page.getByRole("button", { name: "Preview" }).click();
    const preview = page.getByTestId("markdown-preview");
    await expect(preview.locator("strong")).toHaveText("bold");
    await expect(preview.locator("li")).toHaveCount(2);
    await expect(preview.locator("blockquote")).toContainText("a quote");
    const previewHtml = await preview.locator("[data-markdown]").innerHTML();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByLabel("Post text")).toHaveValue(text); // nothing was lost by looking at the preview
    await page.getByRole("button", { name: "Post", exact: true }).click();
    await expect(page.getByText("Posted", { exact: true })).toBeVisible();

    const { data: post } = await admin.from("posts").select("id, slug, body").like("body", `${marker}%`).single();
    expect(post.body).toBe(text); // stored exactly as written: Markdown is source text, never converted
    await page.goto(`/posts/${post.slug}`);
    const published = page.locator("[data-markdown]").first();
    await expect(published.locator("strong")).toHaveText("bold");
    await expect(published.locator("li")).toHaveCount(2);
    await expect(published.locator("a[href='https://example.com/docs']")).toHaveAttribute("rel", /nofollow/);
    await expect(published.locator("a[href='/explore?tag=robotics']")).toBeVisible();
    const normalise = (h) => h.replace(/<!--.*?-->/g, "").replace(/<a [^>]*>/g, "<a>").replace(/\s+/g, " ").replace(/ class="[^"]*"/g, "").replace(/ data-[a-z-]+="[^"]*"/g, "");
    expect(normalise(await published.innerHTML())).toBe(normalise(previewHtml));
    await context.close();
  });

  test("hostile text stays inert in the feed, on the post page and in the preview", async ({ browser }) => {
    const evil = `${marker} hostile\n\n<script>window.__pwned=1</script>\n\n<img src=x onerror="window.__pwned=2">\n\n[click](javascript:window.__pwned=3)\n\n[data](data:text/html,<script>1</script>)\n\n![pixel](https://tracker.example/p.gif)\n\n<a href="javascript:window.__pwned=4">raw</a>`;
    const { context, page } = await as(browser, "author");
    await page.addInitScript(() => { window.__pwned = 0; });
    await openComposer(page);
    await page.getByLabel("Post text").fill(evil);
    await page.getByRole("button", { name: "Preview" }).click();
    await expect(page.getByTestId("markdown-preview")).toContainText("<script>window.__pwned=1</script>"); // shown as text
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByRole("button", { name: "Post", exact: true }).click();
    await expect(page.getByText("Posted", { exact: true })).toBeVisible();
    const { data: post } = await admin.from("posts").select("slug").like("body", `${marker} hostile%`).single();

    for (const who of ["reader", "author"]) {
      const viewer = await as(browser, who);
      await viewer.page.addInitScript(() => { window.__pwned = 0; });
      // the post page, and a list of posts (the author's profile) where the same card appears as in the feed
      for (const path of [`/u/${author.username}`, `/posts/${post.slug}`]) {
        await viewer.page.goto(path);
        await viewer.page.waitForLoadState("networkidle");
        const card = viewer.page.locator("[data-markdown]", { hasText: "hostile" }).first();
        await expect(card).toBeVisible();
        expect(await viewer.page.evaluate(() => window.__pwned)).toBe(0);
        await expect(card.locator("script, img, iframe, svg, style")).toHaveCount(0);
        const hrefs = await card.locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
        for (const h of hrefs) expect(h).not.toMatch(/^(javascript|data|vbscript):/i);
        await expect(card).toContainText("click"); // the unsafe link's label is still there, as text
      }
      await viewer.context.close();
    }
    await context.close();
  });

  test("an existing post is edited with the same tools, and the change shows everywhere", async ({ browser }) => {
    const text = `${marker} editable plain words`;
    const { data: row } = await admin.from("posts").insert({ author_id: author.id, body: text, category: "general", visibility: "public", slug: `md-${run}-edit`, status: "published" }).select("id, slug").single();
    const { context, page } = await as(browser, "author");
    await page.goto(`/posts/${row.slug}`);
    await page.getByRole("button", { name: "More actions" }).first().click();
    await page.getByRole("menuitem", { name: "Edit post" }).click();
    const box = page.getByLabel("Post", { exact: true });
    await expect(box).toHaveValue(text);
    await box.evaluate((el) => { const i = el.value.indexOf("plain"); el.focus(); el.setSelectionRange(i, i + 5); });
    await page.getByRole("button", { name: "Bold" }).click();
    await expect(box).toHaveValue(`${marker} editable **plain** words`);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.locator("[data-markdown] strong", { hasText: "plain" })).toBeVisible({ timeout: 15_000 });
    expect((await admin.from("posts").select("body").eq("id", row.id).single()).data.body).toBe(`${marker} editable **plain** words`);
    await context.close();
  });

  test("older plain posts look the same as before: line breaks kept, no stray formatting", async ({ browser }) => {
    const plain = `${marker} legacy\nsecond line\nthird line with snake_case_name and 5 * 3`;
    const { data: row } = await admin.from("posts").insert({ author_id: author.id, body: plain, category: "general", visibility: "public", slug: `md-${run}-legacy`, status: "published" }).select("slug").single();
    const { context, page } = await as(browser, "reader");
    await page.goto(`/posts/${row.slug}`);
    const body = page.locator("[data-markdown]").first();
    await expect(body).toContainText("snake_case_name and 5 * 3");
    await expect(body.locator("em, strong, ul")).toHaveCount(0);
    expect(await body.locator("p").first().evaluate((p) => getComputedStyle(p).whiteSpace)).toBe("pre-wrap");
    await context.close();
  });

  test("works on a phone: toolbar reachable, no sideways scroll, preview fits, and meets accessibility checks", async ({ browser }) => {
    const { context, page } = await as(browser, "author", { viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await openComposer(page);
    await page.getByLabel("Post text").fill(`${marker} mobile\n\n- one\n- two\n\n\`\`\`\n${"a very long line of code ".repeat(8)}\n\`\`\``);
    for (const name of ["Bold", "Italic", "Bulleted list", "Numbered list", "Quote", "Code", "Link", "Preview"]) await expect(page.getByRole("button", { name })).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await page.getByRole("button", { name: "Preview" }).click();
    await expect(page.getByTestId("markdown-preview").locator("pre")).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    const results = await new AxeBuilder({ page }).include('[role="toolbar"]').withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
    await context.close();
  });
});
