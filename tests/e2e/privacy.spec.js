import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { admin, cleanupUsers, createUser, grantRoleDirect, PASSWORD } from "../helpers/supabase.js";

/**
 * The privacy centre in a browser: signup statements, the review for existing members, consent switches, rights
 * requests, deletion with re-authentication, grievances for visitors, privacy-officer access, and the no-banner cookie finding.
 */
const run = Date.now().toString(36);

async function login(page, email) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
}

test.afterAll(cleanupUsers);

test.describe("visitors", () => {
  test("signup asks three separate, unticked statements and sends nothing optional", async ({ page }) => {
    await page.goto("/register");
    const adult = page.getByLabel(/I am 18 years old or older/);
    const privacy = page.getByLabel(/I agree to UniSphere using the account details/);
    const terms = page.getByLabel(/I accept the Terms of Service/);
    for (const box of [adult, privacy, terms]) await expect(box).not.toBeChecked();
    await expect(page.getByRole("checkbox")).toHaveCount(3); // adult, privacy, terms: no AI, marketing or analytics choice at signup

    await page.getByLabel("Full name").fill("Asha Tester");
    await page.getByRole("textbox", { name: "Email" }).fill(`asha-${run}@example.test`);
    await page.getByLabel("Password", { exact: true }).fill("Passw0rd!xyz");
    await terms.check(); // Terms alone are not privacy consent
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText(/you must agree to UniSphere using your account information/i)).toBeVisible();
    await expect(page.getByText(/UniSphere is for people aged 18 and over/)).toBeVisible();
  });

  test("there is no cookie banner, because there is nothing optional to ask", async ({ page }) => {
    for (const path of ["/", "/cookies", "/privacy-centre"]) {
      await page.goto(path);
      await expect(page.getByRole("button", { name: /accept (all )?cookies|reject (all )?cookies/i })).toHaveCount(0);
    }
    await page.goto("/cookies");
    await expect(page.getByText(/does not use analytics, social-media pixels or tracking cookies/)).toBeVisible();
  });

  test("the privacy centre, notice, grievance and contact pages are public, linked from the footer, and accessible", async ({ page }) => {
    await page.goto("/");
    for (const name of ["Privacy centre", "Privacy notice", "Privacy grievances"]) await expect(page.getByRole("contentinfo").getByRole("link", { name })).toBeVisible();
    for (const path of ["/privacy-centre", "/privacy-notice", "/grievance", "/grievance/track", "/privacy-contact", "/privacy"]) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      expect(results.violations.filter((v) => ["serious", "critical"].includes(v.impact)), path).toEqual([]);
    }
    await page.goto("/privacy-notice");
    await expect(page.getByRole("heading", { name: "What we collect" })).toBeVisible();
    await expect(page.getByText("UniSphere has not appointed a Data Protection Officer")).toBeVisible();
  });

  test("a visitor can file a grievance, gets a reference and code, and can follow it", async ({ page }) => {
    await page.goto("/grievance");
    await page.getByLabel("Title").fill("My old photo is still visible");
    await page.getByLabel("What happened?").fill("I left UniSphere months ago and a photo of mine still shows up in search.");
    await page.getByLabel("Your email address").fill(`visitor-${run}@example.test`);
    await page.getByRole("button", { name: "Send grievance" }).click();
    const ref = (await page.getByText(/^GR-\d{4}-\d{6}$/).first().textContent()).trim();
    const code = (await page.locator("strong.font-mono").nth(1).textContent()).trim();
    expect(code).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);

    await page.goto("/grievance/track");
    await page.getByLabel("Reference").fill(ref);
    await page.getByLabel("Tracking code").fill("AAAA-BBBB-CCCC-DDDD");
    await page.getByRole("button", { name: "Check progress" }).click();
    await expect(page.getByText("We could not find a grievance with that reference and code.")).toBeVisible();
    await page.getByLabel("Tracking code").fill(code);
    await page.getByRole("button", { name: "Check progress" }).click();
    await expect(page.getByRole("heading", { name: new RegExp(`${ref}: Received`) })).toBeVisible();
    await expect(page.getByText(/photo of mine/)).toHaveCount(0); // the status page never repeats what was written
  });

  test("members-only privacy tools send visitors to sign in", async ({ page }) => {
    for (const path of ["/privacy-requests", "/delete-account", "/settings/privacy", "/privacy-review"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login\?next=/);
    }
    const res = await page.request.get("/api/account/export");
    expect([401, 403, 200]).toContain(res.status());
    expect(res.headers()["content-type"] ?? "").not.toMatch(/json/);
  });
});

