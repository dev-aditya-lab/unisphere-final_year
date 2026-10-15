import { describe, expect, it } from "vitest";
import { signCheckout, signWebhook, verifyCheckoutSignature, verifyWebhookSignature } from "@/lib/payments/signature";
import { formatInr, paiseToRupeesInput, rupeesToPaise } from "@/lib/blue-tick";
import { buildCsp } from "@/lib/security/csp";

const SECRET = "test_secret_value";

describe("Razorpay checkout signature", () => {
  const sig = signCheckout({ orderId: "order_ABC123", paymentId: "pay_XYZ789", secret: SECRET });

  it("accepts the signature computed over order_id|payment_id", () => {
    expect(verifyCheckoutSignature({ orderId: "order_ABC123", paymentId: "pay_XYZ789", signature: sig, secret: SECRET })).toBe(true);
  });
  it("rejects a different order, payment, secret or a tampered signature", () => {
    expect(verifyCheckoutSignature({ orderId: "order_OTHER1", paymentId: "pay_XYZ789", signature: sig, secret: SECRET })).toBe(false);
    expect(verifyCheckoutSignature({ orderId: "order_ABC123", paymentId: "pay_OTHER1", signature: sig, secret: SECRET })).toBe(false);
    expect(verifyCheckoutSignature({ orderId: "order_ABC123", paymentId: "pay_XYZ789", signature: sig, secret: "wrong" })).toBe(false);
    expect(verifyCheckoutSignature({ orderId: "order_ABC123", paymentId: "pay_XYZ789", signature: sig.replace(/.$/, sig.endsWith("0") ? "1" : "0"), secret: SECRET })).toBe(false);
  });
  it("rejects missing, short or non-hex signatures without throwing", () => {
    for (const bad of [undefined, null, "", "abc", "z".repeat(64), `${sig}00`, 42]) {
      expect(verifyCheckoutSignature({ orderId: "order_ABC123", paymentId: "pay_XYZ789", signature: bad, secret: SECRET })).toBe(false);
    }
    expect(verifyCheckoutSignature({ orderId: "order_ABC123", paymentId: "pay_XYZ789", signature: sig, secret: "" })).toBe(false);
  });
});

describe("Razorpay webhook signature", () => {
  const body = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_1", order_id: "order_1", amount: 9900 } } } });
  const sig = signWebhook({ rawBody: body, secret: SECRET });

  it("verifies the exact raw body only", () => {
    expect(verifyWebhookSignature({ rawBody: body, signature: sig, secret: SECRET })).toBe(true);
    expect(verifyWebhookSignature({ rawBody: `${body} `, signature: sig, secret: SECRET })).toBe(false);
    expect(verifyWebhookSignature({ rawBody: body.replace("9900", "100"), signature: sig, secret: SECRET })).toBe(false);
  });
  it("refuses when no secret is configured", () => {
    expect(verifyWebhookSignature({ rawBody: body, signature: sig, secret: undefined })).toBe(false);
    expect(verifyWebhookSignature({ rawBody: body, signature: sig, secret: "" })).toBe(false);
  });
});

describe("price handling", () => {
  it("converts what an administrator types into paise, within limits", () => {
    expect(rupeesToPaise("99")).toBe(9900);
    expect(rupeesToPaise(" 99.5 ")).toBe(9950);
    expect(rupeesToPaise("1")).toBe(100);
    expect(rupeesToPaise("100000")).toBe(10_000_000);
  });
  it("rejects anything that is not a plain amount in range", () => {
    for (const bad of ["", "0", "0.50", "-5", "abc", "1e3", "99.999", "100001", "1,000", "₹99", null, undefined]) {
      expect(rupeesToPaise(bad), String(bad)).toBeNull();
    }
  });
  it("round-trips for the admin form and formats Indian rupees", () => {
    expect(paiseToRupeesInput(9900)).toBe("99");
    expect(paiseToRupeesInput(9950)).toBe("99.50");
    expect(formatInr(9900)).toContain("99");
    expect(formatInr(9950)).toContain("99.50");
    expect(formatInr(9900, { withZero: true })).toContain("99.00");
  });
});

describe("Content-Security-Policy for checkout", () => {
  const env = { NEXT_PUBLIC_APP_URL: "https://unispheres.in", NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co" };

  it("admits Razorpay only when checkout is requested", () => {
    expect(buildCsp({ nonce: "n", env })).not.toMatch(/razorpay/);
    const csp = buildCsp({ nonce: "n", env, checkout: true });
    expect(csp).toMatch(/script-src[^;]*https:\/\/checkout\.razorpay\.com/);
    expect(csp).toMatch(/frame-src[^;]*https:\/\/api\.razorpay\.com/);
    expect(csp).toMatch(/connect-src[^;]*https:\/\/api\.razorpay\.com/);
  });
  it("keeps the rest of the policy strict while checkout is allowed", () => {
    const csp = buildCsp({ nonce: "n", env, checkout: true });
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(buildCsp({ nonce: "n", env })).toMatch(/frame-src 'none'/);
  });
});
