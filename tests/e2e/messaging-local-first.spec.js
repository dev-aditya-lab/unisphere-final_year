import { test, expect } from "@playwright/test";
import { admin, createUser, PASSWORD } from "../helpers/supabase.js";

/**
 * The local-first messaging client in a real browser: cached opens, offline sends, retries, reconnection,
 * account isolation, scroll behaviour and the mobile layout. Everything runs against the local stack; uploads are
 * mocked so no storage is touched.
 */

async function login(page, email) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/feed/, { timeout: 30_000 });
}

const thread = (page) => page.getByRole("region", { name: "Conversation" });
const box = (page) => page.getByLabel("Message", { exact: true });
const chatDatabases = (page) =>
  page
    .evaluate(async () => (await indexedDB.databases()).map((d) => d.name).filter((n) => n?.startsWith("unisphere-chat:")))
    .catch(() => null); // a navigation in flight: the poll asks again

let alice, bob, carol, convId, tag;
let aliceState, carolState;

/** A fresh browser context that is already signed in (a saved session, like reopening the browser). */
const as = (browser, state, options = {}) => browser.newContext({ storageState: state, serviceWorkers: "block", ...options });

test.describe("local-first messaging", () => {
  test.beforeAll(async ({ browser }) => {
    tag = Math.random().toString(36).slice(2, 7);
    alice = await createUser("lf-alice");
    bob = await createUser("lf-bob");
    carol = await createUser("lf-carol");
    await admin.from("profiles").update({ allow_messages_from: "everyone" }).in("id", [alice.id, bob.id, carol.id]);
    for (const [who, assign] of [[alice, (v) => (aliceState = v)], [carol, (v) => (carolState = v)]]) {
      const c = await browser.newContext({ serviceWorkers: "block" });
      const p = await c.newPage();
      await login(p, who.email);
      assign(await c.storageState());
      await c.close();
    }
    convId = (await alice.client.rpc("start_direct_conversation", { p_other: bob.id })).data;
    const rows = Array.from({ length: 90 }, (_, i) => ({
      conversation_id: convId,
      sender_id: i % 2 ? alice.id : bob.id,
      body: `seed ${tag} ${i + 1}`,
      created_at: new Date(Date.now() - (92 - i) * 60_000).toISOString(),
    }));
    await admin.from("messages").insert(rows);
  });

  test("opens a conversation with no cache, then again from the device when the network is gone", async ({ browser }) => {
    const ctx = await as(browser, aliceState);
    const page = await ctx.newPage();
    await page.goto(`/messages/${convId}`);
    await expect(thread(page).getByRole("log").getByText(`seed ${tag} 90`)).toBeVisible();
    await expect.poll(() => chatDatabases(page)).toEqual([`unisphere-chat:${alice.id}`]);

    // leave the messages area (a client navigation), cut the network, come back through the list
    await page.goto("/messages");
    await expect(page.getByRole("link", { name: /Test lf-bob/ })).toBeVisible();
    await ctx.setOffline(true);
    await page.getByRole("link", { name: /Test lf-bob/ }).click();
    await expect(thread(page).getByRole("log").getByText(`seed ${tag} 90`)).toBeVisible();
    await expect(page.getByText(/offline/i).first()).toBeVisible();
    await ctx.close();
  });

  test("a message written offline shows at once, survives a reload, and is sent exactly once on reconnect", async ({ browser }) => {
    const ctx = await as(browser, aliceState);
    const page = await ctx.newPage();
    await page.goto(`/messages/${convId}`);
    await expect(thread(page).getByRole("log").getByText(`seed ${tag} 90`)).toBeVisible();

    await ctx.setOffline(true);
    await box(page).fill(`offline ${tag}`);
    await page.keyboard.press("Enter");
    await expect(thread(page).getByRole("log").getByText(`offline ${tag}`)).toBeVisible();
    await expect(thread(page).getByLabel("Sending")).toBeVisible();
    await expect(box(page)).toHaveValue("");

    // the message is on the device, not only in the page
    await ctx.setOffline(false);
    await ctx.setOffline(true);
    await page.reload().catch(() => {});
    await ctx.setOffline(false);
    await page.goto(`/messages/${convId}`);
    await expect(thread(page).getByRole("log").getByText(`offline ${tag}`)).toBeVisible();
    await expect.poll(async () => (await admin.from("messages").select("id").eq("conversation_id", convId).eq("body", `offline ${tag}`)).data.length, { timeout: 30_000 }).toBe(1);
    await expect(thread(page).getByLabel("Sending")).toHaveCount(0, { timeout: 15_000 });
    await expect(thread(page).getByRole("log").getByText(`offline ${tag}`)).toHaveCount(1);
    await ctx.close();
  });

  test("a failed send keeps the message, retries with the same key and never duplicates", async ({ browser }) => {
    const ctx = await as(browser, aliceState);
    const page = await ctx.newPage();
    await page.goto(`/messages/${convId}`);
    await expect(thread(page).getByRole("log").getByText(`seed ${tag} 90`)).toBeVisible();

    // The server stores the message, but the response is lost (the worst case for duplicates).
    let first = true;
    const keys = [];
    await page.route(`**/api/messages/${convId}`, async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      keys.push(JSON.parse(route.request().postData()).clientOpId);
      if (first) {
        first = false;
        await route.fetch(); // really send it to the server
        return route.abort("connectionreset");
      }
      return route.continue();
    });
    await box(page).fill(`lost response ${tag}`);
    await page.keyboard.press("Enter");
    await expect(thread(page).getByRole("log").getByText(`lost response ${tag}`)).toBeVisible();
    // Either the realtime event or the retry (same key) confirms it; both are fine, a second row is not.
    await expect(thread(page).getByLabel("Sending")).toHaveCount(0, { timeout: 25_000 });
    expect(new Set(keys).size).toBe(1);
    await expect(thread(page).getByRole("log").getByText(`lost response ${tag}`)).toHaveCount(1);
    const { data } = await admin.from("messages").select("id").eq("conversation_id", convId).eq("body", `lost response ${tag}`);
    expect(data).toHaveLength(1);
    await ctx.close();
  });

  test("a refused message stays visible as failed with retry, and is not retried by itself", async ({ browser }) => {
    const ctx = await as(browser, aliceState);
    const page = await ctx.newPage();
    await page.goto(`/messages/${convId}`);
    await expect(thread(page).getByRole("log").getByText(`seed ${tag} 90`)).toBeVisible();
    let posts = 0;
    await page.route(`**/api/messages/${convId}`, (route) => {
      if (route.request().method() !== "POST") return route.continue();
      posts += 1;
      return route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ ok: false, error: "Refused for the test.", code: "cannot_send" }) });
    });
    await box(page).fill(`refused ${tag}`);
    await page.keyboard.press("Enter");
    await expect(thread(page).getByRole("button", { name: "Retry sending" })).toBeVisible();
    await page.waitForTimeout(1500);
    expect(posts).toBe(1);
    await thread(page).getByRole("button", { name: "Discard message" }).click();
    await expect(thread(page).getByRole("log").getByText(`refused ${tag}`)).toHaveCount(0);
    await ctx.close();
  });

  test("catches up on messages missed while offline, and a duplicate realtime event adds nothing", async ({ browser }) => {
    const ctx = await as(browser, aliceState);
    const page = await ctx.newPage();
    await page.goto(`/messages/${convId}`);
    await expect(thread(page).getByRole("log").getByText(`seed ${tag} 90`)).toBeVisible();

    await ctx.setOffline(true);
    for (let i = 1; i <= 3; i++) {
      await bob.client.from("messages").insert({ conversation_id: convId, sender_id: bob.id, body: `missed ${tag} ${i}` });
    }
    await page.waitForTimeout(500);
    await ctx.setOffline(false);
    await expect(thread(page).getByRole("log").getByText(`missed ${tag} 3`)).toBeVisible({ timeout: 30_000 });
    for (let i = 1; i <= 3; i++) await expect(thread(page).getByRole("log").getByText(`missed ${tag} ${i}`)).toHaveCount(1);
    await ctx.close();
  });

  test("opening and closing conversations repeatedly does not pile up connections", async ({ browser }) => {
    const other = (await alice.client.rpc("start_direct_conversation", { p_other: carol.id })).data;
    const ctx = await as(browser, aliceState);
    const page = await ctx.newPage();
    const joins = [];
    page.on("websocket", (ws) =>
      ws.on("framesent", (f) => {
        if (typeof f.payload === "string" && f.payload.includes("phx_join")) joins.push(f.payload.match(/"topic":"([^"]+)"/)?.[1] ?? f.payload.match(/\["[^"]*","[^"]*","([^"]+)"/)?.[1]);
      }),
    );
    await page.goto("/messages");
    const inbox = page.getByRole("region", { name: "Inbox" });
    const bobRow = inbox.getByRole("link", { name: /Test lf-bob/ });
    const carolRow = inbox.getByRole("link", { name: /Test lf-carol/ });
    await expect(bobRow).toBeVisible();
    await expect(carolRow).toBeVisible();
    const before = joins.length;
    for (let i = 0; i < 6; i++) {
      await bobRow.click();
      await expect(page).toHaveURL(new RegExp(convId));
      await carolRow.click();
      await expect(page).toHaveURL(new RegExp(other));
    }
    await page.waitForTimeout(500);
    const chatJoins = joins.filter((t) => t?.includes("chat:"));
    expect(chatJoins.length).toBeLessThanOrEqual(1); // one account channel for the whole session
    expect(joins.length - before).toBeLessThanOrEqual(14); // typing channels only: one per open, never per event
    await ctx.close();
  });

  test("reading older messages is not interrupted by new ones; loading earlier keeps your place", async ({ browser }) => {
    const ctx = await as(browser, aliceState, { viewport: { width: 1280, height: 700 } });
    const page = await ctx.newPage();
    await page.goto(`/messages/${convId}`);
    await expect(thread(page).getByRole("log").getByText(`seed ${tag} 90`)).toBeVisible();
    const log = thread(page).getByRole("log");
    await log.evaluate((el) => (el.scrollTop = 0));
    await page.waitForTimeout(1200); // the top comes into view and older messages load by themselves
    const before = await log.evaluate((el) => el.scrollTop);
    await bob.client.from("messages").insert({ conversation_id: convId, sender_id: bob.id, body: `while reading ${tag}` });
    await page.waitForTimeout(1500);
    const after = await log.evaluate((el) => el.scrollTop);
    expect(Math.abs(after - before)).toBeLessThan(120);
    await expect(thread(page).getByRole("button", { name: /1 new message/ })).toBeVisible();
    await thread(page).getByRole("button", { name: /new message/ }).click();
    await expect(thread(page).getByRole("log").getByText(`while reading ${tag}`)).toBeInViewport();
    await ctx.close();
  });

  test("a very long message is accepted up to the limit and sent whole", async ({ browser }) => {
    const ctx = await as(browser, aliceState);
    const page = await ctx.newPage();
    await page.goto(`/messages/${convId}`);
    await expect(thread(page).getByRole("log").getByText(`seed ${tag} 90`)).toBeVisible();
    const long = `L${tag} ` + "word ".repeat(790); // just under 4000 characters
    await box(page).fill(long);
    await page.getByRole("button", { name: "Send message" }).click();
    await expect.poll(async () => (await admin.from("messages").select("body").eq("conversation_id", convId).like("body", `L${tag} %`)).data?.[0]?.body.length).toBe(long.trim().length);
    await ctx.close();
  });

  test("an attachment upload can be cancelled, and nothing is sent", async ({ browser }) => {
    const ctx = await as(browser, aliceState);
    const page = await ctx.newPage();
    await page.goto(`/messages/${convId}`);
    await expect(thread(page).getByRole("log").getByText(`seed ${tag} 90`)).toBeVisible();
    let uploads = 0;
    await page.route("**/api/upload", async () => {
      uploads += 1; // never answered: a slow upload
    });
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");
    await page.locator('input[type="file"]').setInputFiles({ name: "tiny.png", mimeType: "image/png", buffer: png });
    await expect(page.getByRole("button", { name: /Cancel uploading tiny/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Send message" })).toBeDisabled();
    await page.getByRole("button", { name: /Cancel uploading tiny/ }).click();
    await expect(page.getByRole("list", { name: "Attachments" })).toHaveCount(0);
    expect(uploads).toBeLessThanOrEqual(1);
    await ctx.close();
  });

  test("two tabs of one account stay in step", async ({ browser }) => {
    const ctx = await as(browser, aliceState);
    const one = await ctx.newPage();
    await one.goto(`/messages/${convId}`);
    const two = await ctx.newPage();
    await two.goto(`/messages/${convId}`);
    await expect(thread(two).getByRole("log").getByText(`seed ${tag} 90`)).toBeVisible();
    await box(one).fill(`tabs ${tag}`);
    await one.keyboard.press("Enter");
    await expect(thread(two).getByRole("log").getByText(`tabs ${tag}`)).toBeVisible({ timeout: 20_000 });
    await expect(thread(two).getByRole("log").getByText(`tabs ${tag}`)).toHaveCount(1);
    await ctx.close();
  });

  test("another account on the same browser never sees, or is left, the first account's messages", async ({ browser }) => {
    const ctx = await as(browser, aliceState);
    const page = await ctx.newPage();
    await page.goto(`/messages/${convId}`);
    await expect(thread(page).getByRole("log").getByText(`seed ${tag} 90`)).toBeVisible();
    await expect.poll(() => chatDatabases(page)).toContain(`unisphere-chat:${alice.id}`);

    // log out through the menu (this is what wipes the device store)
    await page.getByRole("button", { name: /account|menu|profile/i }).first().click().catch(() => {});
    const logout = page.getByRole("menuitem", { name: /log out/i });
    if (await logout.count()) await logout.click();
    else await page.goto("/login");
    await page.waitForLoadState("networkidle");

    await login(page, carol.email);
    await page.goto(`/messages/${convId}`);
    expect((await page.goto(`/messages/${convId}`)).status()).toBe(404);
    await page.goto("/messages");
    await expect(page.getByText(`seed ${tag}`)).toHaveCount(0);
    const dbs = await chatDatabases(page);
    expect(dbs).not.toContain(`unisphere-chat:${alice.id}`);
    await ctx.close();
  });

  test("the API refuses a stranger, an unauthenticated caller and a cross-site write", async ({ browser, request }) => {
    const ctx = await as(browser, carolState);
    const page = await ctx.newPage();
    const read = await page.request.get(`/api/messages/${convId}`);
    expect(read.status()).toBe(404);
    const write = await page.request.post(`/api/messages/${convId}`, { data: { body: "intruder", fileIds: [], clientOpId: crypto.randomUUID() } });
    expect([403, 404]).toContain(write.status());
    const crossSite = await page.request.post(`/api/messages/${convId}`, {
      headers: { Origin: "https://evil.example" },
      data: { body: "csrf", fileIds: [], clientOpId: crypto.randomUUID() },
    });
    expect(crossSite.status()).toBe(403);
    expect((await request.get(`/api/messages/${convId}`)).status()).toBe(401);
    expect((await request.get("/api/messages/inbox")).status()).toBe(401);
    expect(read.headers()["cache-control"]).toContain("no-store");
    await ctx.close();
  });

  test("on a phone the list and the thread take turns, and the composer stays on screen", async ({ browser }) => {
    const ctx = await as(browser, aliceState, { viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await page.goto("/messages");
    await expect(page.getByRole("region", { name: "Inbox" })).toBeVisible();
    await page.getByRole("link", { name: /Test lf-bob/ }).click();
    await expect(thread(page).getByRole("log").getByText(`seed ${tag} 90`)).toBeVisible();
    await expect(page.getByRole("region", { name: "Inbox" })).toBeHidden();
    await expect(box(page)).toBeInViewport();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.getByRole("button", { name: "Back to conversations" }).click();
    await expect(page.getByRole("region", { name: "Inbox" })).toBeVisible();
    await ctx.close();
  });
});
