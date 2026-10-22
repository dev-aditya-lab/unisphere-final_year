import { beforeEach, describe, expect, it, vi } from "vitest";
import { signWebhook } from "@/lib/payments/signature";

const env = { RAZORPAY_WEBHOOK_SECRET: "whsec_test_secret" };
const handle = vi.fn(async () => ({ ok: true }));
vi.mock("@/lib/env", () => ({ getEnv: () => env }));
vi.mock("@/lib/services/blue-tick", () => ({ handleWebhookEvent: (...a) => handle(...a) }));
const { POST } = await import("@/app/api/payments/razorpay/webhook/route");

const body = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { order_id: "order_1", amount: 9900, currency: "INR", status: "captured" } } } });
const call = (raw, headers = {}) => POST(new Request("http://localhost/api/payments/razorpay/webhook", { method: "POST", body: raw, headers: { "content-type": "application/json", ...headers } }));

beforeEach(() => {
  handle.mockClear();
  env.RAZORPAY_WEBHOOK_SECRET = "whsec_test_secret";
});

describe("POST /api/payments/razorpay/webhook", () => {
  it("refuses a request with no signature, and never runs the handler", async () => {
    const res = await call(body);
    expect(res.status).toBe(401);
    expect(handle).not.toHaveBeenCalled();
  });

  it("refuses a wrong, malformed or other-secret signature", async () => {
    for (const signature of ["deadbeef", "x".repeat(64), signWebhook({ rawBody: body, secret: "another-secret" }), signWebhook({ rawBody: `${body} `, secret: env.RAZORPAY_WEBHOOK_SECRET })]) {
      expect((await call(body, { "x-razorpay-signature": signature })).status).toBe(401);
    }
    expect(handle).not.toHaveBeenCalled();
  });

  it("accepts a correctly signed body", async () => {
    const res = await call(body, { "x-razorpay-signature": signWebhook({ rawBody: body, secret: env.RAZORPAY_WEBHOOK_SECRET }) });
    expect(res.status).toBe(200);
    expect(handle).toHaveBeenCalledTimes(1);
  });

  it("a replayed delivery is handed to the idempotent handler each time and cannot change the outcome", async () => {
    const headers = { "x-razorpay-signature": signWebhook({ rawBody: body, secret: env.RAZORPAY_WEBHOOK_SECRET }) };
    expect((await call(body, headers)).status).toBe(200);
    expect((await call(body, headers)).status).toBe(200);
    // Exactly-once is enforced where the money moves (fulfil_blue_tick_order, tested in tests/integration/security-hardening.test.js).
    expect(handle).toHaveBeenCalledTimes(2);
  });

  it("tells the provider to retry when handling fails", async () => {
    handle.mockResolvedValueOnce({ ok: false });
    expect((await call(body, { "x-razorpay-signature": signWebhook({ rawBody: body, secret: env.RAZORPAY_WEBHOOK_SECRET }) })).status).toBe(500);
  });

  it("refuses everything when no secret is configured, even a signature made with an empty secret", async () => {
    env.RAZORPAY_WEBHOOK_SECRET = undefined;
    expect((await call(body, { "x-razorpay-signature": signWebhook({ rawBody: body, secret: "" }) })).status).toBe(503);
    expect(handle).not.toHaveBeenCalled();
  });

  it("refuses oversized bodies before verifying anything", async () => {
    expect((await call("x".repeat(300 * 1024), { "x-razorpay-signature": "0".repeat(64) })).status).toBe(413);
  });

  it("answers 400 for a validly signed body that is not JSON", async () => {
    const raw = "not json";
    expect((await call(raw, { "x-razorpay-signature": signWebhook({ rawBody: raw, secret: env.RAZORPAY_WEBHOOK_SECRET }) })).status).toBe(400);
  });
});