test.describe("members", () => {
  test("an account with no recorded consent must review before using the app; saying under 18 restricts it and offers deletion", async ({ page }) => {
    const u = await createUser(`e2e-new-${run}`);
    await login(page, u.email);
    await page.goto("/feed");
    await expect(page).toHaveURL(/\/privacy-review/);
    await page.getByLabel("I am under 18").check();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("UniSphere is for people aged 18 and over")).toBeVisible();
    await page.goto("/feed");
    await expect(page).toHaveURL(/\/privacy-review/); // still restricted
    await page.goto("/delete-account");
    await expect(page.getByRole("heading", { name: "Delete my account" })).toBeVisible(); // never trapped
    const { data } = await admin.from("consent_current").select("status").eq("user_id", u.id).eq("purpose", "age_confirmation").single();
    expect(data.status).toBe("declined");
  });

  test("an existing member sees a soft banner, reviews in a minute, and nothing optional is switched on", async ({ page }) => {
    const u = await createUser(`e2e-legacy-${run}`);
    await admin.from("profiles").update({ created_at: "2026-01-01T00:00:00Z" }).eq("id", u.id);
    await login(page, u.email);
    await page.goto("/feed");
    await expect(page).toHaveURL(/\/feed/); // not blocked
    await page.getByRole("link", { name: "Review them" }).click();
    await expect(page).toHaveURL(/\/privacy-review/);
    await page.getByLabel("I am 18 years old or older").check();
    await page.getByRole("button", { name: "Save and continue" }).click();
    await expect(page.getByText("To keep using UniSphere, agree")).toBeVisible(); // age alone is not enough
    await page.getByLabel(/I agree to UniSphere using the account details/).check();
    await page.getByRole("button", { name: "Save and continue" }).click();
    await expect(page).not.toHaveURL(/privacy-review/, { timeout: 15_000 });

    await page.goto("/settings/privacy");
    const ai = page.getByLabel("Use AI features on the text I submit");
    await expect(ai).not.toBeChecked();
    await ai.click();
    await expect(page.getByText("Turned on: Use AI features on the text I submit").last()).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Use AI features on the text I submit")).toBeChecked();
    await page.getByLabel("Use AI features on the text I submit").click(); // as easy to withdraw as to give
    await expect.poll(async () => (await admin.from("consent_current").select("status").eq("user_id", u.id).eq("purpose", "ai_assist").single()).data.status).toBe("withdrawn");
    const { data: events } = await admin.from("consent_events").select("purpose, status, source").eq("user_id", u.id).order("id");
    expect(events.map((e) => `${e.purpose}:${e.status}`)).toEqual(["age_confirmation:granted", "core_service:granted", "ai_assist:granted", "ai_assist:withdrawn"]);
  });

  test("deletion needs the password, can be cancelled, and the request is followable", async ({ page }) => {
    const u = await createUser(`e2e-del-${run}`);
    await admin.from("profiles").update({ created_at: "2026-01-01T00:00:00Z" }).eq("id", u.id);
    await login(page, u.email);
    await page.goto("/delete-account");
    await page.getByLabel("Your password").fill("not-the-password");
    await page.getByLabel("Type DELETE to confirm").fill("DELETE");
    await page.getByRole("button", { name: /Delete my account in 14 days/ }).click();
    await expect(page.getByText("That password is not correct")).toBeVisible();
    await page.getByLabel("Your password").fill(PASSWORD);
    await page.getByRole("button", { name: /Delete my account in 14 days/ }).click();
    await expect(page.getByRole("heading", { name: "Deletion scheduled" })).toBeVisible();
    await page.goto("/privacy-requests");
    await expect(page.getByRole("link", { name: /Delete my account and data/ })).toBeVisible();
    await page.goto("/delete-account");
    await page.getByRole("button", { name: "Cancel the deletion" }).click();
    await expect(page.getByRole("button", { name: /Delete my account in 14 days/ })).toBeVisible();
  });

  test("a member can download their data, correct something, and see the request", async ({ page }) => {
    const u = await createUser(`e2e-data-${run}`);
    await admin.from("profiles").update({ created_at: "2026-01-01T00:00:00Z" }).eq("id", u.id);
    await login(page, u.email);
    const res = await page.request.get("/api/account/export");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.account.email).toBe(u.email);
    expect(body.how_your_data_is_used.data_collected.length).toBeGreaterThan(5);

    await page.goto("/privacy-requests");
    await page.getByLabel("What it should say").fill("new-address@example.test");
    await page.getByLabel("Anything else we should know").fill("The email address on my account has a typo in it.");
    await page.getByRole("button", { name: "Send correction request" }).click();
    await expect(page.getByText(/Sent\. Your reference is PR-/)).toBeVisible();
    await page.reload();
    await expect(page.getByRole("link", { name: /Correction: email/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Copy of my data/ })).toBeVisible(); // the download was recorded as a completed request
  });
});

test.describe("staff", () => {
  test("a privacy officer reaches the privacy console; a global administrator does not", async ({ page }) => {
    const officer = await createUser(`e2e-officer-${run}`);
    const gadmin = await createUser(`e2e-gadmin-${run}`);
    for (const u of [officer, gadmin]) await admin.from("profiles").update({ created_at: "2026-01-01T00:00:00Z" }).eq("id", u.id);
    await grantRoleDirect(officer.id, "privacy_officer");
    await grantRoleDirect(gadmin.id, "global_admin");

    await login(page, officer.email);
    await page.goto("/admin/privacy");
    await expect(page.getByRole("heading", { name: "Privacy overview" })).toBeVisible();
    await page.goto("/admin/privacy/requests");
    await expect(page.getByRole("heading", { name: "Requests & grievances" })).toBeVisible();
    await page.goto("/admin/privacy/incidents");
    await expect(page.getByRole("heading", { name: "Data breaches" })).toBeVisible();
    await page.context().clearCookies();

    await login(page, gadmin.email);
    for (const path of ["/admin/privacy/requests", "/admin/privacy/incidents", "/admin/privacy/access", "/admin/privacy/settings"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/forbidden/);
    }
  });
});
