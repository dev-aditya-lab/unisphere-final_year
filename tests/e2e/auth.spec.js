import { test, expect } from "@playwright/test";
import { admin } from "../helpers/supabase.js";

const run = Date.now().toString(36);
const user = {
  name: "Test Student",
  username: `e2e-${run}`,
  // Resend's test inbox: accepted as delivered, never bounces, never reaches a real mailbox.
  email: `delivered+e2e-${run}@resend.dev`,
  password: "Passw0rd!xyz",
};

test.describe.serial("registration → verification → onboarding", () => {
  test("anonymous visitors are redirected away from protected pages", async ({ page }) => {
    await page.goto("/settings/profile");
    await expect(page).toHaveURL(/\/login\?next=%2Fsettings%2Fprofile/);
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  });

  test("rejects invalid sign-up input without calling the server", async ({ page }) => {
    await page.goto("/register");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Enter your full name")).toBeVisible();
    await expect(page.getByText("You must accept the Terms")).toBeVisible();
  });

  test("registers and lands on the check-your-email page", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Full name").fill(user.name);
    await page.getByRole("textbox", { name: "Username" }).fill(user.username);
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill(user.password);
    // Three separate statements, none ticked for you.
    await page.getByLabel(/I am 18 years old or older/).click();
    await page.getByLabel(/I agree to UniSphere using the account details/).click();
    await page.getByLabel(/I accept the Terms of Service/).click();
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/verify-email/);
    await expect(page.getByText(user.email)).toBeVisible();
  });

  test("cannot log in before confirming the email", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill(user.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByText(/confirm your email/i)).toBeVisible();
  });

  test("confirms the email link, completes onboarding and reaches settings", async ({ page }) => {
    // Real mail goes out through Resend; the test confirms with an admin-generated token instead of
    // reading an inbox (the link in the email uses this same /auth/confirm route).
    const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: user.email });
    expect(error).toBeNull();
    await page.goto(`/auth/confirm?token_hash=${data.properties.hashed_token}&type=email&next=/onboarding`);
    await expect(page).toHaveURL(/\/onboarding/);

    // Step 1 – about you (name and username come from sign-up)
    await expect(page.getByLabel("Full name")).toHaveValue(user.name);
    await page.getByLabel("Headline").fill("Building things");
    await page.getByRole("button", { name: /Continue/ }).click();

    // Step 2 – schools and colleges (optional, added through the education editor): skipped here
    await page.getByRole("button", { name: /Continue without a college/ }).click();

    // Step 3 – skills
    await page.getByRole("textbox", { name: "Skills" }).fill("Python");
    await page.keyboard.press("Enter");
    await page.getByRole("textbox", { name: "Skills" }).fill("React");
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: /^Continue$/ }).click();

    // Step 4 – communities, then in
    await page.getByRole("button", { name: /Enter UniSphere/ }).click();
    await expect(page).not.toHaveURL(/onboarding/);

    await page.goto("/settings/profile");
    await expect(page.getByRole("heading", { name: "Profile completeness" })).toBeVisible();
    await expect(page.getByLabel("Full name")).toHaveValue(user.name);
  });

  test("logs out and logs back in with the new account", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill("WrongPassw0rd");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByText("Invalid email or password.")).toBeVisible();

    await page.getByLabel("Password", { exact: true }).fill(user.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).not.toHaveURL(/\/login/);

    await page.goto("/settings/security");
    await page.getByRole("button", { name: "Open account menu" }).click();
    await page.getByRole("menuitem", { name: /Log out/ }).click();
    await expect(page).toHaveURL(/localhost:\d+\/?$/);
    await page.goto("/settings/profile");
    await expect(page).toHaveURL(/\/login/);
  });
});

test("forgot-password gives the same response for unknown emails", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(`nobody-${run}@example.test`); // unknown account: no email is sent
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
});

test("unknown routes render the branded 404 (private ones ask a visitor to log in first)", async ({ page }) => {
  // Under a public section a missing page is a real 404.
  const res = await page.goto("/about/definitely-not-a-page");
  expect(res.status()).toBe(404);
  await expect(page.getByText("We could not find that page")).toBeVisible();
  // Anywhere else a logged-out visitor learns nothing about which pages exist: they are sent to log in.
  await page.goto("/definitely-not-a-page");
  await expect(page).toHaveURL(/\/login\?next=/);
});
