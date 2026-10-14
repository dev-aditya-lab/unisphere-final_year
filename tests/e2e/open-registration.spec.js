import { test, expect } from "@playwright/test";
import { admin, cleanupUsers, createUser, grantRoleDirect, PASSWORD } from "../helpers/supabase.js";

/**
 * Open registration and the community-grown college directory, end to end in a browser:
 * sign up with nothing but an email, skip the college, use the platform; add a college by name; pick it again as
 * someone else without creating a duplicate; keyboard and phone use; report it; and the directory pages.
 */

const run = Date.now().toString(36);
const word = `Zq${run}`; // made-up word so fixtures never collide with real colleges
const collegeName = `${word} Institute of Technology`;
const newcomer = {
  name: "Open Newcomer",
  username: `open-${run}`,
  email: `delivered+open-${run}@resend.dev`,
  password: "Passw0rd!xyz",
};

async function login(page, email, password = PASSWORD) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
}

/** A brand-new member who has not onboarded yet (created through the admin API, like a confirmed sign-up). */
async function unboardedUser(label) {
  const u = await createUser(label, { accountType: null, collegeId: null });
  await admin.from("profiles").update({ onboarded_at: null }).eq("id", u.id);
  return u;
}

async function finishOnboardingSteps(page) {
  await page.getByRole("button", { name: /^Continue$/ }).click(); // interests -> communities
  await page.getByRole("button", { name: /Enter UniSphere/ }).click();
  await expect(page).toHaveURL(/\/feed/, { timeout: 30_000 });
}

