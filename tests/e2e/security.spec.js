import { test, expect } from "@playwright/test";
import { admin, cleanupUsers, createUser } from "../helpers/supabase.js";

/**
 * Over real HTTP, with real sessions: one member cannot reach another member's conversation or private file by
 * changing an identifier, and an oversized upload is refused from its headers.
 * (Needs the local Supabase stack; see docs/security-audit.md for how it was run.)
 */

async function login(page, email) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("Passw0rd!test-xyz");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
}

test.describe.serial("cross-member access over HTTP", () => {
  let a, b, c, conversation, privateFile, pageA, pageB;

  // One login per member for the whole file: the login endpoint is rate limited.
  test.beforeAll(async ({ browser }) => {
    [a, b, c] = [await createUser("sec-e2e-a"), await createUser("sec-e2e-b"), await createUser("sec-e2e-c")];
    await admin.from("profiles").update({ allow_messages_from: "everyone" }).in("id", [a.id, b.id, c.id]);
    conversation = (await b.client.rpc("start_direct_conversation", { p_other: c.id })).data;
    expect(conversation).toBeTruthy();
    await b.client.rpc("send_message", { p_conversation: conversation, p_body: "private between b and c", p_file_ids: [], p_client_op_id: crypto.randomUUID() });
    // A private chat attachment that belongs to B (the row is enough: the route must refuse before storage is touched).
    const { data } = await admin
      .from("files")
      .insert({ owner_id: b.id, bucket: "private", storage_key: `message_attachment/${b.id}/${crypto.randomUUID()}.png`, purpose: "message_attachment", mime_type: "image/png", size_bytes: 10, status: "ready" })
      .select("id")
      .single();
    privateFile = data.id;
    pageA = await browser.newPage();
    await login(pageA, a.email);
    pageB = await browser.newPage();
    await login(pageB, b.email);
  });

  test.afterAll(async () => {
    await pageA?.close();
    await pageB?.close();
    if (privateFile) await admin.from("files").delete().eq("id", privateFile);
    await cleanupUsers();
  });

  test("a stranger gets 'not found' for someone else's conversation, and the participant gets it", async () => {
    const stranger = pageA;
    for (const path of [`/api/messages/${conversation}`, `/api/messages/${conversation}?limit=100`]) {
      const res = await stranger.request.get(path);
      expect(res.status(), path).toBe(404);
      expect(await res.text()).not.toContain("private between b and c");
    }
    expect((await stranger.request.post(`/api/messages/${conversation}`, { headers: { Origin: new URL(stranger.url()).origin }, data: { body: "hello", fileIds: [], clientOpId: crypto.randomUUID() } })).ok()).toBe(false);
    expect((await stranger.request.get("/api/messages/inbox").then((r) => r.json())).conversations.map((x) => x.id)).not.toContain(conversation);

    const participant = pageB;
    const res = await participant.request.get(`/api/messages/${conversation}`);
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain("private between b and c");
  });

  test("another member's private file is 'not found', whatever the identifier", async () => {
    const stranger = pageA;
    const res = await stranger.request.get(`/api/files/${privateFile}`, { maxRedirects: 0 });
    expect(res.status()).toBe(404);
    expect(res.headers()["cache-control"]).toMatch(/no-store|private/);
    expect((await stranger.request.get("/api/files/not-a-uuid", { maxRedirects: 0 })).status()).toBe(404);
  });

  test("an oversized upload is refused from its headers; a cross-site one is refused outright", async ({ baseURL }) => {
    const page = pageA;
    const big = Buffer.alloc(13 * 1024 * 1024, 1);
    const tooBig = await page.request.post("/api/upload", { headers: { Origin: baseURL }, multipart: { purpose: "post_attachment", file: { name: "big.png", mimeType: "image/png", buffer: big } } });
    expect(tooBig.status()).toBe(413);
    const crossSite = await page.request.post("/api/upload", { headers: { Origin: "https://evil.example" }, multipart: { purpose: "avatar", file: { name: "a.png", mimeType: "image/png", buffer: Buffer.alloc(64, 1) } } });
    expect(crossSite.status()).toBe(403);
  });

  test("push subscriptions accept browser push services only (no server-side request forgery)", async ({ baseURL }) => {
    const page = pageA;
    const keys = { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" };
    const post = (endpoint) => page.request.post("/api/push/subscribe", { headers: { Origin: baseURL }, data: { subscription: { endpoint, keys } } });
    for (const endpoint of ["https://169.254.169.254/latest/meta-data/", "https://localhost:3000/api/health", "https://10.0.0.5/hook", "https://fcm.googleapis.com.evil.example/x"]) {
      expect((await post(endpoint)).status(), endpoint).toBe(400);
    }
    const good = `https://fcm.googleapis.com/fcm/send/${crypto.randomUUID()}`;
    expect((await post(good)).status()).toBe(200);
    await admin.from("push_subscriptions").delete().eq("user_id", a.id);
  });

  test("a member cannot call the admin exports or console data", async () => {
    const page = pageA;
    for (const path of ["/api/admin/audit", "/api/admin/analytics", `/api/admin/users/${b.id}/export`]) {
      expect([403, 404], path).toContain((await page.request.get(path)).status());
    }
    const adminPage = await page.goto("/admin");
    expect(new URL(page.url()).pathname).not.toBe("/admin");
    expect(adminPage.status()).toBeLessThan(500);
  });
});
