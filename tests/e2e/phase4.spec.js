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

const connect = async (x, y) => {
  const [user_a, user_b] = x.id < y.id ? [x.id, y.id] : [y.id, x.id];
  await admin.from("connections").insert({ user_a, user_b });
};

test.describe.serial("notifications, messaging, events and the worker", () => {
  let alice, bob, tag;
  test.beforeAll(async () => {
    alice = await createUser("alice-p4");
    bob = await createUser("bob-p4");
    await connect(alice, bob);
    tag = Math.random().toString(36).slice(2, 7);
  });

  test("a reaction shows up live on the author's bell and in their inbox", async ({ browser }) => {
    const { data: post } = await alice.client.from("posts").insert({ author_id: alice.id, slug: `bell-${tag}`, title: `Bell post ${tag}`, body: "React to me", category: "projects", visibility: "college" }).select("id, slug").single();

    const alicePage = await (await browser.newContext()).newPage();
    await login(alicePage, alice.email);
    await expect(alicePage.locator("header").getByRole("link", { name: /^Notifications/ })).toBeVisible();

    const bobPage = await (await browser.newContext()).newPage();
    await login(bobPage, bob.email);
    await bobPage.goto(`/posts/${post.slug}`);
    await bobPage.waitForLoadState("networkidle");
    await bobPage.getByRole("button", { name: "Like", exact: true }).click();
    await expect.poll(async () => (await admin.from("posts").select("reaction_count").eq("id", post.id).single()).data.reaction_count).toBe(1);

    // realtime: the badge appears without reloading the page
    await expect(alicePage.locator("header").getByRole("link", { name: "Notifications, 1 unread" })).toBeVisible({ timeout: 20_000 });
    await alicePage.goto("/notifications");
    await expect(alicePage.getByText(`reacted to your post “Bell post ${tag}”`)).toBeVisible();
    await alicePage.getByRole("button", { name: "Mark all as read" }).click();
    await expect(alicePage.getByText("All caught up")).toBeVisible();
    // "All caught up" is shown at once (optimistic); reload only after the server has really recorded the read, or the
    // reload can render before the write and show the old count.
    await expect.poll(async () => (await admin.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", alice.id).is("read_at", null)).count).toBe(0);
    await alicePage.reload();
    await expect(alicePage.locator("header").getByRole("link", { name: /^Notifications$/ })).toBeVisible();
  });

  test("members choose their own notification channels", async ({ browser }) => {
    const page = await (await browser.newContext()).newPage();
    await login(page, alice.email);
    await page.goto("/settings/notifications");
    await page.waitForLoadState("networkidle");
    await page.getByRole("switch", { name: "Messages: email" }).click();
    await page.getByRole("button", { name: "Save preferences" }).click();
    await expect(page.getByText("Notification preferences saved.")).toBeVisible();
    const { data } = await admin.from("notification_preferences").select("category, email").eq("user_id", alice.id).eq("category", "messages").single();
    expect(data.email).toBe(true);
  });

  test("messages arrive live, with a read receipt, and only connections can be messaged by default", async ({ browser }) => {
    const alicePage = await (await browser.newContext()).newPage();
    await login(alicePage, alice.email);
    await alicePage.goto(`/u/${bob.username}`);
    await alicePage.waitForLoadState("networkidle");
    await alicePage.getByRole("button", { name: "Message" }).click();
    await expect(alicePage).toHaveURL(/\/messages\//);
    const convUrl = alicePage.url();

    const bobPage = await (await browser.newContext()).newPage();
    await login(bobPage, bob.email);
    await bobPage.goto(convUrl);
    await bobPage.waitForLoadState("networkidle");

    // The inbox row now shows the latest message live too, so message text is looked up inside the open conversation.
    const thread = (page) => page.getByRole("region", { name: "Conversation" });
    await alicePage.getByLabel("Message", { exact: true }).fill("Hello Bob, are you free to chat?");
    await alicePage.getByRole("button", { name: "Send message" }).click();
    await expect(thread(alicePage).getByRole("log").getByText("Hello Bob, are you free to chat?")).toBeVisible();
    // bob sees it without reloading
    await expect(thread(bobPage).getByRole("log").getByText("Hello Bob, are you free to chat?")).toBeVisible({ timeout: 20_000 });
    // alice sees the "Seen" receipt once bob has the thread open
    await expect(alicePage.getByLabel("Seen")).toBeVisible({ timeout: 20_000 });

    await bobPage.getByLabel("Message", { exact: true }).fill("Yes! Let's talk.");
    await bobPage.keyboard.press("Enter");
    await expect(thread(alicePage).getByRole("log").getByText("Yes! Let's talk.")).toBeVisible({ timeout: 20_000 });

    // a stranger cannot open the conversation
    const carol = await createUser("carol-p4");
    const carolPage = await (await browser.newContext()).newPage();
    await login(carolPage, carol.email);
    const res = await carolPage.goto(convUrl);
    expect(res.status()).toBe(404);
  });

  test("blocking ends a conversation immediately", async ({ browser }) => {
    const { data: conv } = await admin.from("conversations").select("id").limit(1).order("created_at", { ascending: false }).single();
    await admin.from("profiles").update({ allow_messages_from: "everyone" }).in("id", [alice.id, bob.id]);
    await bob.client.rpc("block_user", { p_target: alice.id });
    const alicePage = await (await browser.newContext()).newPage();
    await login(alicePage, alice.email);
    await alicePage.goto(`/messages/${conv.id}`);
    await expect(alicePage.getByText(/You can no longer send messages in this conversation/)).toBeVisible();
    await bob.client.rpc("unblock_user", { p_target: alice.id });
  });

  test("organisers create an event; attendees RSVP; the calendar file is valid", async ({ browser }) => {
    const title = `Hack Night ${tag}`;
    const start = new Date(Date.now() + 3 * 24 * 3600_000);
    const local = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}T18:00`;

    const op = await (await browser.newContext()).newPage();
    await login(op, alice.email);
    await op.goto("/events/new");
    await op.waitForLoadState("networkidle");
    await op.getByLabel("Title").fill(title);
    await op.getByLabel("Starts").fill(local);
    await op.getByLabel("Location").fill("Lab 2, Main Block");
    await op.getByLabel("Capacity").fill("1");
    await op.getByRole("button", { name: "Create event" }).click();
    await expect(op.getByRole("heading", { name: title })).toBeVisible({ timeout: 20_000 });
    await expect(op.getByText("Lab 2, Main Block")).toBeVisible();
    await expect(op.getByText(/IST/)).toBeVisible();
    const { data: ev } = await admin.from("events").select("id, slug, starts_at, timezone").eq("title", title).single();
    expect(ev.timezone).toBe("Asia/Kolkata");
    expect(new Date(ev.starts_at).getUTCHours() * 60 + new Date(ev.starts_at).getUTCMinutes()).toBe(12 * 60 + 30); // 18:00 IST = 12:30 UTC

    const bp = await (await browser.newContext()).newPage();
    await login(bp, bob.email);
    await bp.goto(`/events/${ev.slug}`);
    await bp.waitForLoadState("networkidle");
    await bp.getByRole("button", { name: "I am going" }).click();
    await expect(bp.getByRole("button", { name: "You are going" })).toBeVisible();

    const carol = await createUser("dave-p4");
    const cp = await (await browser.newContext()).newPage();
    await login(cp, carol.email);
    await cp.goto(`/events/${ev.slug}`);
    await cp.waitForLoadState("networkidle");
    await cp.getByRole("button", { name: "I am going" }).click();
    await expect(cp.getByText(/on the waitlist/i)).toBeVisible();

    const ics = await bp.request.get(`/events/${ev.slug}/calendar.ics`);
    expect(ics.status()).toBe(200);
    expect(ics.headers()["content-type"]).toContain("text/calendar");
    const body = await ics.text();
    expect(body).toContain("BEGIN:VEVENT");
    expect(body).toContain(`SUMMARY:${title}`);
    expect(body).toContain("DTSTART:");
  });

  test("communities: create, join and post inside", async ({ browser }) => {
    const name = `Robotics Club ${tag}`;
    const page = await (await browser.newContext()).newPage();
    await login(page, alice.email);
    await page.goto("/communities/new");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Name").fill(name);
    await page.getByRole("button", { name: "Create community" }).click();
    await expect(page.getByRole("heading", { name })).toBeVisible({ timeout: 20_000 });
    const { data: c } = await admin.from("communities").select("slug").eq("name", name).single();

    const bp = await (await browser.newContext()).newPage();
    await login(bp, bob.email);
    await bp.goto(`/communities/${c.slug}`);
    await bp.waitForLoadState("networkidle");
    await bp.getByRole("button", { name: "Join", exact: true }).click();
    await expect(bp.getByRole("button", { name: "Leave" })).toBeVisible();
    await bp.locator('[aria-label="Start a post"]:visible').click();
    await bp.getByLabel("Post text").fill(`Welcome to the club ${tag}`);
    await bp.getByRole("button", { name: "Post", exact: true }).click();
    await expect(bp.getByText(`Welcome to the club ${tag}`)).toBeVisible({ timeout: 20_000 });
  });

  test("the worker tick is protected, and sends a real email through Resend's test inbox", async ({ request }) => {
    expect((await request.post("/api/cron/tick")).status()).toBe(401);
    expect((await request.post("/api/cron/tick", { headers: { Authorization: "Bearer wrong-secret" } })).status()).toBe(401);
    // A monitor that cannot send headers (UptimeRobot free plan) may pass the secret in the URL; a wrong one is refused.
    expect((await request.get("/api/cron/tick?secret=wrong-secret")).status()).toBe(401);
    expect((await request.get("/api/cron/tick?secret=")).status()).toBe(401);
    const viaUrl = await request.get(`/api/cron/tick?secret=${encodeURIComponent(process.env.CRON_SECRET)}`);
    expect(viaUrl.status()).toBe(200);
    expect(await viaUrl.json()).toMatchObject({ ok: true });

    // Resend's `delivered+label@resend.dev` accepts mail as delivered without reaching a real mailbox.
    const email = `delivered+unisphere-${tag}@resend.dev`;
    const { data: created, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "Tick Test" } });
    expect(error).toBeNull();
    await admin.from("profiles").update({ onboarded_at: new Date().toISOString() }).eq("id", created.user.id);
    await admin.from("notifications").insert([
      { user_id: created.user.id, type: "project_invitation", category: "projects", actor_id: alice.id, data: { name: "Demo project", slug: "demo", role: "Designer" }, email_status: "pending", created_at: new Date(Date.now() - 5 * 60_000).toISOString() },
      { user_id: created.user.id, type: "mentorship_request", category: "mentorship", actor_id: bob.id, data: { topic: "Interviews", message: "Could you help?" }, email_status: "pending", created_at: new Date(Date.now() - 5 * 60_000).toISOString() },
    ]);
    try {
      const res = await request.post("/api/cron/tick", { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.notificationEmails.claimed).toBeGreaterThanOrEqual(2);
      // two pending notifications for one person are combined into ONE email
      const { data: rows } = await admin.from("notifications").select("email_status, email_error").eq("user_id", created.user.id);
      expect(rows.map((r) => r.email_status), JSON.stringify(rows)).toEqual(["sent", "sent"]);
    } finally {
      await admin.auth.admin.deleteUser(created.user.id);
    }
  });
});
