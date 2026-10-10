import { createHmac } from "node:crypto";
import { test, expect } from "@playwright/test";
import { admin, cleanupUsers, createUser, grantRoleDirect, PASSWORD, setSetting } from "../helpers/supabase.js";

const RGEC = "00000000-0000-4000-8000-0000000000a1";

async function login(page, email, expectUrl = /\/feed/) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(expectUrl, { timeout: 30_000 });
}

// Mirrors lib/services/student-id.js: HMAC-SHA256 over "student-id:<college>:<normalised id>" with the app secret.
const appSecret = process.env.APP_SECRET || `dev-derived:${process.env.SUPABASE_SECRET_KEY}`;
const hashId = (id) => createHmac("sha256", appSecret).update(`student-id:${RGEC}:${id}`).digest("hex");

test.describe.serial("a closed network for verified RGEC members", () => {
  test.setTimeout(180_000);
  let tag, author, newcomer, staff, studentId;
  test.beforeAll(async () => {
    tag = Math.random().toString(36).slice(2, 7).toUpperCase();
    studentId = `CLOSED${tag}007`;
    author = await createUser("cn-author", { collegeId: RGEC });
    newcomer = await createUser("cn-newcomer", { collegeId: RGEC });
    staff = await createUser("cn-staff", { collegeId: RGEC });
    await admin.from("profiles").update({ verification_status: "verified", verified_at: new Date().toISOString() }).eq("id", author.id);
    await grantRoleDirect(staff.id, "moderator", RGEC);
    await admin.from("posts").insert({ author_id: author.id, slug: `closed-${tag.toLowerCase()}`, title: `Members only ${tag}`, body: "Only verified members may read this.", category: "general", visibility: "public" });
    await admin.from("student_id_roster").insert({ college_id: RGEC, id_hash: hashId(studentId), id_hint: `••${studentId.slice(-3)}`, batch_year: 2024 });
    await setSetting("college_verification_required", true);
  });
  test.afterAll(async () => {
    await setSetting("college_verification_required", false);
    await admin.from("posts").delete().eq("slug", `closed-${tag.toLowerCase()}`);
    await admin.from("student_id_roster").delete().eq("id_hash", hashId(studentId));
    await cleanupUsers();
  });

  test("a logged-out visitor sees the explanation, never the content", async ({ page, request }) => {
    await page.goto("/");
    await expect(page.getByText(/Members only: a private network/)).toBeVisible();
    const res = await request.get(`/posts/closed-${tag.toLowerCase()}`, { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers().location).toContain("/login");
    await page.goto("/register");
    await expect(page.getByText(/only for members of Ramgarh Engineering College/)).toBeVisible();
  });

  test("a signed-in account that is not verified sees only the verification screen", async ({ page }) => {
    await login(page, newcomer.email);
    await expect(page.getByRole("heading", { name: "Verify to enter UniSphere" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Student ID" })).toBeVisible();
    // no way around it by URL
    await page.goto(`/posts/closed-${tag.toLowerCase()}`);
    await expect(page.getByRole("heading", { name: "Verify to enter UniSphere" })).toBeVisible();
    await expect(page.getByText("Only verified members may read this.")).toHaveCount(0);
    // but their own settings stay reachable
    await page.goto("/settings/profile");
    await expect(page.getByRole("heading", { name: /Verify to enter/ })).toHaveCount(0);
  });

  test("a wrong ID is refused, the right one lets them in", async ({ page }) => {
    await login(page, newcomer.email);
    await page.getByRole("textbox", { name: "Student ID" }).fill("WRONG-ID-0000");
    await page.getByRole("button", { name: "Verify with student ID" }).click();
    await expect(page.getByText(/could not match that student ID/i)).toBeVisible({ timeout: 20_000 });
    await page.getByRole("textbox", { name: "Student ID" }).fill(studentId);
    await page.getByRole("button", { name: "Verify with student ID" }).click();
    await expect(page.getByRole("heading", { name: "Verify to enter UniSphere" })).toBeHidden({ timeout: 20_000 });
    await page.goto(`/posts/closed-${tag.toLowerCase()}`);
    await expect(page.getByRole("heading", { name: `Members only ${tag}` })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });

  test("staff are never locked out by the gate", async ({ page }) => {
    await login(page, staff.email);
    await expect(page.getByRole("heading", { name: "Verify to enter UniSphere" })).toHaveCount(0);
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();
  });
});
