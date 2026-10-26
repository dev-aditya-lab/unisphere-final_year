import { beforeEach, describe, expect, it, vi } from "vitest";

// The hand-over page: a sealed link in, a redirect or a self-submitting form out.
const env = { secret: "s".repeat(48) };
const getAuthUser = vi.fn();
const limit = vi.fn();
vi.mock("@/lib/env", () => ({ getAppSecret: () => env.secret }));
vi.mock("@/lib/auth/session", () => ({ getAuthUser: (...a) => getAuthUser(...a) }));
vi.mock("@/lib/rate-limit", () => ({ getClientIp: async () => "203.0.113.9", rateLimit: (...a) => limit(...a) }));
const { sealCheckout, openCheckout } = await import("@/lib/payments/checkout-token");
const { GET } = await import("@/app/api/payments/checkout/route");

const FORM = { type: "form", action: "https://secure.gateway.example/_payment", method: "POST", fields: { key: "k", email: "a@x.test", note: 'He said "hi" & <b>left</b>' } };
const REDIRECT = { type: "redirect", url: "https://pay.example/c/1" };
const call = (token, headers = {}) => GET(new Request(`http://localhost:3000/api/payments/checkout${token === undefined ? "" : `?t=${encodeURIComponent(token)}`}`, { headers }));

beforeEach(() => {
  env.secret = "s".repeat(48);
  getAuthUser.mockReset();
  getAuthUser.mockResolvedValue({ id: "user-1" });
  limit.mockReset();
  limit.mockResolvedValue({ ok: true });
});

describe("the sealed checkout link", () => {
  it("opens for the member it was made for, and gives back exactly what was sealed", () => {
    const token = sealCheckout({ userId: "user-1", checkout: FORM });
    expect(openCheckout(token, { userId: "user-1" })).toEqual(FORM);
  });

  it("hides what is inside it: no field, address or email can be read from the link", () => {
    const token = sealCheckout({ userId: "user-1", checkout: FORM });
    const decoded = Buffer.from(token.replace(".", ""), "base64url").toString("latin1");
    for (const secret of ["a@x.test", "secure.gateway.example", "user-1", "key"]) expect(`${token}${decoded}`).not.toContain(secret);
  });

  it("is different every time it is made", () => {
    expect(sealCheckout({ userId: "user-1", checkout: FORM })).not.toBe(sealCheckout({ userId: "user-1", checkout: FORM }));
  });

  it("does not open for another member, after it expires, with another secret, or once altered", () => {
    const token = sealCheckout({ userId: "user-1", checkout: FORM, now: 1_000_000 });
    expect(openCheckout(token, { userId: "user-2", now: 1_000_001 })).toBeNull();
    expect(openCheckout(token, { userId: "user-1", now: 1_000_000 + 14 * 60_000 })).toEqual(FORM);
    expect(openCheckout(token, { userId: "user-1", now: 1_000_000 + 16 * 60_000 })).toBeNull();
    const [iv, data] = token.split(".");
    const flipped = `${iv}.${data.slice(0, 10)}${data[10] === "A" ? "B" : "A"}${data.slice(11)}`;
    expect(openCheckout(flipped, { userId: "user-1", now: 1_000_001 })).toBeNull();
    env.secret = "t".repeat(48);
    expect(openCheckout(token, { userId: "user-1", now: 1_000_001 })).toBeNull();
  });

  it("rejects anything that is not a token, without throwing", () => {
    for (const bad of [undefined, null, "", "abc", "a.b", "a.b.c", ".", "x".repeat(20_000), 42, { t: 1 }]) {
      expect(openCheckout(bad, { userId: "user-1" }), String(bad)).toBeNull();
    }
    expect(openCheckout(sealCheckout({ userId: "user-1", checkout: FORM }), { userId: "" })).toBeNull();
  });
});

describe("/api/payments/checkout", () => {
  const where = (res) => new URL(res.headers.get("location"));

  it("sends a member to a gateway's hosted page with a plain redirect", async () => {
    const res = await call(sealCheckout({ userId: "user-1", checkout: REDIRECT }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://pay.example/c/1");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("hands a member to a gateway that wants a form with a page that submits itself, escaping every value", async () => {
    const res = await call(sealCheckout({ userId: "user-1", checkout: FORM }), { "x-nonce": "n0nce" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    const html = await res.text();
    expect(html).toContain('<form id="pay" method="POST" action="https://secure.gateway.example/_payment">');
    expect(html).toContain('<input type="hidden" name="key" value="k">');
    expect(html).toContain('value="He said &quot;hi&quot; &amp; &lt;b&gt;left&lt;/b&gt;"');
    expect(html).not.toContain("<b>left</b>");
    expect(html).toContain('<script nonce="n0nce">document.getElementById("pay").submit();</script>');
    expect(html).toContain('<style nonce="n0nce">');
  });

  it("shows a button instead of a script when it was not given a nonce", async () => {
    const html = await (await call(sealCheckout({ userId: "user-1", checkout: FORM }))).text();
    expect(html).not.toContain("<script");
    expect(html).toContain('<button type="submit">Continue to payment</button>');
    expect(html).not.toContain("<noscript>");
  });

  it("sends anyone without a valid link, or with someone else's, back to the blue tick page", async () => {
    const other = sealCheckout({ userId: "user-2", checkout: REDIRECT });
    for (const token of [undefined, "", "garbage", other]) {
      const res = await call(token);
      expect(res.status, String(token)).toBe(303);
      expect(where(res).origin + where(res).pathname).toBe("http://localhost:3000/settings/blue-tick");
    }
    expect(where(await call(other)).searchParams.get("payment")).toBe("failed");
  });

  it("does nothing for a visitor who is not signed in, or when sign-in cannot be checked", async () => {
    const token = sealCheckout({ userId: "user-1", checkout: REDIRECT });
    getAuthUser.mockResolvedValueOnce(null);
    expect(where(await call(token)).pathname).toBe("/settings/blue-tick");
    getAuthUser.mockRejectedValueOnce(new Error("auth down"));
    const res = await call(token);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).not.toContain("pay.example");
  });

  it("is rate limited per address", async () => {
    limit.mockResolvedValue({ ok: false });
    const res = await call(sealCheckout({ userId: "user-1", checkout: REDIRECT }));
    expect(res.headers.get("location")).not.toContain("pay.example");
    expect(getAuthUser).not.toHaveBeenCalled();
  });
});
