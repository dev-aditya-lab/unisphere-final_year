import { test, expect } from "@playwright/test";
import { admin, createUser, PASSWORD } from "../helpers/supabase.js";

async function login(page, email) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/feed/);
}

test.describe.serial("social flow between two members", () => {
  let alice, bob, tag, marker;

  test.beforeAll(async () => {
    alice = await createUser("alice-e2e");
    bob = await createUser("bob-e2e");
    tag = `rover${Math.random().toString(36).slice(2, 7)}`;
    marker = `Autonomous ${tag} prototype`;
  });

  test("alice publishes a post with a hashtag and a mention", async ({ browser }) => {
    const page = await (await browser.newContext()).newPage();
    await login(page, alice.email);
    await expect(page.getByRole("heading", { name: "Feed" })).toBeAttached();

    await page.locator('[aria-label="Start a post"]:visible').click();
    await page.getByLabel("Post text").fill(`${marker} with #${tag} and @${bob.username}`);
    await page.getByRole("button", { name: "Post", exact: true }).click();
    await expect(page.getByText("Posted", { exact: true })).toBeVisible();
    await expect(page.getByText(marker)).toBeVisible();

    const { data: post } = await admin.from("posts").select("id, author_id, college_id, visibility").ilike("body", `%${tag}%`).single();
    expect(post).toMatchObject({ author_id: alice.id, visibility: "public" });
    // Tags and mentions are derived after the response (see createPost), so they are polled for, not read at once.
    await expect
      .poll(async () => (await admin.from("hashtags").select("tag, use_count").eq("tag", tag)).data, { timeout: 15_000 })
      .toEqual([{ tag, use_count: 1 }]);
    await expect
      .poll(async () => (await admin.from("mentions").select("mentioned_user_id").eq("entity_id", post.id)).data, { timeout: 15_000 })
      .toEqual([{ mentioned_user_id: bob.id }]);
  });

  test("bob sees it, reacts, bookmarks and comments", async ({ browser }) => {
    const page = await (await browser.newContext()).newPage();
    await login(page, bob.email);
    // The default "For you" feed is ranked, so a brand-new post is not guaranteed a place on page one among many older
    // ones. This test is about reacting and bookmarking, so it reads the newest-first college feed.
    await page.goto("/feed?scope=college");
    const card = page.locator("article:visible", { hasText: marker });
    await expect(card).toBeVisible();

    await card.getByRole("button", { name: "Like", exact: true }).click();
    await expect(card.getByRole("button", { name: /You reacted: Like/ })).toBeVisible();
    await card.getByRole("button", { name: "Bookmark" }).click();
    // Bookmarking is optimistic and has no toast: the button flips at once, then the row must land in the database.
    await expect(card.getByRole("button", { name: "Remove bookmark" })).toBeVisible();

    const { data: post } = await admin.from("posts").select("id, slug").ilike("body", `%${tag}%`).single();
    // The UI updates optimistically; wait for the server write to land.
    await expect.poll(async () => (await admin.from("bookmarks").select("post_id", { count: "exact", head: true }).eq("user_id", bob.id)).count).toBe(1);
    await expect.poll(async () => (await admin.from("posts").select("reaction_count").eq("id", post.id).single()).data.reaction_count).toBe(1);

    await page.waitForLoadState("networkidle"); // let the feed finish its own requests before leaving it
    await page.goto(`/posts/${post.slug}`);
    await expect(page).toHaveURL(new RegExp(post.slug));
    await page.getByLabel("Write a comment").fill("Looks great, how are you powering it?");
    await page.getByRole("button", { name: "Comment", exact: true }).click();
    await expect(page.getByText("Looks great, how are you powering it?")).toBeVisible();
    await expect.poll(async () => (await admin.from("posts").select("comment_count").eq("id", post.id).single()).data.comment_count).toBe(1);

    await page.goto("/bookmarks");
    await expect(page.getByText(marker)).toBeVisible();
  });

  test("bob finds alice's post through search and the hashtag page", async ({ browser }) => {
    const page = await (await browser.newContext()).newPage();
    await login(page, bob.email);
    await page.goto(`/search?q=${encodeURIComponent(marker)}&type=posts`);
    await expect(page.getByText(marker).first()).toBeVisible();
    await page.goto(`/explore?tag=${tag}`);
    await expect(page.getByText(marker).first()).toBeVisible();
  });

  test("bob connects with alice and alice accepts", async ({ browser }) => {
    const bobPage = await (await browser.newContext()).newPage();
    await login(bobPage, bob.email);
    await bobPage.goto(`/u/${alice.username}`);
    await bobPage.getByRole("button", { name: "Connect", exact: true }).click();
    await expect(bobPage.getByRole("button", { name: /Requested/ })).toBeVisible();

    const alicePage = await (await browser.newContext()).newPage();
    await login(alicePage, alice.email);
    await alicePage.goto("/connections?tab=requests");
    await expect(alicePage.getByText("Test bob-e2e")).toBeVisible();
    await alicePage.getByRole("button", { name: "Accept" }).click();
    await expect(alicePage.getByText("Connected", { exact: true }).first()).toBeVisible();

    await alicePage.goto("/connections");
    await expect(alicePage.getByText("Test bob-e2e")).toBeVisible();
    expect((await admin.from("profiles").select("connection_count").eq("id", alice.id).single()).data.connection_count).toBe(1);
  });

  test("profiles are members-only: a logged-out visitor never sees them, whatever the owner chose", async ({ request }) => {
    // UniSphere is a closed network: even a profile set to "All members" is not visible outside it.
    for (const visibility of ["college", "public"]) {
      await admin.from("profiles").update({ visibility, bio: "Robotics tinkerer" }).eq("id", alice.id);
      const res = await request.get(`/u/${alice.username}`, { maxRedirects: 0 });
      expect(res.status()).toBe(307);
      expect(res.headers().location).toContain("/login");
      expect(await res.text()).not.toContain("Robotics tinkerer");
    }
    await admin.from("profiles").update({ visibility: "college" }).eq("id", alice.id);
  });

  test("a deleted post disappears for everyone and its page shows not found", async ({ browser }) => {
    const alicePage = await (await browser.newContext()).newPage();
    await login(alicePage, alice.email);
    const { data: post } = await admin.from("posts").select("slug").ilike("body", `%${tag}%`).single();
    await alicePage.goto(`/posts/${post.slug}`);
    await alicePage.getByRole("button", { name: "More actions" }).click();
    await alicePage.getByRole("menuitem", { name: /Delete post/ }).click();
    await alicePage.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(alicePage.getByText("Post deleted")).toBeVisible();

    const bobPage = await (await browser.newContext()).newPage();
    await login(bobPage, bob.email);
    // The post page streams behind a skeleton (loading.js), so a missing post answers 200 with the not-found page rather than a 404 status.
    await bobPage.goto(`/posts/${post.slug}`);
    await expect(bobPage.getByText("We could not find that page")).toBeVisible();
  });

  test("members can report content and are told when a post is gone", async ({ browser }) => {
    const { data: p } = await alice.client.from("posts").insert({ author_id: alice.id, slug: `rep-${tag}`, body: `report me ${tag}`, visibility: "college" }).select("slug").single();
    const bobPage = await (await browser.newContext()).newPage();
    await login(bobPage, bob.email);
    await bobPage.goto(`/posts/${p.slug}`);
    await bobPage.getByRole("button", { name: "More actions" }).click();
    await bobPage.getByRole("menuitem", { name: /Report post/ }).click();
    await bobPage.getByLabel("Spam or scam").check();
    await bobPage.getByRole("button", { name: "Submit report" }).click();
    await expect(bobPage.getByText(/Thanks for letting us know/)).toBeVisible();
    const { data: reports } = await admin.from("reports").select("category, status").eq("reporter_id", bob.id);
    expect(reports).toEqual([{ category: "spam", status: "open" }]);
  });
});
