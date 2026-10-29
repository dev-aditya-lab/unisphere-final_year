import { beforeEach, describe, expect, it, vi } from "vitest";

const env = { ACADEMY_EMAIL_FROM: "UniSphere Academy <no-reply@system.unispheres.in>", EMAIL_FROM: "UniSphere <no-reply@example.com>" };
vi.mock("@/lib/env", () => ({ getEnv: () => env, getAppSecret: () => "s".repeat(40) }));
vi.mock("@/lib/env-public", () => ({ publicEnv: { appUrl: "https://unispheres.in" } }));

const sendEmail = vi.fn(async () => ({ ok: true }));
vi.mock("@/lib/email", () => ({ sendEmail: (...a) => sendEmail(...a) }));
const flag = { on: true };
vi.mock("@/lib/settings", () => ({ isFlagEnabled: async () => flag.on }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/services/academy", () => ({ academyRpc: vi.fn(), rpcFailure: vi.fn() }));
vi.mock("@/lib/payments/checkout-token", () => ({ sealCheckout: () => "t" }));
vi.mock("@/lib/blue-tick", () => ({ PAYMENT_CHECKOUT_PATH: "/x", PAYMENT_RETURN_PATH: "/y" }));

const gateway = {
  getOrderPayment: vi.fn(async () => ({ ok: true, payment: { id: "pay1", orderId: "go1", status: "paid", amountPaise: 100000, currency: "INR", method: "upi" } })),
  refundPayment: vi.fn(async () => ({ ok: true })),
};
vi.mock("@/lib/payments/gateway", () => ({
  capturePayment: vi.fn(), createOrder: vi.fn(), getGateway: () => ({ id: "test" }), paymentsConfigured: () => true, paymentsStatus: () => ({}),
  getOrderPayment: (...a) => gateway.getOrderPayment(...a), refundPayment: (...a) => gateway.refundPayment(...a),
}));

const fulfil = { value: { ok: true, order_id: "o1" } };
const notificationUpdates = [];
const orderRow = { id: "o1", user_id: "u1", order_no: "AO-2026-000001", list_minor: 100000, sale_discount_minor: 0, coupon_discount_minor: 0, coupon_code: null, tax_minor: 0, tax_mode: "none", total_minor: 100000, academy_order_items: [{ title: "Full-Stack Web" }] };
const chain = (result) => {
  const q = { select: () => q, eq: () => q, maybeSingle: async () => result, update: (patch) => { notificationUpdates.push(patch); return q; }, then: (res) => res({ error: null }) };
  return q;
};
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async (name) => (name === "academy_fulfil_order" ? { data: fulfil.value, error: null } : { data: null, error: null }),
    from: (table) => chain(table === "academy_orders" ? { data: orderRow } : table === "profiles" ? { data: { full_name: "Asha", status: "active" } } : { data: null }),
    auth: { admin: { getUserById: async () => ({ data: { user: { email: "asha@example.com" } } }) } },
  }),
}));

const { confirmAcademyReturn } = await import("@/lib/services/academy-commerce");
const order = { id: "o1", user_id: "u1", status: "pending", provider: "test", provider_order_id: "go1", total_minor: 100000, currency: "INR" };

beforeEach(() => {
  sendEmail.mockClear();
  notificationUpdates.length = 0;
  flag.on = true;
  fulfil.value = { ok: true, order_id: "o1" };
});

describe("the Academy payment receipt", () => {
  it("is sent from the Academy address the first time an order is recorded as paid", async () => {
    const res = await confirmAcademyReturn(order);
    expect(res.state).toBe("done");
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const mail = sendEmail.mock.calls[0][0];
    expect(mail).toMatchObject({ to: "asha@example.com", from: "UniSphere Academy <no-reply@system.unispheres.in>", idempotencyKey: "acad-receipt:o1" });
    expect(mail.subject).toContain("AO-2026-000001");
    expect(mail.html).toContain("Full-Stack Web");
    expect(notificationUpdates[0]).toMatchObject({ email_status: "sent" });   // the digest will not repeat it
  });
  it("is not sent again when the payment was already recorded (webhook and return page both arrive)", async () => {
    fulfil.value = { ok: true, already: true, order_id: "o1" };
    expect((await confirmAcademyReturn(order)).state).toBe("done");
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it("is not sent for a duplicate purchase that was refunded", async () => {
    fulfil.value = { ok: true, duplicate: true, order_id: "o1" };
    expect((await confirmAcademyReturn(order)).state).toBe("duplicate");
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it("respects the global email switch, and never fails the payment when mail fails", async () => {
    flag.on = false;
    expect((await confirmAcademyReturn(order)).state).toBe("done");
    expect(sendEmail).not.toHaveBeenCalled();
    flag.on = true;
    sendEmail.mockRejectedValueOnce(new Error("provider down"));
    expect((await confirmAcademyReturn(order)).state).toBe("done");
  });
  it("leaves the notification for the digest if the receipt could not be sent", async () => {
    sendEmail.mockResolvedValueOnce({ ok: false, reason: "provider_error" });
    await confirmAcademyReturn(order);
    expect(notificationUpdates).toHaveLength(0);
  });
});