test.describe.serial("open registration", () => {
  test.setTimeout(150_000);
  const made = [];
  test.afterAll(async () => {
    await admin.from("colleges").update({ is_active: false }).like("name", `${word}%`);
    await cleanupUsers();
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const mine = data.users.find((u) => u.email === newcomer.email);
    if (mine) await admin.auth.admin.deleteUser(mine.id);
  });

  test("sign-up asks for no role, college, student ID or college email", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByText(/free and open to everyone/i)).toBeVisible();
    await expect(page.getByText("I am a")).toHaveCount(0);
    await expect(page.getByLabel(/student id/i)).toHaveCount(0);
    await expect(page.getByLabel(/college/i)).toHaveCount(0);

    await page.getByLabel("Full name").fill(newcomer.name);
    await page.getByLabel("Username").fill(newcomer.username);
    await page.getByLabel("Email").fill(newcomer.email);
    await page.getByLabel("Password", { exact: true }).fill(newcomer.password);
    await page.getByLabel(/I agree to the/).click();
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/verify-email/);

    const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const id = users.users.find((u) => u.email === newcomer.email).id;
    const { data: profile } = await admin.from("profiles").select("account_type, college_id, verification_status").eq("id", id).single();
    expect(profile).toMatchObject({ account_type: null, college_id: null, verification_status: "unverified" });
  });

  test("confirm, skip the college, finish onboarding, and the choice is remembered", async ({ page }) => {
    const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: newcomer.email });
    expect(error).toBeNull();
    await page.goto(`/auth/confirm?token_hash=${data.properties.hashed_token}&type=email&next=/onboarding`);
    await expect(page).toHaveURL(/\/onboarding/);

    await page.getByLabel("Headline").fill("Just here to build things");
    await page.getByRole("button", { name: /^Continue$/ }).click();

    // The college step is optional and says so
    await expect(page.getByRole("heading", { name: "Connect a college" })).toBeVisible();
    await expect(page.getByText(/Optional\. It helps you find people/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Skip for now" })).toBeVisible();
    await page.getByRole("button", { name: "Continue without a college" }).click();

    await page.getByRole("textbox", { name: "Skills" }).fill("Writing");
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: /^Continue$/ }).click();
    await expect(page.getByRole("heading", { name: "Find your people" })).toBeVisible();
    await page.getByRole("button", { name: /Enter UniSphere/ }).click();
    await expect(page).toHaveURL(/\/feed/, { timeout: 30_000 });

    // Onboarding completion is stored: coming back never asks again
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/feed/);
    await page.reload();
    await expect(page).toHaveURL(/\/feed/);
  });

  test("a member with no college can post, and the college options explain themselves", async ({ page }) => {
    await login(page, newcomer.email, newcomer.password);
    await page.goto("/feed");
    // no "My college" scope without a college
    await expect(page.getByRole("tab", { name: "My college" })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "All members" })).toBeVisible();

    await page.getByLabel("Post text").fill(`Hello from someone with no college ${run}`);
    await page.getByRole("combobox", { name: "Who can see this post" }).click();
    await expect(page.getByRole("option", { name: "My college" })).toHaveCount(0);
    await page.getByRole("option", { name: "All members" }).click();
    await page.getByRole("button", { name: "Post", exact: true }).click();
    await expect(page.getByText(`Hello from someone with no college ${run}`)).toBeVisible({ timeout: 20_000 });
  });

  test("adds a college by name from the profile, and it is labelled community-added", async ({ page }) => {
    await login(page, newcomer.email, newcomer.password);
    await page.goto("/settings/profile");
    await page.waitForLoadState("networkidle");
    const box = page.getByRole("combobox", { name: /College/ });
    await box.fill(collegeName);
    await expect(page.getByRole("option", { name: new RegExp(`Add .${word}`) })).toBeVisible();
    await page.getByRole("option", { name: new RegExp(`Add .${word}`) }).click();

    await expect(page.getByRole("form", { name: "Add a college" })).toBeVisible();
    await page.getByLabel("City").fill("Ramgarh");
    await page.getByRole("button", { name: "Add this college" }).click();

    const selected = page.getByTestId("selected-college");
    await expect(selected).toContainText(collegeName);
    await expect(selected).toContainText("Ramgarh");
    await expect(selected).toContainText("Community-added");
    await expect(selected).toContainText(/does not verify/i);
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByText("Profile saved.")).toBeVisible();

    const { data } = await admin.from("colleges").select("id, name, listing_status, created_by").ilike("name", `${word}%`);
    expect(data).toHaveLength(1);
    expect(data[0].listing_status).toBe("community");
    made.push(data[0].id);
    const { data: p } = await admin.from("profiles").select("college_id, verification_status").eq("username", newcomer.username).single();
    expect(p).toMatchObject({ college_id: data[0].id, verification_status: "unverified" });
  });

  test("another member finds it with the keyboard, and no duplicate is created", async ({ browser }) => {
    const u = await unboardedUser("open-second");
    const page = await (await browser.newContext()).newPage();
    await login(page, u.email);
    await expect(page).toHaveURL(/\/onboarding/);
    await page.getByRole("button", { name: /^Continue$/ }).click();

    const box = page.getByRole("combobox", { name: /College/ });
    await box.fill(`${word} instit`);
    const listbox = page.getByRole("listbox", { name: "Matching colleges" });
    await expect(listbox.getByRole("option", { name: new RegExp(collegeName) })).toBeVisible();
    await box.press("ArrowDown");
    await box.press("Enter");
    await expect(page.getByTestId("selected-college")).toContainText(collegeName);

    // change their mind: clear it and the picker comes back
    await page.getByRole("button", { name: new RegExp(`Remove ${word}`) }).click();
    await expect(page.getByRole("combobox", { name: /College/ })).toBeVisible();
    await page.getByRole("combobox", { name: /College/ }).fill(`${word} Institute of Technology`.toLowerCase());
    await expect(page.getByRole("listbox", { name: "Matching colleges" }).getByRole("option", { name: new RegExp(collegeName) })).toBeVisible();
    await page.getByRole("combobox", { name: /College/ }).press("ArrowDown");
    await page.getByRole("combobox", { name: /College/ }).press("Enter");
    await expect(page.getByTestId("selected-college")).toContainText(collegeName);

    await page.getByRole("button", { name: /^Continue$/ }).click(); // college -> interests
    await finishOnboardingSteps(page);

    const { data } = await admin.from("colleges").select("id").ilike("name", `${word}%`);
    expect(data).toHaveLength(1);
    const { data: p } = await admin.from("profiles").select("college_id").eq("id", u.id).single();
    expect(p.college_id).toBe(data[0].id);
  });

  test("typing the same college a different way returns the existing record", async ({ browser }) => {
    const u = await createUser("open-third", { accountType: null, collegeId: null });
    const page = await (await browser.newContext()).newPage();
    await login(page, u.email);
    await page.goto("/colleges");
    await page.getByRole("button", { name: "Add a college" }).first().click();
    await page.getByLabel("College name").fill(`Institute of Technology, ${word.toLowerCase()}`);
    await page.getByRole("button", { name: "Add this college" }).click();
    await expect(page).toHaveURL(new RegExp(`/colleges/${word.toLowerCase()}`));
    await expect(page.getByRole("heading", { level: 1 })).toContainText(collegeName);
    const { data } = await admin.from("colleges").select("id").ilike("name", `%${word}%`);
    expect(data).toHaveLength(1);
  });

  test("the college page counts real members, and offers reports and corrections", async ({ page }) => {
    const u = await createUser("open-fourth", { accountType: null, collegeId: null });
    await login(page, u.email);
    await page.goto("/colleges?q=" + encodeURIComponent(word));
    await page.getByRole("link", { name: new RegExp(collegeName) }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(collegeName);
    await expect(page.getByText(/2 members have connected their profile/)).toBeVisible();
    await expect(page.getByText(/has not been checked/)).toBeVisible();
    await expect(page.getByText("Verified listing")).toHaveCount(0);

    await page.getByRole("button", { name: /Suggest a correction or report/ }).click();
    await page.getByLabel("It should say").fill("Ramgarh Cantt");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText(/A moderator will review this/)).toBeVisible();
    // once is enough
    await page.getByRole("button", { name: /Suggest a correction or report/ }).click();
    await page.getByLabel("It should say").fill("Somewhere else");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText(/already reported this/i)).toBeVisible();
  });

  test("works on a phone: the picker is usable at 360 px and nothing scrolls sideways", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
    const u = await createUser("open-phone", { accountType: null, collegeId: null });
    const page = await context.newPage();
    await login(page, u.email);
    await page.goto("/settings/profile");
    await page.waitForLoadState("networkidle");
    await page.getByRole("combobox", { name: /College/ }).fill(word);
    const option = page.getByRole("option", { name: new RegExp(collegeName) });
    await expect(option).toBeVisible();
    const box = await option.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44); // a comfortable touch target
    await option.tap();
    await expect(page.getByTestId("selected-college")).toContainText(collegeName);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await context.close();
  });
});

