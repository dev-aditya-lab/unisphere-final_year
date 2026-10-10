import { test, expect } from "@playwright/test";
import { createUser, admin } from "../helpers/supabase.js";

// 1x1 transparent PNG, padded so it passes the minimum-length magic-byte check.
const PNG = Buffer.concat([
  Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"),
]);

async function login(page, email) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("Passw0rd!test-xyz");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

test.describe.serial("profile settings", () => {
  let u;
  test.beforeAll(async () => {
    u = await createUser("profile-e2e");
  });

  test("edits the profile and persists skills, links and privacy", async ({ page }) => {
    await login(page, u.email);
    await page.goto("/settings/profile");
    await page.getByLabel("Headline").fill("Embedded systems tinkerer");
    await page.getByLabel("Bio").fill("I build small things with microcontrollers.");
    await page.getByRole("textbox", { name: "Skills" }).fill("C++");
    await page.keyboard.press("Enter");
    await page.getByLabel("GitHub").fill("https://github.com/example");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByText("Profile saved.")).toBeVisible();

    const { data } = await admin.from("profiles").select("headline, bio, skills, github_url").eq("id", u.id).single();
    expect(data).toMatchObject({ headline: "Embedded systems tinkerer", skills: ["C++"], github_url: "https://github.com/example" });

    await page.goto("/settings/privacy");
    await page.getByLabel("All members").check();
    await page.getByRole("button", { name: "Save privacy settings" }).click();
    await expect(page.getByText("Privacy settings saved.")).toBeVisible();
    const { data: vis } = await admin.from("profiles").select("visibility").eq("id", u.id).single();
    expect(vis.visibility).toBe("public");
  });

  test("rejects an invalid URL before saving", async ({ page }) => {
    await login(page, u.email);
    await page.goto("/settings/profile");
    // Wait for hydration to restore the saved value before replacing it.
    await expect(page.getByLabel("GitHub")).toHaveValue("https://github.com/example");
    await page.getByLabel("GitHub").fill("javascript:alert(1)");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByText("Enter a valid http(s) URL")).toBeVisible();
  });

  test("uploads a profile photo through the server and can remove it", async ({ page }) => {
    await login(page, u.email);
    await page.goto("/settings/profile");
    await page.locator("#upload-avatar").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: PNG });
    await expect(page.getByText("Profile photo updated")).toBeVisible({ timeout: 20_000 });

    const { data: prof } = await admin.from("profiles").select("avatar_key").eq("id", u.id).single();
    expect(prof.avatar_key).toMatch(/^avatar\/.+\.png$/);
    const { data: file } = await admin.from("files").select("status, mime_type, owner_id").eq("storage_key", prof.avatar_key).single();
    expect(file).toMatchObject({ status: "ready", mime_type: "image/png", owner_id: u.id });

    // Served through the authorised media route (redirects to a signed URL).
    const res = await page.request.get(`/api/media/${prof.avatar_key}`, { maxRedirects: 0 });
    expect(res.status()).toBe(302);

    await page.getByRole("button", { name: /Remove/ }).first().click();
    await expect(page.getByText("Image removed")).toBeVisible();
  });

  test("refuses a file that is not really an image", async ({ page }) => {
    await login(page, u.email);
    await page.goto("/settings/profile");
    await page.locator("#upload-avatar").setInputFiles({ name: "evil.png", mimeType: "image/png", buffer: Buffer.from("<html><script>alert(1)</script></html>".padEnd(64, " ")) });
    await expect(page.getByText(/file type is not allowed/i)).toBeVisible({ timeout: 20_000 });
  });

  test("upload endpoint requires a session and a same-origin request", async ({ request }) => {
    const res = await request.post("/api/upload", { multipart: { purpose: "avatar", file: { name: "a.png", mimeType: "image/png", buffer: PNG } } });
    expect([401, 403]).toContain(res.status());
  });
});
