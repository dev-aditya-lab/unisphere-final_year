import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, cleanupUsers, createUser, grantRoleDirect } from "../helpers/supabase.js";

/** The blue tick tells the member what happened (migration 0064): payment, approval, rejection, refund, free grant, removal. */
const tag = Math.random().toString(36).slice(2, 8);
let staff, alice, bob, carol;

const events = async (user) =>
  (await admin.from("notifications").select("type, category, data, pushed_at, read_at").eq("user_id", user.id).eq("type", "moderation_blue_tick").order("created_at")).data;
const pay = async (user, n) => {
  const order = `order_bt_${tag}_${n}`;
  expect((await admin.from("blue_tick_orders").insert({ user_id: user.id, payer_username: user.username, provider: "test", provider_order_id: order, amount_paise: 9900 })).error).toBeNull();
  const res = await admin.rpc("fulfil_blue_tick_order", { p_order: order, p_payment: `pay_bt_${tag}_${n}`, p_amount: 9900, p_method: "upi" });
  expect(res.error).toBeNull();
  return { order, payment: `pay_bt_${tag}_${n}`, application: res.data.application_id };
};

beforeAll(async () => {
  staff = await createUser("bt-staff");
  await grantRoleDirect(staff.id, "global_admin");
  alice = await createUser("bt-alice");
  bob = await createUser("bt-bob");
  carol = await createUser("bt-carol");
});
afterAll(async () => {
  for (const u of [alice, bob, carol]) {
    await admin.from("blue_tick_applications").delete().eq("user_id", u.id);
    await admin.from("blue_tick_orders").delete().eq("user_id", u.id);
  }
  await cleanupUsers();
});

describe("blue tick notifications", () => {
  let aliceOrder;

  it("sends a receipt when the payment arrives, in the account category, to be pushed", async () => {
    aliceOrder = await pay(alice, 1);
    const [first] = await events(alice);
    expect(first).toMatchObject({ type: "moderation_blue_tick", category: "moderation", data: { event: "paid" }, pushed_at: null, read_at: null });
  });

  it("does not send a second receipt when the gateway repeats the confirmation", async () => {
    await admin.rpc("fulfil_blue_tick_order", { p_order: aliceOrder.order, p_payment: aliceOrder.payment, p_amount: 9900, p_method: "upi" });
    expect(await events(alice)).toHaveLength(1);
  });

  it("tells the member their tick is approved", async () => {
    await admin.from("blue_tick_applications").update({ status: "pending_review" }).eq("id", aliceOrder.application);
    const res = await staff.client.rpc("review_blue_tick_application", { p_id: aliceOrder.application, p_decision: "approve" });
    expect(res.error).toBeNull();
    const list = await events(alice);
    expect(list.at(-1).data).toMatchObject({ event: "approved" });
    expect((await admin.from("profiles").select("blue_tick").eq("id", alice.id).single()).data.blue_tick).toBe(true);
  });

  it("tells the member their ID needs another look, with the reason", async () => {
    const { application } = await pay(bob, 2);
    await admin.from("blue_tick_applications").update({ status: "pending_review" }).eq("id", application);
    const res = await staff.client.rpc("review_blue_tick_application", { p_id: application, p_decision: "reject", p_reason: "The photo is blurry" });
    expect(res.error).toBeNull();
    expect((await events(bob)).at(-1).data).toMatchObject({ event: "rejected", reason: "The photo is blurry" });
  });

  it("tells the member their payment was refunded, and that the tick went with it", async () => {
    const res = await admin.rpc("refund_blue_tick_order", { p_payment: aliceOrder.payment, p_actor: staff.id, p_note: "Requested" });
    expect(res.error).toBeNull();
    expect((await events(alice)).at(-1).data).toMatchObject({ event: "refunded" });
    expect((await admin.from("profiles").select("blue_tick").eq("id", alice.id).single()).data.blue_tick).toBe(false);
  });

  it("does not tell the member twice when a refund is recorded twice", async () => {
    const before = (await events(alice)).length;
    await admin.rpc("refund_blue_tick_order", { p_payment: aliceOrder.payment, p_actor: staff.id, p_note: "Again" });
    expect(await events(alice)).toHaveLength(before);
  });

  it("tells the member when staff grant a free tick and when they take it away", async () => {
    expect((await staff.client.rpc("admin_set_blue_tick", { p_user: carol.id, p_on: true, p_reason: "Verified speaker" })).error).toBeNull();
    expect((await staff.client.rpc("admin_set_blue_tick", { p_user: carol.id, p_on: false, p_reason: "Account sold" })).error).toBeNull();
    const list = await events(carol);
    expect(list.map((e) => e.data.event)).toEqual(["granted", "revoked"]);
    expect(list[1].data.reason).toBe("Account sold");
  });

  it("respects the member's switches: with Push off the news is still in the bell but never pushed", async () => {
    await admin.from("notification_preferences").upsert({ user_id: carol.id, category: "moderation", in_app: true, push: false, email: false }, { onConflict: "user_id,category" });
    expect((await staff.client.rpc("admin_set_blue_tick", { p_user: carol.id, p_on: true, p_reason: "Verified again" })).error).toBeNull();
    const last = (await events(carol)).at(-1);
    expect(last.data.event).toBe("granted");
    expect(last.read_at).toBeNull();
    expect(last.pushed_at).not.toBeNull();
  });

  it("does not send a receipt for a duplicate payment, which is refunded instead", async () => {
    // Bob already has an application waiting, so a second payment is recorded as a duplicate and no application is created.
    const before = (await events(bob)).length;
    const second = await pay(bob, 3);
    expect(second.application).toBeNull();
    expect(await events(bob)).toHaveLength(before);
  });
});
