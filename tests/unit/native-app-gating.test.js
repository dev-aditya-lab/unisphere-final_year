import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// What the Android app does differently from the website, and that the website does not change.
const APP_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7; wv) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36 UniSphereApp/2.6.0 (Android)";
const CHROME_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36";

const isNativeAppRequest = vi.fn();
const startPurchase = vi.fn();
const getAuthUser = vi.fn();
const openCheckout = vi.fn();
const updateSession = vi.fn();

vi.mock("@/lib/native-app-server", () => ({ isNativeAppRequest: (...a) => isNativeAppRequest(...a) }));
vi.mock("@/lib/auth/session", () => ({
  requireProfile: async () => ({ user: { id: "u1", email: "a@b.test" }, profile: { id: "u1", username: "asha", full_name: "Asha" } }),
  getAuthUser: (...a) => getAuthUser(...a),
}));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: async () => null, rateLimit: async () => ({ ok: true }), getClientIp: async () => "203.0.113.9" }));
vi.mock("@/lib/services/blue-tick", () => ({ startPurchase: (...a) => startPurchase(...a) }));
vi.mock("@/lib/services/admin", () => ({ findUserByUsername: vi.fn() }));
vi.mock("@/lib/privacy/consent", () => ({ hasConsent: async () => true }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/payments/checkout-token", () => ({ openCheckout: (...a) => openCheckout(...a) }));
vi.mock("@/lib/supabase/proxy", () => ({ updateSession: (...a) => updateSession(...a) }));

const { getPricingSections } = await import("@/lib/content/commerce");
const { startBlueTickPurchaseAction } = await import("@/lib/actions/blue-tick");
const { GET: checkout } = await import("@/app/api/payments/checkout/route");
const { proxy } = await import("@/proxy");

const PAYMENT_WORDS = /₹|\bpay(s|ing|ment|ments|ed)?\b|\bpric(e|es|ing)\b|\bcosts?\b|refund|subscription|\bbuy\b|purchase/i;
const text = (sections) => JSON.stringify(sections.map((s) => [s.heading, ...(s.body ?? []), ...(s.list ?? [])]));

describe("the pricing page in the Android app", () => {
  const blueTick = { open: true, pricePaise: 9900 };

  it("states no price and describes no payment or purchase", () => {
    const sections = getPricingSections({ blueTick, inApp: true });
    expect(sections.map((s) => s.heading)).toEqual(["UniSphere is free", "The blue tick", "What is limited", "Sponsorship and partnerships"]);
    // The one free-of-charge line is allowed to say so; nothing else may mention money.
    const rest = sections.filter((s) => s.heading !== "UniSphere is free");
    expect(text(rest)).not.toMatch(PAYMENT_WORDS);
    expect(text(sections)).not.toContain("99");
  });

  it("still explains what the blue tick is", () => {
    expect(text(getPricingSections({ blueTick, inApp: true }))).toContain("checked an identity document");
  });

  it("is unchanged on the website: price, steps and the payments section", () => {
    const web = getPricingSections({ blueTick });
    expect(web.map((s) => s.heading)).toContain("Payments");
    expect(text(web)).toContain("₹99");
    expect(text(web)).toContain("Pay once");
    expect(text(getPricingSections({ blueTick, inApp: false }))).toBe(text(web));
  });
});

describe("starting a blue tick purchase", () => {
  beforeEach(() => {
    isNativeAppRequest.mockReset();
    startPurchase.mockReset();
    startPurchase.mockResolvedValue({ ok: true, checkoutUrl: "/api/payments/checkout?t=abc", amountPaise: 9900 });
  });

  it("is refused in the app, before anything is created", async () => {
    isNativeAppRequest.mockResolvedValue(true);
    const res = await startBlueTickPurchaseAction();
    expect(res).toMatchObject({ ok: false, code: "not_in_app" });
    expect(startPurchase).not.toHaveBeenCalled();
  });

  it("works as before on the website", async () => {
    isNativeAppRequest.mockResolvedValue(false);
    const res = await startBlueTickPurchaseAction();
    expect(res).toMatchObject({ ok: true, checkoutUrl: "/api/payments/checkout?t=abc" });
    expect(startPurchase).toHaveBeenCalledOnce();
  });
});

describe("the checkout hand-over page", () => {
  beforeEach(() => {
    getAuthUser.mockReset();
    openCheckout.mockReset();
    getAuthUser.mockResolvedValue({ id: "u1" });
    openCheckout.mockReturnValue({ type: "redirect", url: "https://pay.example.test/start" });
  });
  const open = (userAgent) => checkout(new Request("http://localhost:3000/api/payments/checkout?t=abc", { headers: { "user-agent": userAgent } }));

  it("never hands the app to a payment gateway; it goes back to the blue tick page", async () => {
    const res = await open(APP_UA);
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get("location")).pathname).toBe("/settings/blue-tick");
    expect(openCheckout).not.toHaveBeenCalled();
  });

  it("still hands a browser to the gateway", async () => {
    const res = await open(CHROME_UA);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://pay.example.test/start");
  });
});

describe("the landing page in the Android app", () => {
  beforeEach(() => {
    updateSession.mockReset();
    // The maintenance check asks Supabase over the network; here it fails, which means "not in maintenance".
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
  });

  const session = (signedIn, unavailable = false) => ({
    claims: signedIn ? { sub: "u1" } : null,
    supabase: {},
    unavailable,
    requestHeaders: new Headers(),
    finish: (res) => res,
    next: () => NextResponse.next(),
  });
  const visit = (path, userAgent) => proxy(new NextRequest(`http://localhost:3000${path}`, { headers: { "user-agent": userAgent } }));
  const to = (res) => new URL(res.headers.get("location")).pathname;

  it("opens on the feed for a signed-in member, and on sign-in for anyone else, in one hop", async () => {
    updateSession.mockResolvedValue(session(true));
    expect(to(await visit("/", APP_UA))).toBe("/feed");
    updateSession.mockResolvedValue(session(false));
    expect(to(await visit("/", APP_UA))).toBe("/login");
  });

  it("lets the feed show its own retry screen when sign-in cannot be checked", async () => {
    updateSession.mockResolvedValue(session(false, true));
    expect(to(await visit("/", APP_UA))).toBe("/feed");
  });

  it("leaves the website's home page alone", async () => {
    updateSession.mockResolvedValue(session(false));
    const res = await visit("/", CHROME_UA);
    expect(res.headers.get("location")).toBeNull();
    expect(res.status).toBe(200);
  });

  it("does not redirect other pages, such as the pricing page", async () => {
    updateSession.mockResolvedValue(session(false));
    expect((await visit("/pricing", APP_UA)).headers.get("location")).toBeNull();
  });
});
