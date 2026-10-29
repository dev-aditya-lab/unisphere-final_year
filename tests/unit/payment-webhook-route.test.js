import { beforeEach, describe, expect, it, vi } from "vitest";
import { signHmac, verifyHmac } from "@/lib/payments/signature";

// The real route and the real gateway layer, with a fake adapter that authenticates the way most gateways do (HMAC over the
// raw body). Only the database-touching handler and the rate limiter are replaced.
const env = { PAYMENT_GATEWAY: "fakepay", PAYMENT_KEY_ID: "kid", PAYMENT_KEY_SECRET: "ksecret", PAYMENT_WEBHOOK_SECRET: "whsec_test_secret", NODE_ENV: "production" };
const adapter = {
  id: "fakepay",
  label: "FakePay",
  isConfigured: (cfg) => Boolean(cfg.keyId && cfg.keySecret),
  parseWebhook(cfg, { rawBody, headers }) {
    if (!verifyHmac({ message: rawBody, signature: headers.get("x-fakepay-signature"), secret: cfg.webhookSecret })) return { ok: false, status: 401 };
    let e;
    try {
      e = JSON.parse(rawBody);
    } catch {
      return { ok: false, status: 400 };
    }
    return e.type === "payment.succeeded" ? { ok: true, event: { type: "payment.paid", orderId: e.order, paymentId: e.payment } } : { ok: true, event: null };
  },
};
const handle = vi.fn(async () => ({ ok: true }));
const limit = vi.fn(async () => ({ ok: true, resetSec: 60 }));
vi.mock("@/lib/env", () => ({ getEnv: () => env }));
vi.mock("@/lib/payments/gateways", () => ({ GATEWAYS: { fakepay: adapter } }));
vi.mock("@/lib/services/blue-tick", () => ({ handleWebhookEvent: (...a) => handle(...a) }));
// The Academy shares the gateway account; these tests are about the blue tick, so no event is ever the Academy's here.
const academyOwns = vi.fn(async () => false);
const academyHandle = vi.fn(async () => ({ ok: true }));
vi.mock("@/lib/services/academy-commerce", () => ({ ownsAcademyEvent: (...a) => academyOwns(...a), handleAcademyWebhookEvent: (...a) => academyHandle(...a) }));
vi.mock("@/lib/rate-limit", () => ({ getClientIp: async () => "203.0.113.9", rateLimit: (...a) => limit(...a) }));
const { POST } = await import("@/app/api/payments/webhook/route");

const body = JSON.stringify({ type: "payment.succeeded", order: "ord_1", payment: "pay_1" });
const sign = (raw, secret = env.PAYMENT_WEBHOOK_SECRET) => signHmac({ message: raw, secret });
const call = (raw, headers = {}) => POST(new Request("http://localhost/api/payments/webhook", { method: "POST", body: raw, headers: { "content-type": "application/json", ...headers } }));

beforeEach(() => {
  handle.mockClear();
  limit.mockReset();
  limit.mockResolvedValue({ ok: true, resetSec: 60 });
  env.PAYMENT_GATEWAY = "fakepay";
  env.PAYMENT_WEBHOOK_SECRET = "whsec_test_secret";
});

describe("POST /api/payments/webhook", () => {
  it("hands an event to the Academy when the order it names is an Academy order, and not to the blue tick", async () => {
    academyOwns.mockResolvedValueOnce(true);
    const res = await call(body, { "x-fakepay-signature": sign(body) });
    expect(res.status).toBe(200);
    expect(academyHandle).toHaveBeenCalledTimes(1);
    expect(handle).not.toHaveBeenCalled();
  });

  it("refuses a request with no signature, and never runs the handler", async () => {
    const res = await call(body);
    expect(res.status).toBe(401);
    expect(handle).not.toHaveBeenCalled();
  });

  it("refuses a wrong, malformed or other-secret signature", async () => {
    for (const signature of ["deadbeef", "x".repeat(64), sign(body, "another-secret"), sign(`${body} `)]) {
      expect((await call(body, { "x-fakepay-signature": signature })).status).toBe(401);
    }
    expect(handle).not.toHaveBeenCalled();
  });

  it("accepts a correctly signed body and hands the handler a normalized event", async () => {
    const res = await call(body, { "x-fakepay-signature": sign(body) });
    expect(res.status).toBe(200);
    expect(handle).toHaveBeenCalledTimes(1);
    expect(handle).toHaveBeenCalledWith({ type: "payment.paid", orderId: "ord_1", paymentId: "pay_1", reason: null });
  });

  it("acknowledges an event it has no use for without running the handler", async () => {
    const raw = JSON.stringify({ type: "customer.updated" });
    const res = await call(raw, { "x-fakepay-signature": sign(raw) });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ignored: true });
    expect(handle).not.toHaveBeenCalled();
  });

  it("a replayed delivery is handed to the idempotent handler each time and cannot change the outcome", async () => {
    const headers = { "x-fakepay-signature": sign(body) };
    expect((await call(body, headers)).status).toBe(200);
    expect((await call(body, headers)).status).toBe(200);
    // Exactly-once is enforced where the money moves (fulfil_blue_tick_order, tested in tests/integration/security-hardening.test.js).
    expect(handle).toHaveBeenCalledTimes(2);
  });

  it("tells the gateway to retry when handling fails", async () => {
    handle.mockResolvedValueOnce({ ok: false });
    expect((await call(body, { "x-fakepay-signature": sign(body) })).status).toBe(500);
  });

  it("refuses everything when no webhook secret is configured, even a signature made with an empty secret", async () => {
    env.PAYMENT_WEBHOOK_SECRET = undefined;
    expect((await call(body, { "x-fakepay-signature": sign(body, "") })).status).toBe(503);
    expect(handle).not.toHaveBeenCalled();
  });

  it("refuses everything when no gateway is connected", async () => {
    env.PAYMENT_GATEWAY = undefined;
    expect((await call(body, { "x-fakepay-signature": sign(body) })).status).toBe(503);
    expect(handle).not.toHaveBeenCalled();
  });

  it("refuses oversized bodies before verifying anything", async () => {
    expect((await call("x".repeat(300 * 1024), { "x-fakepay-signature": "0".repeat(64) })).status).toBe(413);
    expect(limit).not.toHaveBeenCalled();
  });

  it("answers 400 for a validly signed body that is not JSON", async () => {
    const raw = "not json";
    expect((await call(raw, { "x-fakepay-signature": sign(raw) })).status).toBe(400);
  });

  it("slows down a source that keeps sending bad signatures, but never counts a good delivery", async () => {
    await call(body, { "x-fakepay-signature": sign(body) });
    expect(limit).not.toHaveBeenCalled();
    limit.mockResolvedValueOnce({ ok: false, resetSec: 300 });
    const res = await call(body, { "x-fakepay-signature": "bad" });
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("300");
    expect(limit).toHaveBeenCalledWith(expect.objectContaining({ key: "pay-webhook-bad:203.0.113.9" }));
  });
});
