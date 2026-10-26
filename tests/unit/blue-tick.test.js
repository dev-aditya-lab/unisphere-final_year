import { describe, expect, it } from "vitest";
import { signHmac, verifyHmac } from "@/lib/payments/signature";
import { formatInr, paiseToRupeesInput, rupeesToPaise } from "@/lib/blue-tick";
import { buildCsp } from "@/lib/security/csp";

const SECRET = "test_secret_value";

describe("HMAC signatures (what gateway adapters verify webhooks with)", () => {
  const message = "order_ABC123|pay_XYZ789";
  const sig = signHmac({ message, secret: SECRET });

  it("accepts the signature computed over exactly that message", () => {
    expect(verifyHmac({ message, signature: sig, secret: SECRET })).toBe(true);
    expect(verifyHmac({ message, signature: sig.toUpperCase(), secret: SECRET })).toBe(true); // hex has one value, any case
  });
  it("rejects a different message, secret or a tampered signature", () => {
    expect(verifyHmac({ message: "order_OTHER1|pay_XYZ789", signature: sig, secret: SECRET })).toBe(false);
    expect(verifyHmac({ message: `${message} `, signature: sig, secret: SECRET })).toBe(false);
    expect(verifyHmac({ message, signature: sig, secret: "wrong" })).toBe(false);
    expect(verifyHmac({ message, signature: sig.replace(/.$/, sig.endsWith("0") ? "1" : "0"), secret: SECRET })).toBe(false);
  });
  it("rejects missing, short or non-hex signatures without throwing", () => {
    for (const bad of [undefined, null, "", "abc", "z".repeat(64), `${sig}00`, 42]) {
      expect(verifyHmac({ message, signature: bad, secret: SECRET }), String(bad)).toBe(false);
    }
  });
  it("refuses when no secret is configured, even for a signature made with an empty one", () => {
    expect(verifyHmac({ message, signature: sig, secret: undefined })).toBe(false);
    expect(verifyHmac({ message, signature: sig, secret: "" })).toBe(false);
    expect(verifyHmac({ message, signature: signHmac({ message, secret: "" }), secret: "" })).toBe(false);
  });
  it("supports the other hashes and encodings gateways use, and base64 is case-sensitive", () => {
    const b64 = signHmac({ message, secret: SECRET, algorithm: "sha512", encoding: "base64" });
    expect(verifyHmac({ message, signature: b64, secret: SECRET, algorithm: "sha512", encoding: "base64" })).toBe(true);
    expect(verifyHmac({ message, signature: b64.toLowerCase(), secret: SECRET, algorithm: "sha512", encoding: "base64" })).toBe(false);
    expect(verifyHmac({ message, signature: b64, secret: SECRET })).toBe(false); // wrong algorithm and encoding
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

describe("Content-Security-Policy on the page where a member pays", () => {
  const env = { NEXT_PUBLIC_APP_URL: "https://unispheres.in", NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co" };
  const directive = (csp, name) => csp.split("; ").find((d) => d.startsWith(`${name} `));

  it("admits no payment company at all: the member pays on the gateway's own page", () => {
    for (const checkout of [false, true]) {
      const csp = buildCsp({ nonce: "n", env, checkout });
      expect(directive(csp, "script-src")).not.toMatch(/https:\/\/(?!x\.supabase)/);
      expect(directive(csp, "frame-src")).toBe("frame-src 'none'");
      expect(directive(csp, "connect-src")).not.toMatch(/pay|checkout/i);
    }
  });
  it("lets only the payment page post a form, and only to the https origins listed for it", () => {
    const withForm = { ...env, PAYMENT_FORM_ACTION_ORIGINS: "https://secure.gateway.example/pay, http://insecure.example, not a url, https://secure.gateway.example" };
    expect(directive(buildCsp({ nonce: "n", env: withForm }), "form-action")).toBe("form-action 'self'");
    expect(directive(buildCsp({ nonce: "n", env: withForm, checkout: true }), "form-action")).toBe("form-action 'self' https://secure.gateway.example");
    expect(directive(buildCsp({ nonce: "n", env, checkout: true }), "form-action")).toBe("form-action 'self'");
  });
  it("keeps the rest of the policy strict", () => {
    const csp = buildCsp({ nonce: "n", env, checkout: true });
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });
});