test.describe.serial("college directory administration", () => {
  test.setTimeout(150_000);
  const tag = `${Date.now().toString(36)}`;
  const keep = `Zqadm${tag} Keeper University`;
  const dupe = `Zqadm${tag} Keeper Univ Satellite`;
  let reporter, adminUser;
  test.afterAll(async () => {
    await admin.from("colleges").update({ is_active: false }).like("name", `Zqadm${tag}%`);
    await cleanupUsers();
  });

  test("a global admin applies a correction and merges a duplicate; members move and old links redirect", async ({ page }) => {
    reporter = await createUser("adm-reporter", { accountType: null, collegeId: null });
    adminUser = await createUser("adm-admin", { accountType: null, collegeId: null });
    await grantRoleDirect(adminUser.id, "global_admin", null);

    const { data: a } = await admin.from("colleges").insert({ slug: `zqadm${tag}-keeper`, name: keep, city: "Wrongtown" }).select("id, slug").single();
    const { data: b } = await admin.from("colleges").insert({ slug: `zqadm${tag}-satellite`, name: dupe, city: "Othertown" }).select("id, slug").single();
    await admin.from("profiles").update({ college_id: b.id }).eq("id", reporter.id);
    await admin.from("college_reports").insert({ college_id: a.id, reporter_id: reporter.id, kind: "correction", field: "city", proposed_value: "Righttown" });

    await login(page, adminUser.email);
    await page.goto(`/admin/colleges?q=${encodeURIComponent(`Zqadm${tag}`)}`);
    await expect(page.getByRole("heading", { name: "College directory", level: 1 })).toBeVisible();

    // accept the correction
    await page.getByRole("button", { name: "Accept" }).first().click();
    await expect.poll(async () => (await admin.from("colleges").select("city").eq("id", a.id).single()).data.city, { timeout: 20_000 }).toBe("Righttown");

    // merge the duplicate into the keeper
    await page.reload();
    const row = page.locator("details", { hasText: dupe });
    await row.locator("summary").click();
    await row.locator('input[role="combobox"]').fill(`Zqadm${tag} Keeper University`);
    await row.getByRole("option", { name: new RegExp(keep) }).click();
    await row.getByLabel("Reason").fill("Same college, different spelling");
    await row.getByRole("button", { name: /Merge into/ }).click();
    await expect.poll(async () => (await admin.from("profiles").select("college_id").eq("id", reporter.id).single()).data.college_id, { timeout: 20_000 }).toBe(a.id);

    // the old link still works and lands on the surviving record
    const member = await createUser("adm-viewer", { accountType: null, collegeId: null });
    const viewer = await (await page.context().browser().newContext()).newPage();
    await login(viewer, member.email);
    await viewer.goto(`/colleges/${b.slug}`);
    await expect(viewer).toHaveURL(new RegExp(`/colleges/${a.slug}`));
    await expect(viewer.getByRole("heading", { level: 1 })).toContainText(keep);
  });

  test("members cannot open the directory console", async ({ page }) => {
    await login(page, reporter.email);
    await page.goto("/admin/colleges");
    await expect(page).toHaveURL(/\/forbidden/);
  });
});
