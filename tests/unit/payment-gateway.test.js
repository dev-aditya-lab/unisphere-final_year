import { beforeEach, describe, expect, it, vi } from "vitest";

// The gateway layer is tested against a fake adapter, so nothing here depends on, or names, a real payment company.
const env = { PAYMENT_GATEWAY: "fakepay", PAYMENT_KEY_ID: "kid", PAYMENT_KEY_SECRET: "ksecret", PAYMENT_WEBHOOK_SECRET: "whsec", PAYMENT_API_BASE_URL: undefined, NODE_ENV: "production" };
const adapter = {
  id: "fakepay",
  label: "FakePay",
  isConfigured: (cfg) => Boolean(cfg.keyId && cfg.keySecret),
  createOrder: vi.fn(),
  getOrderPayment: vi.fn(),
  refundPayment: vi.fn(),
  parseWebhook: vi.fn(),
};
const GATEWAYS = { fakepay: adapter };
vi.mock("@/lib/env", () => ({ getEnv: () => env }));
vi.mock("@/lib/payments/gateways", () => ({ GATEWAYS }));

const gateway = await import("@/lib/payments/gateway");

const order = { amountPaise: 9900, reference: "bt_abc", description: "d", returnUrl: "https://app.example/api/payments/return?o=1", customer: { id: "u", name: "N", email: "e@x.test" }, notes: {} };
const goodPayment = { id: "pay_1", orderId: "ord_1", amountPaise: 9900, currency: "inr", status: "paid", method: "upi" };

