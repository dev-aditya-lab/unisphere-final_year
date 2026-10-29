import { beforeEach, describe, expect, it, vi } from "vitest";

const resend = vi.fn();
vi.mock("@/lib/env", () => ({
  getEnv: () => ({ EMAIL_FROM: "UniSphere <no-reply@example.com>", ACADEMY_EMAIL_FROM: "UniSphere Academy <no-reply@system.unispheres.in>", RESEND_API_KEY: "re_test", NODE_ENV: "production" }),
}));

const { academyReceiptEmail, academySender, ACADEMY_BRAND } = await import("@/lib/email/academy");
const { notificationEmail } = await import("@/lib/email/templates");

const order = { id: "o1", order_no: "AC-0001", list_minor: 499900, sale_discount_minor: 0, coupon_discount_minor: 50000, coupon_code: "WELCOME10", tax_minor: 0, tax_mode: "none", total_minor: 449900 };

describe("Academy mail", () => {
  beforeEach(() => resend.mockReset());

  it("is sent from UniSphere Academy at the system address", () => {
    expect(academySender()).toBe("UniSphere Academy <no-reply@system.unispheres.in>");
  });

  it("receipt shows the figures from the stored order and the Academy name", () => {
    const mail = academyReceiptEmail({ name: "Asha", order, title: "Full-Stack Web" });
    expect(mail.subject).toContain("AC-0001");
    expect(mail.html).toContain(ACADEMY_BRAND);
    expect(mail.html).toContain("₹4,999.00");
    expect(mail.html).toContain("₹4,499.00");
    expect(mail.html).toContain("WELCOME10");
    expect(mail.text).toContain("Paid: ₹4,499.00");
    expect(mail.text).not.toContain("<");
  });

  it("escapes anything a person typed (name, course title)", () => {
    const mail = academyReceiptEmail({ name: "<script>x</script>", order, title: "<img src=x onerror=1>" });
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).not.toContain("<img src=x");
  });

  it("states tax only when there is some", () => {
    expect(academyReceiptEmail({ name: "A", order, title: "T" }).html).not.toContain("Includes tax");
    expect(academyReceiptEmail({ name: "A", order: { ...order, tax_mode: "inclusive", tax_minor: 68600 }, title: "T" }).html).toContain("Includes tax");
  });

  it("an Academy digest carries the Academy name and links to the Academy", () => {
    const mail = notificationEmail({ name: "Asha", lines: [{ text: "You are enrolled in X" }, { text: "Assignment due" }], brand: ACADEMY_BRAND, openLabel: "Open UniSphere Academy", openPath: "/academy/dashboard" });
    expect(mail.subject).toContain(ACADEMY_BRAND);
    expect(mail.html).toContain("/academy/dashboard");
  });

  it("the default notification email is unchanged", () => {
    const mail = notificationEmail({ name: "Asha", lines: [{ text: "Someone followed you" }] });
    expect(mail.html).toContain("/notifications");
    expect(mail.html).not.toContain(ACADEMY_BRAND);
  });
});

describe("sendEmail sender", () => {
  async function sendWith(from) {
    vi.resetModules();
    vi.doMock("@/lib/env", () => ({
      getEnv: () => ({ EMAIL_FROM: "UniSphere <no-reply@example.com>", RESEND_API_KEY: "re_test", NODE_ENV: "production" }),
      getIntegrations: () => ({ email: true, emailViaMailpit: false }),
    }));
    vi.doMock("resend", () => ({
      Resend: class {
        emails = { send: async (body) => { resend(body); return { data: { id: "m1" }, error: null }; } };
      },
    }));
    const { sendEmail } = await import("@/lib/email");
    return sendEmail({ to: "a@example.com", subject: "s", html: "<p>x</p>", text: "x", from });
  }

  it("uses a well-formed internal sender", async () => {
    await sendWith("UniSphere Academy <no-reply@system.unispheres.in>");
    expect(resend.mock.calls[0]?.[0]?.from).toBe("UniSphere Academy <no-reply@system.unispheres.in>");
  });

  it("falls back to the default when the sender could inject a header", async () => {
    await sendWith("Evil <a@b.co>\r\nBcc: x@y.z");
    expect(resend.mock.calls[0]?.[0]?.from).toBe("UniSphere <no-reply@example.com>");
  });
});
