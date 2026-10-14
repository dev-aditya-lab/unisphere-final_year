import { describe, expect, it } from "vitest";
import { accountExistsEmail, confirmEmailEmail, resetPasswordEmail } from "@/lib/email/templates";
import { confirmUrl } from "@/lib/services/auth-email";

describe("confirmUrl", () => {
  it("points at our own /auth/confirm route with an encoded token", () => {
    const url = confirmUrl({ tokenHash: "abc+/=123", type: "signup", next: "/onboarding" });
    expect(url).toMatch(/^https?:\/\/[^/]+\/auth\/confirm\?/);
    const q = new URL(url).searchParams;
    expect(q.get("token_hash")).toBe("abc+/=123");
    expect(q.get("type")).toBe("signup");
    expect(q.get("next")).toBe("/onboarding");
  });
});

describe("account emails", () => {
  const url = "https://unisphere.example/auth/confirm?token_hash=t&type=signup&next=%2Fonboarding";
  const htmlUrl = url.replace(/&/g, "&amp;"); // attributes are HTML-escaped

  it("confirmation carries the link as a button and as plain text, and escapes the name", () => {
    const mail = confirmEmailEmail({ name: "<b>Asha</b>", url });
    expect(mail.subject).toContain("Confirm");
    expect(mail.html).toContain(`href="${htmlUrl}"`);
    expect(mail.html).not.toContain("<b>Asha</b>");
    expect(mail.text).toContain(url);
    // not an "activity on your account" footer: this person has no account yet
    expect(mail.html).not.toContain("Manage email preferences");
  });

  it("password reset says it can be ignored", () => {
    const mail = resetPasswordEmail({ name: "Asha", url });
    expect(mail.subject).toContain("Reset");
    expect(mail.html).toContain(`href="${htmlUrl}"`);
    expect(mail.html).toMatch(/ignore this email/i);
  });

  it("the 'already have an account' email contains no token", () => {
    const mail = accountExistsEmail();
    expect(mail.html).not.toContain("token_hash");
    expect(mail.html).toContain("/login");
  });
});