beforeEach(() => {
  Object.assign(env, { PAYMENT_GATEWAY: "fakepay", PAYMENT_KEY_ID: "kid", PAYMENT_KEY_SECRET: "ksecret", PAYMENT_WEBHOOK_SECRET: "whsec", NODE_ENV: "production" });
  for (const fn of [adapter.createOrder, adapter.getOrderPayment, adapter.refundPayment, adapter.parseWebhook]) fn.mockReset();
  delete adapter.capturePayment;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("which gateway is connected", () => {
  it("is off until PAYMENT_GATEWAY names an adapter that exists and its keys are set", () => {
    env.PAYMENT_GATEWAY = undefined;
    expect(gateway.paymentsStatus()).toMatchObject({ wanted: null, adapterFound: false, configured: false });
    for (const name of ["nosuchgateway", "constructor", "__proto__", "toString"]) {
      env.PAYMENT_GATEWAY = name;
      expect(gateway.paymentsStatus(), name).toMatchObject({ adapterFound: false, configured: false });
    }
    env.PAYMENT_GATEWAY = " FakePay ";
    expect(gateway.paymentsStatus()).toMatchObject({ id: "fakepay", label: "FakePay", configured: true, webhookReady: true });
    env.PAYMENT_KEY_SECRET = undefined;
    expect(gateway.paymentsStatus()).toMatchObject({ adapterFound: true, configured: false, webhookReady: false });
    expect(gateway.paymentsConfigured()).toBe(false);
  });

  it("has a webhook only when its secret is set, unless the adapter decides otherwise", () => {
    env.PAYMENT_WEBHOOK_SECRET = undefined;
    expect(gateway.paymentsStatus()).toMatchObject({ configured: true, webhookReady: false });
    adapter.webhookReady = () => true;
    expect(gateway.paymentsStatus().webhookReady).toBe(true);
    delete adapter.webhookReady;
  });

  it("tells administrators in plain words what is missing", () => {
    env.PAYMENT_GATEWAY = undefined;
    expect(gateway.describePaymentsStatus().blocking).toMatch(/PAYMENT_GATEWAY/);
    env.PAYMENT_GATEWAY = "nosuchgateway";
    expect(gateway.describePaymentsStatus().blocking).toMatch(/no adapter/);
    env.PAYMENT_GATEWAY = "fakepay";
    env.PAYMENT_KEY_ID = undefined;
    expect(gateway.describePaymentsStatus().blocking).toMatch(/FakePay/);
    env.PAYMENT_KEY_ID = "kid";
    env.PAYMENT_WEBHOOK_SECRET = undefined;
    expect(gateway.describePaymentsStatus()).toMatchObject({ blocking: null, warning: expect.stringMatching(/webhook/) });
    env.PAYMENT_WEBHOOK_SECRET = "whsec";
    expect(gateway.describePaymentsStatus()).toEqual({ blocking: null, warning: null });
  });

  it("refuses every call while nothing is connected, without reaching an adapter", async () => {
    env.PAYMENT_GATEWAY = undefined;
    expect(await gateway.createOrder(order)).toMatchObject({ ok: false, code: "payments_unconfigured" });
    expect(await gateway.getOrderPayment("ord_1")).toMatchObject({ ok: false, code: "payments_unconfigured" });
    expect(await gateway.refundPayment({ paymentId: "pay_1", amountPaise: 100, reason: "x" })).toMatchObject({ ok: false, code: "payments_unconfigured" });
    expect(adapter.createOrder).not.toHaveBeenCalled();
  });
});

describe("creating an order", () => {
  it("hands the adapter the generic settings and the amount, and returns only a checked checkout", async () => {
    adapter.createOrder.mockResolvedValue({ ok: true, orderId: "ord_1", checkout: { type: "redirect", url: "https://pay.example/c/1", extra: "dropped" } });
    const res = await gateway.createOrder(order);
    expect(res).toEqual({ ok: true, orderId: "ord_1", checkout: { type: "redirect", url: "https://pay.example/c/1" } });
    expect(adapter.createOrder).toHaveBeenCalledWith({ keyId: "kid", keySecret: "ksecret", webhookSecret: "whsec", baseUrl: undefined }, expect.objectContaining({ amountPaise: 9900, currency: "INR", reference: "bt_abc" }));
  });

  it("accepts a form checkout with plain string fields", async () => {
    adapter.createOrder.mockResolvedValue({ ok: true, orderId: "ord_1", checkout: { type: "form", action: "https://pay.example/post", fields: { a: "1", b: "2" } } });
    expect((await gateway.createOrder(order)).checkout).toEqual({ type: "form", action: "https://pay.example/post", method: "POST", fields: { a: "1", b: "2" } });
  });

  it("never lets an unsafe or malformed checkout reach the browser", async () => {
    const bad = [
      { type: "redirect", url: "javascript:alert(1)" },
      { type: "redirect", url: "http://pay.example/c" },
      { type: "redirect", url: "data:text/html,x" },
      { type: "redirect", url: "not a url" },
      { type: "redirect", url: `https://pay.example/${"a".repeat(5000)}` },
      { type: "form", action: "http://pay.example/post", fields: {} },
      { type: "form", action: "https://pay.example/post", fields: { a: 1 } },
      { type: "form", action: "https://pay.example/post", fields: { "": "x" } },
      { type: "popup", url: "https://pay.example" },
      null,
    ];
    for (const checkout of bad) {
      adapter.createOrder.mockResolvedValueOnce({ ok: true, orderId: "ord_1", checkout });
      expect(await gateway.createOrder(order), JSON.stringify(checkout)).toMatchObject({ ok: false, code: "provider_error" });
    }
  });

  it("allows plain http to localhost outside production only", async () => {
    adapter.createOrder.mockResolvedValue({ ok: true, orderId: "ord_1", checkout: { type: "redirect", url: "http://localhost:4000/pay" } });
    expect((await gateway.createOrder(order)).ok).toBe(false);
    env.NODE_ENV = "development";
    expect((await gateway.createOrder(order)).ok).toBe(true);
  });

  it("rejects an order id that is empty, has spaces or control characters, or is absurdly long", async () => {
    for (const orderId of ["", "has space", "line\nbreak", "x".repeat(201), 42, null]) {
      adapter.createOrder.mockResolvedValueOnce({ ok: true, orderId, checkout: { type: "redirect", url: "https://pay.example/c" } });
      expect((await gateway.createOrder(order)).ok, String(orderId)).toBe(false);
    }
  });

  it("passes an adapter failure through, and turns a thrown error into a safe message that leaks nothing", async () => {
    adapter.createOrder.mockResolvedValueOnce({ ok: false, error: "The payment provider is not reachable right now.", code: "provider_unreachable" });
    expect(await gateway.createOrder(order)).toMatchObject({ ok: false, code: "provider_unreachable" });
    adapter.createOrder.mockRejectedValueOnce(new Error("secret ksecret leaked in a stack trace"));
    const res = await gateway.createOrder(order);
    expect(res).toMatchObject({ ok: false, code: "provider_error" });
    expect(JSON.stringify(res)).not.toMatch(/ksecret|stack/);
  });
});

describe("asking the gateway about an order", () => {
  it("returns a normalized payment", async () => {
    adapter.getOrderPayment.mockResolvedValue({ ok: true, payment: goodPayment });
    expect(await gateway.getOrderPayment("ord_1")).toEqual({ ok: true, payment: { id: "pay_1", orderId: "ord_1", amountPaise: 9900, currency: "INR", status: "paid", method: "upi" } });
    expect(adapter.getOrderPayment).toHaveBeenCalledWith(expect.any(Object), { orderId: "ord_1" });
  });

  it("returns payment null when the member has not paid yet", async () => {
    adapter.getOrderPayment.mockResolvedValue({ ok: true, payment: null });
    expect(await gateway.getOrderPayment("ord_1")).toEqual({ ok: true, payment: null });
  });

  it("rejects a payment that is malformed: fractional or negative amounts, unknown status, missing ids", async () => {
    for (const patch of [{ amountPaise: 99.5 }, { amountPaise: -1 }, { amountPaise: "9900" }, { status: "captured" }, { id: "" }, { orderId: undefined }, { currency: undefined }]) {
      adapter.getOrderPayment.mockResolvedValueOnce({ ok: true, payment: { ...goodPayment, ...patch } });
      expect((await gateway.getOrderPayment("ord_1")).ok, JSON.stringify(patch)).toBe(false);
    }
  });

  it("captures only if the adapter can, and checks what comes back", async () => {
    expect(await gateway.capturePayment({ paymentId: "pay_1", amountPaise: 9900 })).toMatchObject({ ok: false, code: "unsupported" });
    adapter.capturePayment = vi.fn().mockResolvedValue({ ok: true, payment: { ...goodPayment, status: "paid" } });
    expect((await gateway.capturePayment({ paymentId: "pay_1", amountPaise: 9900 })).payment.status).toBe("paid");
    adapter.capturePayment.mockResolvedValue({ ok: true, payment: { id: "pay_1" } });
    expect((await gateway.capturePayment({ paymentId: "pay_1", amountPaise: 9900 })).ok).toBe(false);
  });
});

describe("refunds", () => {
  it("passes the reason (shortened) and reports only what an administrator may see", async () => {
    adapter.refundPayment.mockResolvedValueOnce({ ok: true });
    expect(await gateway.refundPayment({ paymentId: "pay_1", amountPaise: 9900, reason: "r".repeat(500) })).toEqual({ ok: true });
    expect(adapter.refundPayment.mock.calls[0][1].reason).toHaveLength(200);
    adapter.refundPayment.mockResolvedValueOnce({ ok: false, error: "The payment provider could not complete that.", code: "provider_error", providerMessage: "Refund window closed", internal: "token abc" });
    const failed = await gateway.refundPayment({ paymentId: "pay_1", amountPaise: 9900, reason: "x" });
    expect(failed).toEqual({ ok: false, error: "The payment provider could not complete that.", code: "provider_error", providerMessage: "Refund window closed" });
  });
});

describe("webhooks", () => {
  const input = { rawBody: "{}", headers: new Headers() };

  it("refuses without a webhook secret and never calls the adapter", async () => {
    env.PAYMENT_WEBHOOK_SECRET = undefined;
    expect(await gateway.parseWebhook(input)).toEqual({ ok: false, status: 503, code: "not_configured" });
    env.PAYMENT_GATEWAY = undefined;
    expect(await gateway.parseWebhook(input)).toMatchObject({ ok: false, status: 503 });
    expect(adapter.parseWebhook).not.toHaveBeenCalled();
  });

  it("maps the adapter's refusal to 401 (bad signature) or 400 (unreadable) and nothing else", async () => {
    adapter.parseWebhook.mockResolvedValueOnce({ ok: false, status: 401 });
    expect(await gateway.parseWebhook(input)).toMatchObject({ ok: false, status: 401, code: "invalid_signature" });
    adapter.parseWebhook.mockResolvedValueOnce({ ok: false, status: 400 });
    expect(await gateway.parseWebhook(input)).toMatchObject({ ok: false, status: 400, code: "invalid_payload" });
    adapter.parseWebhook.mockResolvedValueOnce({ ok: false, status: 200 });
    expect(await gateway.parseWebhook(input)).toMatchObject({ ok: false, status: 401 });
    adapter.parseWebhook.mockResolvedValueOnce(undefined);
    expect(await gateway.parseWebhook(input)).toMatchObject({ ok: false, status: 401 });
  });

  it("answers 500 when the adapter throws, so the gateway retries", async () => {
    adapter.parseWebhook.mockRejectedValueOnce(new Error("boom"));
    expect(await gateway.parseWebhook(input)).toMatchObject({ ok: false, status: 500 });
  });

  it("normalizes events and drops ones that are unknown or lack the id they need", async () => {
    const cases = [
      [{ type: "payment.paid", orderId: "ord_1", paymentId: "pay_1", junk: 1 }, { type: "payment.paid", orderId: "ord_1", paymentId: "pay_1", reason: null }],
      [{ type: "payment.failed", orderId: "ord_1", reason: "x".repeat(300) }, { type: "payment.failed", orderId: "ord_1", paymentId: null, reason: "x".repeat(120) }],
      [{ type: "refund.done", paymentId: "pay_1" }, { type: "refund.done", paymentId: "pay_1" }],
      [{ type: "payment.paid" }, null],
      [{ type: "refund.done", orderId: "ord_1" }, null],
      [{ type: "something.else", orderId: "ord_1" }, null],
      [{ type: "payment.paid", orderId: "bad id" }, null],
      [null, null],
    ];
    for (const [event, expected] of cases) {
      adapter.parseWebhook.mockResolvedValueOnce({ ok: true, event });
      expect(await gateway.parseWebhook(input), JSON.stringify(event)).toEqual({ ok: true, event: expected });
    }
  });
});
