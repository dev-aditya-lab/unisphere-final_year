import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { admin, createUser, PASSWORD } from "../helpers/supabase.js";

/**
 * The community workspace in a real browser (channels, live messages, Markdown safety, roles in the interface, invitations,
 * reports, the phone layout). The database rules themselves are proven in tests/integration/community-workspace.test.js; here
 * the question is whether the interface shows the right things to the right people and behaves under real conditions.
 * Uploads are not exercised: they need the storage service, which the local stack does not run.
 */

async function login(page, email) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/feed/, { timeout: 30_000 });
}

const as = (browser, state, options = {}) => browser.newContext({ storageState: state, serviceWorkers: "block", ...options });
const box = (page, channel) => page.getByLabel(`Message #${channel}`, { exact: true });
const log = (page) => page.getByRole("log");

let owner, mod, member, member2, outsider, community, slug, channels, tag;
const states = {};

test.describe("community workspace", () => {
  test.beforeAll(async ({ browser }) => {
    tag = Math.random().toString(36).slice(2, 7);
    [owner, mod, member, member2, outsider] = await Promise.all(["cx-owner", "cx-mod", "cx-member", "cx-member2", "cx-outsider"].map((l) => createUser(l)));
    slug = `cx-${tag}`;
    const { data, error } = await admin.from("communities").insert({ created_by: owner.id, slug, name: `Workspace ${tag}`, kind: "community", visibility: "public", join_policy: "open" }).select("id").single();
    if (error) throw error;
    community = data;
    await admin.from("community_members").insert([
      { community_id: community.id, user_id: mod.id, role: "moderator", status: "active" },
      { community_id: community.id, user_id: member.id, role: "member", status: "active" },
      { community_id: community.id, user_id: member2.id, role: "member", status: "active" },
    ]);
    // a private staff channel, a second public channel, and one seeded message so lists are not empty
    await owner.client.rpc("create_community_channel", { p_community: community.id, p_category: null, p_name: "staff-room", p_type: "staff" });
    await owner.client.rpc("create_community_channel", { p_community: community.id, p_category: null, p_name: "questions", p_type: "qna" });
    const { data: chans } = await admin.from("community_channels").select("id, name").eq("community_id", community.id);
    channels = Object.fromEntries(chans.map((c) => [c.name, c.id]));
    await admin.from("channel_messages").insert({ channel_id: channels.general, community_id: community.id, author_id: owner.id, body: `welcome ${tag}` });

    for (const [name, who] of [["owner", owner], ["mod", mod], ["member", member], ["member2", member2], ["outsider", outsider]]) {
      const c = await browser.newContext({ serviceWorkers: "block" });
      const p = await c.newPage();
      await login(p, who.email);
      states[name] = await c.storageState();
      await c.close();
    }
  });

  test("shows the channels a member may read, and not the staff channel", async ({ browser }) => {
    const ctx = await as(browser, states.member);
    const page = await ctx.newPage();
    await page.goto(`/communities/${slug}/channels`);
    const nav = page.getByRole("navigation", { name: `Workspace ${tag} channels` });
    await expect(nav.getByRole("link", { name: "general" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "announcements" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "questions" })).toBeVisible();
    await expect(nav.getByText("staff-room")).toHaveCount(0);
    // the address of a channel they may not read is a plain not-found
    // (the status is 200 because the page streams behind a loading skeleton; what matters is that nothing of the channel is shown)
    await page.goto(`/communities/${slug}/channels/${channels["staff-room"]}`);
    await expect(page.getByRole("heading", { name: "We could not find that page" })).toBeVisible();
    await expect(page.getByRole("log")).toHaveCount(0);
    await ctx.close();
  });

  test("keeps outsiders out of the workspace and sends them to the community page", async ({ browser }) => {
    const ctx = await as(browser, states.outsider);
    const page = await ctx.newPage();
    await page.goto(`/communities/${slug}/channels`);
    await expect(page).toHaveURL(new RegExp(`/communities/${slug}$`));
    // a channel address is the same: the workspace sends a non-member to the community page, with no messages in it
    await page.goto(`/communities/${slug}/channels/${channels.general}`);
    await expect(page).toHaveURL(new RegExp(`/communities/${slug}$`));
    await expect(page.getByRole("log")).toHaveCount(0);
    // and the API says the same thing, with no data
    const api = await page.request.get(`/api/community-channels/${channels.general}/messages`);
    expect(api.status()).toBe(404);
    await ctx.close();
  });

  test("sends a message that renders as Markdown and never runs HTML or script links", async ({ browser }) => {
    const ctx = await as(browser, states.member);
    const page = await ctx.newPage();
    const dialogs = [];
    page.on("dialog", (d) => {
      dialogs.push(d.message());
      d.dismiss();
    });
    await page.goto(`/communities/${slug}/channels/${channels.general}`);
    await expect(log(page).getByText(`welcome ${tag}`)).toBeVisible();

    const text = `**bold ${tag}** <img src=x onerror="alert('xss')"> <script>alert('s')</script> [bad](javascript:alert('l')) [good](https://example.org/p)`;
    await box(page, "general").fill(text);
    await page.getByRole("button", { name: "Send message" }).click();

    const mine = log(page).locator("li", { hasText: `bold ${tag}` });
    await expect(mine).toBeVisible();
    await expect(mine.locator("strong")).toHaveText(`bold ${tag}`);
    await expect(mine.locator("img[onerror], script, iframe")).toHaveCount(0);
    await expect(mine.getByText("<script>alert('s')</script>")).toBeVisible(); // shown as text
    const hrefs = await mine.locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    expect(hrefs.some((h) => h?.toLowerCase().startsWith("javascript"))).toBe(false);
    expect(hrefs).toContain("https://example.org/p");
    await expect(mine.locator('a[href="https://example.org/p"]')).toHaveAttribute("rel", /noopener/);
    expect(dialogs).toEqual([]);

    // a reload shows the same message, once
    await page.reload();
    await expect(log(page).getByText(`bold ${tag}`)).toHaveCount(1);
    await ctx.close();
  });

  test("delivers messages live to another member exactly once, and counts unread elsewhere", async ({ browser }) => {
    const a = await as(browser, states.member);
    const b = await as(browser, states.owner);
    const pa = await a.newPage();
    const pb = await b.newPage();
    await pa.goto(`/communities/${slug}/channels/${channels.general}`);
    await pb.goto(`/communities/${slug}/channels/${channels.general}`);
    await expect(log(pa).getByText(`welcome ${tag}`)).toBeVisible();
    await expect(log(pb).getByText(`welcome ${tag}`)).toBeVisible();

    await box(pb, "general").fill(`live ${tag}`);
    await pb.getByRole("button", { name: "Send message" }).click();
    await expect(log(pa).getByText(`live ${tag}`)).toBeVisible({ timeout: 15_000 });
    await expect(log(pa).getByText(`live ${tag}`)).toHaveCount(1);
    await expect(log(pb).getByText(`live ${tag}`)).toHaveCount(1);

    // a message in another channel marks it unread in the sidebar, without a reload
    await admin.from("channel_messages").insert({ channel_id: channels.questions, community_id: community.id, author_id: owner.id, body: `elsewhere ${tag}` });
    await expect(pa.getByRole("navigation", { name: `Workspace ${tag} channels` }).getByRole("link", { name: /questions/ }).getByLabel("Unread messages")).toBeVisible({ timeout: 15_000 });
    await a.close();
    await b.close();
  });

  test("lets the author edit and delete their message from its menu, and keeps strangers' menus short", async ({ browser }) => {
    const ctx = await as(browser, states.member);
    const page = await ctx.newPage();
    await page.goto(`/communities/${slug}/channels/${channels.general}`);
    await box(page, "general").fill(`to edit ${tag}`);
    await page.getByRole("button", { name: "Send message" }).click();
    const row = log(page).locator("li", { hasText: `to edit ${tag}` });
    await expect(row).toBeVisible();

    await row.hover();
    await row.getByRole("button", { name: /Actions for the message/ }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    await page.getByLabel("Edit your message").fill(`edited ${tag}`);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(log(page).getByText(`edited ${tag}`)).toBeVisible();
    await expect(log(page).getByText("(edited)").first()).toBeVisible();

    const edited = log(page).locator("li", { hasText: `edited ${tag}` });
    await edited.hover();
    await edited.getByRole("button", { name: /Actions for the message/ }).click();
    await page.getByRole("menuitem", { name: "Delete my message" }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(log(page).getByText("This message was deleted.").first()).toBeVisible();
    await expect(log(page).getByText(`edited ${tag}`)).toHaveCount(0);

    // someone else's message offers Report but no Edit/Delete/Remove to an ordinary member
    const welcome = log(page).locator("li", { hasText: `welcome ${tag}` });
    await welcome.hover();
    await welcome.getByRole("button", { name: /Actions for the message/ }).click();
    await expect(page.getByRole("menuitem", { name: "Report" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Edit" })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: "Delete my message" })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: "Remove (moderator)" })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: "Pin to channel" })).toHaveCount(0);
    await ctx.close();
  });

  test("lets a member report a message and a moderator see and act on it", async ({ browser }) => {
    await admin.from("channel_messages").insert({ channel_id: channels.general, community_id: community.id, author_id: member2.id, body: `reportable ${tag}` });
    const mctx = await as(browser, states.member);
    const mp = await mctx.newPage();
    await mp.goto(`/communities/${slug}/channels/${channels.general}`);
    const row = log(mp).locator("li", { hasText: `reportable ${tag}` });
    await expect(row).toBeVisible();
    await row.hover();
    await row.getByRole("button", { name: /Actions for the message/ }).click();
    await mp.getByRole("menuitem", { name: "Report" }).click();
    await mp.getByRole("radio", { name: "Bullying or harassment" }).click();
    await mp.getByRole("button", { name: "Submit report" }).click();
    await expect(mp.getByText("Thanks. The moderators will look at it.")).toBeVisible();
    await mctx.close();

    const modCtx = await as(browser, states.mod);
    const page = await modCtx.newPage();
    await page.goto(`/communities/${slug}/settings?tab=moderation`);
    await expect(page.getByText("Bullying or harassment").first()).toBeVisible();
    await expect(page.getByText(`reportable ${tag}`).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove message" }).first()).toBeVisible();
    await page.getByRole("button", { name: "Dismiss" }).first().click();
    await expect(page.getByText("Report dismissed")).toBeVisible();
    await modCtx.close();

    // the reported member's own screens never reveal the report
    const rctx = await as(browser, states.member2);
    const rp = await rctx.newPage();
    const res = await rp.goto(`/communities/${slug}/settings?tab=moderation`);
    await expect(rp).toHaveURL(new RegExp(`/communities/${slug}$`));
    expect(res.status()).toBeLessThan(500);
    await rctx.close();
  });

  test("shows each role only the management tabs it may use", async ({ browser }) => {
    const mctx = await as(browser, states.mod);
    const mp = await mctx.newPage();
    await mp.goto(`/communities/${slug}/settings`);
    const tabs = mp.getByRole("navigation", { name: "Management sections" });
    await expect(tabs.getByRole("link", { name: "Members" })).toBeVisible();
    await expect(tabs.getByRole("link", { name: "Moderation" })).toBeVisible();
    await expect(tabs.getByRole("link", { name: "Invitations" })).toBeVisible();
    await expect(tabs.getByRole("link", { name: "Channels" })).toHaveCount(0);
    await expect(tabs.getByRole("link", { name: "General" })).toHaveCount(0);
    // a tab the role may not use falls back to one it may, whatever the address says
    await mp.goto(`/communities/${slug}/settings?tab=channels`);
    await expect(mp.getByRole("navigation", { name: "Management sections" }).getByRole("link", { name: "Members" })).toHaveAttribute("aria-current", "page");
    await mctx.close();

    const octx = await as(browser, states.owner);
    const op = await octx.newPage();
    await op.goto(`/communities/${slug}/settings?tab=channels`);
    const otabs = op.getByRole("navigation", { name: "Management sections" });
    for (const name of ["Members", "Moderation", "Invitations", "Channels", "General", "Icon & banner", "Audit log"]) await expect(otabs.getByRole("link", { name })).toBeVisible();
    await octx.close();

    const bctx = await as(browser, states.member);
    const bp = await bctx.newPage();
    await bp.goto(`/communities/${slug}/settings`);
    await expect(bp).toHaveURL(new RegExp(`/communities/${slug}$`));
    await bctx.close();
  });

  test("lets an owner create a channel that appears for members without a reload", async ({ browser }) => {
    const mctx = await as(browser, states.member);
    const mp = await mctx.newPage();
    await mp.goto(`/communities/${slug}/channels`);
    const octx = await as(browser, states.owner);
    const op = await octx.newPage();
    await op.goto(`/communities/${slug}/settings?tab=channels`);
    await op.getByRole("button", { name: "New channel" }).click();
    await op.locator("#ch-name").fill(`projects-${tag}`);
    await op.getByRole("button", { name: "Create channel" }).click();
    await expect(op.getByText("Channel created")).toBeVisible();
    await expect(mp.getByRole("navigation", { name: `Workspace ${tag} channels` }).getByRole("link", { name: `projects-${tag}` })).toBeVisible({ timeout: 15_000 });
    await mctx.close();
    await octx.close();
  });

  test("runs an invitation: the code is shown once, works once, and then every outcome looks the same", async ({ browser }) => {
    const octx = await as(browser, states.owner);
    const op = await octx.newPage();
    await op.goto(`/communities/${slug}/invite`);
    await op.getByRole("combobox", { name: "Can be used by" }).click();
    await op.getByRole("option", { name: "One person" }).click();
    await op.getByRole("button", { name: "Create invitation" }).click();
    const link = await op.getByLabel("Invitation link").inputValue();
    expect(link).toMatch(/\/join\/[0-9a-f]{24}$/);
    const path = new URL(link).pathname;

    const ictx = await as(browser, states.outsider);
    const ip = await ictx.newPage();
    await ip.goto(path);
    await expect(ip.getByRole("heading", { name: `Workspace ${tag}` })).toBeVisible();
    await ip.getByRole("button", { name: `Join Workspace ${tag}` }).click();
    await expect(ip).toHaveURL(new RegExp(`/communities/${slug}/channels`), { timeout: 20_000 });

    // used up: anyone, member or not, sees the same page as for a code that never existed
    const m2 = await as(browser, states.member2);
    const p2 = await m2.newPage();
    await p2.goto(path);
    await expect(p2.getByRole("heading", { name: "This invitation is not valid any more" })).toBeVisible();
    await p2.goto("/join/0123456789abcdef01234567");
    await expect(p2.getByRole("heading", { name: "This invitation is not valid any more" })).toBeVisible();
    await m2.close();
    await ictx.close();
    await octx.close();
  });

  test("works on a phone: the list and the conversation are separate screens and actions open as a sheet", async ({ browser }) => {
    const ctx = await as(browser, states.member, { viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await page.goto(`/communities/${slug}/channels`);
    const nav = page.getByRole("navigation", { name: `Workspace ${tag} channels` });
    await expect(nav).toBeVisible();
    await nav.getByRole("link", { name: "general" }).click();
    await expect(page).toHaveURL(new RegExp(`/channels/${channels.general}`));
    await expect(nav).toBeHidden();
    await expect(log(page).getByText(`welcome ${tag}`)).toBeVisible();
    // the message box is on screen and not squeezed
    const bounds = await box(page, "general").boundingBox();
    expect(bounds.width).toBeGreaterThan(200);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(800);

    // no hover and no right-click: the actions button is there and opens a bottom sheet
    const row = log(page).locator("li", { hasText: `welcome ${tag}` });
    await row.getByRole("button", { name: /Actions for the message/ }).tap();
    const sheet = page.getByRole("dialog", { name: /Message from/ });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Report" })).toBeVisible();
    const box2 = await sheet.boundingBox();
    expect(box2.x).toBeGreaterThanOrEqual(0);
    expect(box2.x + box2.width).toBeLessThanOrEqual(391);
    // no sideways scroll on the page
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await ctx.close();
  });

  test("has no serious accessibility problems on the workspace, management and invite pages", async ({ browser }) => {
    const ctx = await as(browser, states.owner);
    const page = await ctx.newPage();
    for (const path of [`/communities/${slug}`, `/communities/${slug}/channels/${channels.general}`, `/communities/${slug}/settings?tab=members`, `/communities/${slug}/settings?tab=channels`, `/communities/${slug}/invite`]) {
      await page.goto(path);
      await page.waitForTimeout(2000); // the live connection keeps the network busy, so "idle" never comes
      const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      const bad = result.violations.filter((v) => ["serious", "critical"].includes(v.impact));
      expect(bad.map((v) => `${path}: ${v.id} ${v.nodes[0].html.slice(0, 160)} ${v.nodes[0].any[0]?.message ?? ""}`)).toEqual([]);
    }
    await ctx.close();
  });
});

test.describe("landing page", () => {
  test("shows the community explorer, switches panels with the keyboard, and states that examples are invented", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    const section = page.locator("#community-spaces");
    await expect(section.getByRole("heading", { name: "Clubs and study groups get a proper place to talk." })).toBeVisible();
    const tabs = section.getByRole("tablist", { name: "Parts of a community" });
    await expect(tabs.getByRole("tab", { name: "Channels" })).toHaveAttribute("aria-selected", "true");
    await tabs.getByRole("tab", { name: "Channels" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(tabs.getByRole("tab", { name: "Messages & files" })).toHaveAttribute("aria-selected", "true");
    await expect(section.getByText("Download", { exact: false }).first()).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(section.getByText("The reporter’s name is never shown to the person reported.")).toBeVisible();
    await expect(section.getByText(/invented community and invented people/)).toBeVisible();
    // nothing in the preview claims a number of members or any statistic
    await expect(section).not.toContainText(/\b\d[\d,]*\s+(members|users|communities|students)\b/i);
    expect(errors).toEqual([]);
  });

  test("respects reduced motion and has no serious accessibility problems", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const animated = await page.locator("#community-spaces").evaluate((el) => [...el.querySelectorAll("*")].filter((n) => getComputedStyle(n).animationName !== "none" && getComputedStyle(n).animationDuration !== "0s").length);
    expect(animated).toBe(0);
    const result = await new AxeBuilder({ page }).include("#community-spaces").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(result.violations.filter((v) => ["serious", "critical"].includes(v.impact)).map((v) => v.id)).toEqual([]);
    await ctx.close();
  });
});
