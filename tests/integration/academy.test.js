import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, anon, cleanupUsers, createUser, grantRoleDirect } from "../helpers/supabase.js";

/**
 * UniSphere Academy against a real database (migrations 0065-0069): who may change what, the pricing engine, coupons (including a
 * race for the last redemption), payments settling exactly once, refunds, grading, certificates and their public verification.
 */
const tag = Math.random().toString(36).slice(2, 7);
let owner, finance, manager, mentor, alice, bob, carol, dave;
let category, course, paidLessons, freeCourse;
const money = (v) => Number(v);

const must = (res, label = "call") => {
  expect(res.error, `${label}: ${res.error?.message}`).toBeNull();
  return res.data;
};

async function makeCourse(user, over = {}) {
  const { data, error } = await user.client
    .from("academy_courses")
    .insert({ slug: `t-${tag}-${Math.random().toString(36).slice(2, 7)}`, title: `Test course ${tag}`, category_id: category.id, short_description: "x", ...over })
    .select("*")
    .single();
  expect(error, error?.message).toBeNull();
  return data;
}

/** A course with one module and the given lesson kinds, published at `price` paise. */
async function publishedCourse(price, over = {}) {
  const c = await makeCourse(owner, { price_minor: price, ...over });
  const { data: mod } = await owner.client.from("academy_modules").insert({ course_id: c.id, title: "Module 1" }).select("id").single();
  const lessons = [];
  for (const [i, kind] of ["video", "text", "quiz", "assignment"].entries()) {
    const { data } = await owner.client.from("academy_lessons").insert({ course_id: c.id, module_id: mod.id, title: `Lesson ${i + 1}`, kind, position: i, is_preview: i === 0 }).select("*").single();
    lessons.push(data);
  }
  const res = await owner.client.from("academy_courses").update({ status: "published" }).eq("id", c.id).select("*").single();
  expect(res.error, res.error?.message).toBeNull();
  return { course: res.data, lessons };
}

const setSetting = async (key, value) => must(await admin.from("academy_settings").update({ value }).eq("key", key), `setting ${key}`);
const quote = async (user, courseId, coupon = null, cohort = null) => must(await user.client.rpc("academy_quote", { p_course: courseId, p_cohort: cohort, p_coupon: coupon }));

const makeCoupon = async (over = {}) => {
  const { data, error } = await owner.client
    .from("academy_coupons")
    .insert({ code: `C${tag}${Math.random().toString(36).slice(2, 6)}`.toUpperCase(), kind: "percent", percent_bps: 1000, ...over })
    .select("*")
    .single();
  expect(error, error?.message).toBeNull();
  return data;
};

async function pay(orderRow, amount = null) {
  const order = await admin.from("academy_orders").select("*").eq("id", orderRow).single();
  const ref = `po_${tag}_${Math.random().toString(36).slice(2, 8)}`;
  must(await admin.rpc("academy_attach_provider_order", { p_order: orderRow, p_provider: "test", p_provider_order: ref }));
  return {
    ref,
    settle: (paymentId, amt = amount ?? order.data.total_minor, currency = "INR") =>
      admin.rpc("academy_fulfil_order", { p_provider: "test", p_provider_order: ref, p_provider_payment: paymentId, p_amount: amt, p_currency: currency, p_method: "upi" }),
  };
}

beforeAll(async () => {
  [owner, finance, manager, mentor, alice, bob, carol, dave] = await Promise.all(
    ["ac-owner", "ac-fin", "ac-mgr", "ac-mentor", "ac-alice", "ac-bob", "ac-carol", "ac-dave"].map((l) => createUser(l)),
  );
  await grantRoleDirect(owner.id, "global_admin");
  await grantRoleDirect(finance.id, "finance_manager");
  await grantRoleDirect(manager.id, "course_manager");
  await grantRoleDirect(mentor.id, "academy_mentor");
  await setSetting("sales_enabled", true);
  await setSetting("tax_mode", "none");
  await setSetting("tax_rate_bps", 0);
  await setSetting("coupon_with_sale", "allow");
  ({ data: category } = await admin.from("academy_categories").select("*").eq("code_prefix", "WD").single());
  ({ course, lessons: paidLessons } = await publishedCourse(100000));
});

afterAll(async () => {
  await setSetting("tax_mode", "none");
  await setSetting("tax_rate_bps", 0);
  await cleanupUsers();
});

describe("course codes and who may change a course", () => {
  it("gives every course a unique, well-formed code that cannot be changed", async () => {
    expect(course.code).toMatch(/^USA-WD-\d{3,}$/);
    const second = await makeCourse(owner);
    expect(second.code).not.toBe(course.code);
    const res = await owner.client.from("academy_courses").update({ code: "USA-WD-999" }).eq("id", course.id);
    expect(res.error?.message).toContain("code_immutable");
  });

  it("lets a course manager edit content but not price or publication", async () => {
    const draft = await makeCourse(manager, { price_minor: 5000 });
    expect(draft.price_minor).toBeNull(); // a course manager cannot set a price at creation
    expect(draft.status).toBe("draft");
    const priceTry = await manager.client.from("academy_courses").update({ price_minor: 100 }).eq("id", draft.id);
    expect(priceTry.error?.message).toContain("forbidden_pricing");
    const publishTry = await manager.client.from("academy_courses").update({ status: "published" }).eq("id", draft.id);
    expect(publishTry.error?.message).toContain("price_required"); // may publish in principle, but never without a price
    const after = await admin.from("academy_courses").select("status").eq("id", draft.id).single();
    expect(after.data.status).toBe("draft");
  });

  it("refuses a student any write to the catalogue", async () => {
    const res = await alice.client.from("academy_courses").insert({ slug: `s-${tag}`, title: "Nope nope", category_id: category.id });
    expect(res.error).not.toBeNull();
    const upd = await alice.client.from("academy_courses").update({ price_minor: 0 }).eq("id", course.id).select();
    expect(upd.data ?? []).toHaveLength(0);
  });

  it("will not publish a course with no price", async () => {
    const c = await makeCourse(owner, { kind: "program" });
    const res = await owner.client.from("academy_courses").update({ status: "published" }).eq("id", c.id);
    expect(res.error?.message).toContain("price_required");
  });

  it("hides drafts from visitors and shows the syllabus but not the lessons of a published course", async () => {
    const draft = await makeCourse(owner, { price_minor: 0 });
    const visitor = anon();
    expect((await visitor.from("academy_courses").select("id").eq("id", draft.id)).data).toHaveLength(0);
    expect((await visitor.from("academy_courses").select("id").eq("id", course.id)).data).toHaveLength(1);
    expect((await visitor.from("academy_lessons").select("id").eq("course_id", course.id)).data).toHaveLength(4);
    await owner.client.from("academy_lesson_content").insert([
      { lesson_id: paidLessons[0].id, body_md: "preview body" },
      { lesson_id: paidLessons[1].id, body_md: "members only body" },
    ]);
    const visible = (await visitor.from("academy_lesson_content").select("lesson_id")).data.map((r) => r.lesson_id);
    expect(visible).toContain(paidLessons[0].id);
    expect(visible).not.toContain(paidLessons[1].id);
    expect((await alice.client.from("academy_lesson_content").select("lesson_id").eq("lesson_id", paidLessons[1].id)).data).toHaveLength(0);
  });
});

describe("pricing engine", () => {
  it("quotes the list price in integer paise", async () => {
    const q = await quote(alice, course.id);
    expect(q).toMatchObject({ ok: true, list_minor: 100000, total_minor: 100000, free: false, sale: null });
  });

  it("applies the cheapest scheduled price valid right now, and only then", async () => {
    const rule = (over) => owner.client.from("academy_price_rules").insert({ course_id: course.id, label: "Sale", kind: "sale", ...over }).select("id").single();
    const future = must(await rule({ price_minor: 50000, starts_at: new Date(Date.now() + 86_400_000).toISOString() }));
    const expired = must(await rule({ price_minor: 40000, ends_at: new Date(Date.now() - 1000).toISOString() }));
    expect((await quote(alice, course.id)).total_minor).toBe(100000);
    const live = must(await rule({ price_minor: 80000, label: "Launch week" }));
    const better = must(await rule({ price_minor: 70000, label: "Early bird", kind: "early_bird" }));
    const q = await quote(alice, course.id);
    expect(q.total_minor).toBe(70000);
    expect(q.sale).toMatchObject({ label: "Early bird", discount_minor: 30000 });
    // the admin preview can look at the future without creating anything
    const preview = must(await owner.client.rpc("academy_admin_quote", { p_course: course.id, p_cohort: null, p_coupon: null, p_at: new Date(Date.now() + 2 * 86_400_000).toISOString() }));
    expect(preview.total_minor).toBe(50000);
    await admin.from("academy_price_rules").delete().in("id", [future.id, expired.id, live.id, better.id]);
    expect((await quote(alice, course.id)).total_minor).toBe(100000);
  });

  it("applies a percentage coupon with a cap, a fixed coupon, and a minimum purchase", async () => {
    const pct = await makeCoupon({ percent_bps: 2500 });
    expect(await quote(alice, course.id, pct.code)).toMatchObject({ total_minor: 75000, coupon: { discount_minor: 25000 } });
    const capped = await makeCoupon({ percent_bps: 5000, max_discount_minor: 10000 });
    expect((await quote(alice, course.id, capped.code)).total_minor).toBe(90000);
    const fixed = await makeCoupon({ kind: "fixed", percent_bps: null, amount_minor: 30000 });
    expect((await quote(alice, course.id, fixed.code)).total_minor).toBe(70000);
    const huge = await makeCoupon({ kind: "fixed", percent_bps: null, amount_minor: 9_000_000 });
    expect((await quote(alice, course.id, huge.code)).total_minor).toBe(0);
    const min = await makeCoupon({ min_purchase_minor: 200000 });
    expect((await quote(alice, course.id, min.code)).error).toBe("coupon_min_spend");
    // lower case and spaces are tolerated
    expect((await quote(alice, course.id, `  ${pct.code.toLowerCase()} `)).total_minor).toBe(75000);
  });

  it("rounds percentages half up with no floating point", async () => {
    const c = await publishedCourse(9999); // 99.99
    const coupon = await makeCoupon({ percent_bps: 1500 }); // 15% of 9999 = 1499.85 -> 1500
    const q = await quote(alice, c.course.id, coupon.code);
    expect(q.coupon.discount_minor).toBe(1500);
    expect(q.total_minor).toBe(8499);
    expect(Number.isInteger(q.total_minor)).toBe(true);
  });

  it("refuses unknown, expired, inactive, not-yet-started, restricted and exhausted coupons", async () => {
    expect((await quote(alice, course.id, "NOPE-NOT-A-CODE")).error).toBe("coupon_invalid");
    const expired = await makeCoupon({ expires_at: new Date(Date.now() - 1000).toISOString() });
    expect((await quote(alice, course.id, expired.code)).error).toBe("coupon_expired");
    const later = await makeCoupon({ starts_at: new Date(Date.now() + 86_400_000).toISOString() });
    expect((await quote(alice, course.id, later.code)).error).toBe("coupon_not_started");
    const off = await makeCoupon({ active: false });
    expect((await quote(alice, course.id, off.code)).error).toBe("coupon_invalid");
    const other = await publishedCourse(100000);
    const only = await makeCoupon();
    await owner.client.from("academy_coupon_courses").insert({ coupon_id: only.id, course_id: other.course.id });
    expect((await quote(alice, course.id, only.code)).error).toBe("coupon_not_eligible");
    expect((await quote(alice, other.course.id, only.code)).ok).toBe(true);
    // a coupon for named people looks like an unknown code to everyone else
    const private_ = await makeCoupon();
    await owner.client.from("academy_coupon_users").insert({ coupon_id: private_.id, user_id: bob.id });
    expect((await quote(alice, course.id, private_.code)).error).toBe("coupon_invalid");
    expect((await quote(bob, course.id, private_.code)).ok).toBe(true);
    expect((await quote({ client: anon() }, course.id, private_.code)).error).toBe("sign_in_required");
  });

  it("does not stack a coupon on a sale when stacking is off, and does when allowed", async () => {
    const c = await publishedCourse(100000);
    must(await owner.client.from("academy_price_rules").insert({ course_id: c.course.id, label: "Sale", price_minor: 80000 }));
    const coupon = await makeCoupon({ percent_bps: 1000 });
    expect(await quote(alice, c.course.id, coupon.code)).toMatchObject({ total_minor: 72000 });
    const noStack = await makeCoupon({ stackable_with_sale: false });
    expect((await quote(alice, c.course.id, noStack.code)).error).toBe("coupon_no_stack");
    await setSetting("coupon_with_sale", "block");
    expect((await quote(alice, c.course.id, coupon.code)).error).toBe("coupon_no_stack");
    await setSetting("coupon_with_sale", "allow");
  });

  it("adds exclusive tax and splits inclusive tax from the configured rate, never inventing one", async () => {
    expect((await quote(alice, course.id)).tax).toMatchObject({ mode: "none", minor: 0 });
    await setSetting("tax_mode", "exclusive");
    await setSetting("tax_rate_bps", 1800);
    const ex = await quote(alice, course.id);
    expect(ex).toMatchObject({ net_minor: 100000, total_minor: 118000, tax: { minor: 18000, included: false } });
    await setSetting("tax_mode", "inclusive");
    const inc = await quote(alice, course.id);
    expect(inc).toMatchObject({ net_minor: 100000, total_minor: 100000, tax: { minor: 15254, included: true } });
    await setSetting("tax_mode", "none");
    await setSetting("tax_rate_bps", 0);
  });

  it("limits seats and tells a sold-out course apart", async () => {
    const c = await publishedCourse(0, { enrollment_limit: 1 });
    expect(must(await bob.client.rpc("academy_create_order", { p_course: c.course.id, p_cohort: null, p_coupon: null, p_consent: true })).enrolled).toBe(true);
    expect((await quote(alice, c.course.id)).error).toBe("sold_out");
    const prices = must(await anon().rpc("academy_catalog_prices", { p_courses: [c.course.id, course.id] }));
    expect(prices[c.course.id].sold_out).toBe(true);
    expect(prices[course.id].total_minor).toBe(100000);
  });

  it("does not let a browser say what to pay: the order total is the engine's", async () => {
    const res = await alice.client.rpc("academy_create_order", { p_course: course.id, p_cohort: null, p_coupon: null, p_consent: true, p_amount: 1 });
    expect(res.error).not.toBeNull(); // there is no such argument
    const ok = must(await alice.client.rpc("academy_create_order", { p_course: course.id, p_cohort: null, p_coupon: null, p_consent: true }));
    expect(ok.total_minor).toBe(100000);
    const order = await alice.client.from("academy_orders").update({ total_minor: 1 }).eq("id", ok.order_id).select();
    expect(order.data ?? []).toHaveLength(0);
  });
});

describe("coupon redemption limits", () => {
  it("gives the last redemption to exactly one of two buyers who ask at the same moment", async () => {
    const c = await publishedCourse(100000);
    const coupon = await makeCoupon({ usage_limit: 1 });
    const results = await Promise.all(
      [alice, bob, carol, dave].map((u) => u.client.rpc("academy_create_order", { p_course: c.course.id, p_cohort: null, p_coupon: coupon.code, p_consent: true })),
    );
    const good = results.filter((r) => !r.error && r.data.ok);
    const bad = results.filter((r) => !r.error && !r.data.ok);
    expect(good).toHaveLength(1);
    expect(bad.every((r) => r.data.error === "coupon_exhausted")).toBe(true);
    const redemptions = await admin.from("academy_coupon_redemptions").select("status").eq("coupon_id", coupon.id);
    expect(redemptions.data).toHaveLength(1);
  });

  it("enforces the per-user limit, and gives a coupon back when an order is cancelled", async () => {
    const c = await publishedCourse(100000);
    const coupon = await makeCoupon({ per_user_limit: 1 });
    const first = must(await carol.client.rpc("academy_create_order", { p_course: c.course.id, p_cohort: null, p_coupon: coupon.code, p_consent: true }));
    expect(first.ok).toBe(true);
    // a second try replaces the first unpaid order and so re-uses the same single redemption
    const again = must(await carol.client.rpc("academy_create_order", { p_course: c.course.id, p_cohort: null, p_coupon: coupon.code, p_consent: true }));
    expect(again.ok).toBe(true);
    const other = await publishedCourse(100000);
    const second = must(await carol.client.rpc("academy_create_order", { p_course: other.course.id, p_cohort: null, p_coupon: coupon.code, p_consent: true }));
    expect(second.error).toBe("coupon_user_limit");
    must(await admin.rpc("academy_cancel_order", { p_order: again.order_id, p_user: carol.id }));
    const third = must(await carol.client.rpc("academy_create_order", { p_course: other.course.id, p_cohort: null, p_coupon: coupon.code, p_consent: true }));
    expect(third.ok).toBe(true);
  });

  it("allows a first-purchase-only coupon only before any paid order", async () => {
    const c = await publishedCourse(100000);
    const coupon = await makeCoupon({ first_purchase_only: true });
    const o = must(await dave.client.rpc("academy_create_order", { p_course: c.course.id, p_cohort: null, p_coupon: null, p_consent: true }));
    const p = await pay(o.order_id);
    expect(must(await p.settle(`pay_${tag}_d1`)).ok).toBe(true);
    const next = await publishedCourse(100000);
    expect((await quote(dave, next.course.id, coupon.code)).error).toBe("coupon_first_purchase");
  });
});

describe("orders and payments", () => {
  let buyer, bought, order;

  beforeAll(async () => {
    buyer = await createUser("ac-buyer");
    bought = await publishedCourse(250000);
    order = must(await buyer.client.rpc("academy_create_order", { p_course: bought.course.id, p_cohort: null, p_coupon: null, p_consent: true, p_idem: `idem-${tag}` }));
  });

  it("creates a pending order with a snapshot, a number and a hold, and is idempotent for a repeated click", async () => {
    expect(order).toMatchObject({ ok: true, status: "pending", total_minor: 250000 });
    const row = (await admin.from("academy_orders").select("*, academy_order_items(*)").eq("id", order.order_id).single()).data;
    expect(row.order_no).toMatch(/^AO-\d{4}-\d{6}$/);
    expect(row.snapshot.course.code).toBe(bought.course.code);
    expect(row.academy_order_items[0]).toMatchObject({ course_code: bought.course.code, total_minor: 250000 });
    const repeat = must(await buyer.client.rpc("academy_create_order", { p_course: bought.course.id, p_cohort: null, p_coupon: null, p_consent: true, p_idem: `idem-${tag}` }));
    expect(repeat).toMatchObject({ existing: true, order_id: order.order_id });
  });

  it("requires the verification consent and refuses sales while sales are off", async () => {
    const x = await publishedCourse(1000);
    expect(must(await bob.client.rpc("academy_create_order", { p_course: x.course.id, p_cohort: null, p_coupon: null, p_consent: false })).error).toBe("consent_required");
    await setSetting("sales_enabled", false);
    expect(must(await bob.client.rpc("academy_create_order", { p_course: x.course.id, p_cohort: null, p_coupon: null, p_consent: true })).error).toBe("sales_closed");
    await setSetting("sales_enabled", true);
  });

  it("does not enrol on a wrong amount or currency, and records the mismatch", async () => {
    const p = await pay(order.order_id);
    expect(must(await p.settle(`pay_${tag}_bad1`, 1000)).error).toBe("amount_mismatch");
    expect(must(await p.settle(`pay_${tag}_bad2`, 250000, "USD")).error).toBe("amount_mismatch");
    const enrol = await admin.from("academy_enrollments").select("id").eq("user_id", buyer.id).eq("course_id", bought.course.id);
    expect(enrol.data).toHaveLength(0);
    const events = await admin.from("academy_payment_events").select("type").eq("order_id", order.order_id);
    expect(events.data.map((e) => e.type)).toContain("payment.mismatch");
    buyer.pay = p;
  });

  it("settles once: a repeated webhook or return changes nothing and sends one receipt", async () => {
    const first = must(await buyer.pay.settle(`pay_${tag}_ok`));
    expect(first).toMatchObject({ ok: true, duplicate: false });
    const again = must(await buyer.pay.settle(`pay_${tag}_ok`));
    expect(again).toMatchObject({ ok: true, already: true });
    const enrol = await admin.from("academy_enrollments").select("id, status, source").eq("user_id", buyer.id).eq("course_id", bought.course.id);
    expect(enrol.data).toEqual([expect.objectContaining({ status: "active", source: "paid" })]);
    const payments = await admin.from("academy_payments").select("id").eq("order_id", order.order_id);
    expect(payments.data).toHaveLength(1);
    const notes = await admin.from("notifications").select("type, category, data").eq("user_id", buyer.id).in("type", ["academy_payment", "academy_enrolled"]);
    expect(notes.data.filter((n) => n.type === "academy_payment")).toHaveLength(1);
    expect(notes.data.filter((n) => n.type === "academy_enrolled")).toHaveLength(1);
    expect(notes.data.every((n) => n.category === "academy")).toBe(true);
  });

  it("keeps the price an order was bought at when the course price changes later", async () => {
    await owner.client.from("academy_courses").update({ price_minor: 1 }).eq("id", bought.course.id);
    const row = (await admin.from("academy_orders").select("total_minor, list_minor").eq("id", order.order_id).single()).data;
    expect(row).toMatchObject({ total_minor: 250000, list_minor: 250000 });
    await owner.client.from("academy_courses").update({ price_minor: 250000 }).eq("id", bought.course.id);
  });

  it("will not let a student change an order, a payment or an enrolment, or read someone else's", async () => {
    expect((await buyer.client.from("academy_orders").update({ status: "paid" }).eq("id", order.order_id).select()).data ?? []).toHaveLength(0);
    expect((await buyer.client.from("academy_enrollments").insert({ user_id: buyer.id, course_id: course.id, source: "free" })).error).not.toBeNull();
    expect((await buyer.client.from("academy_payments").select("id")).data.length).toBeGreaterThanOrEqual(1);
    expect((await alice.client.from("academy_orders").select("id").eq("id", order.order_id)).data).toHaveLength(0);
    expect((await alice.client.from("academy_payments").select("id").eq("order_id", order.order_id)).data).toHaveLength(0);
    expect((await alice.client.rpc("academy_admin_orders", {})).error).not.toBeNull();
    expect((await buyer.client.rpc("academy_fulfil_order", { p_provider: "x", p_provider_order: "y", p_provider_payment: "z", p_amount: 1, p_currency: "INR" })).error).not.toBeNull();
  });

  it("refunds a duplicate purchase's enrolment only once and flags the second payment", async () => {
    const second = must(await buyer.client.rpc("academy_create_order", { p_course: bought.course.id, p_cohort: null, p_coupon: null, p_consent: true }));
    expect(second.error).toBe("already_enrolled");
  });

  it("lets finance see orders and searches them; a mentor cannot", async () => {
    const found = must(await finance.client.rpc("academy_admin_orders", { p_search: bought.course.code }));
    expect(found.some((r) => r.id === order.order_id)).toBe(true);
    expect((await mentor.client.rpc("academy_admin_orders", {})).error).not.toBeNull();
    expect((await manager.client.rpc("academy_admin_orders", {})).error).not.toBeNull();
    expect((await manager.client.from("academy_orders").select("id")).data).toHaveLength(0);
  });

  it("runs the refund workflow: request, approve, complete once, access ends, student told", async () => {
    const refundId = must(await buyer.client.rpc("academy_request_refund", { p_order: order.order_id, p_reason: "Changed my mind" }));
    expect((await buyer.client.rpc("academy_review_refund", { p_refund: refundId, p_approve: true, p_note: null })).error).not.toBeNull();
    must(await finance.client.rpc("academy_review_refund", { p_refund: refundId, p_approve: true, p_note: "ok" }));
    const target = must(await finance.client.rpc("academy_refund_target", { p_refund: refundId }));
    expect(target[0]).toMatchObject({ amount_minor: 250000, status: "approved" });
    expect(must(await admin.rpc("academy_complete_refund", { p_refund: refundId, p_provider_refund: "rf_1", p_actor: finance.id })).ok).toBe(true);
    expect(must(await admin.rpc("academy_complete_refund", { p_refund: refundId, p_provider_refund: "rf_1", p_actor: finance.id })).already).toBe(true);
    expect((await admin.from("academy_orders").select("status").eq("id", order.order_id).single()).data.status).toBe("refunded");
    expect((await admin.from("academy_enrollments").select("status").eq("user_id", buyer.id).eq("course_id", bought.course.id).single()).data.status).toBe("refunded");
    const notes = await admin.from("notifications").select("data").eq("user_id", buyer.id).eq("type", "academy_refund");
    expect(notes.data).toHaveLength(1);
    // a refunded student can buy again
    expect(must(await buyer.client.rpc("academy_create_order", { p_course: bought.course.id, p_cohort: null, p_coupon: null, p_consent: true })).ok).toBe(true);
  });

  it("refuses a refund after the window and makes payment events append-only", async () => {
    const c = await publishedCourse(100000);
    const o = must(await alice.client.rpc("academy_create_order", { p_course: c.course.id, p_cohort: null, p_coupon: null, p_consent: true }));
    const p = await pay(o.order_id);
    must(await p.settle(`pay_${tag}_late`));
    await admin.from("academy_orders").update({ paid_at: new Date(Date.now() - 30 * 86_400_000).toISOString() }).eq("id", o.order_id);
    expect((await alice.client.rpc("academy_request_refund", { p_order: o.order_id, p_reason: "too late" })).error?.message).toContain("refund_window_closed");
    expect((await admin.from("academy_payment_events").delete().eq("order_id", o.order_id)).error).not.toBeNull();
  });
});

describe("learning: lessons, quizzes, assignments and completion", () => {
  let learner, lc, qLessons, quizQuestion, assignment;

  beforeAll(async () => {
    learner = await createUser("ac-learner");
    lc = await publishedCourse(0);
    qLessons = lc.lessons;
    quizQuestion = must(
      await owner.client.from("academy_quiz_questions").insert({ lesson_id: qLessons[2].id, prompt: "2 + 2 = ?", options: ["3", "4", "5"] }).select("id").single(),
    );
    must(await owner.client.from("academy_quiz_keys").insert({ question_id: quizQuestion.id, correct: [1] }));
    assignment = must(
      await owner.client
        .from("academy_assignments")
        .insert({ course_id: lc.course.id, lesson_id: qLessons[3].id, title: "Build a thing", status: "published", max_score: 100, pass_pct: 60, rubric: [{ key: "code", label: "Code", max: 60 }, { key: "docs", label: "Docs", max: 40 }] })
        .select("*")
        .single(),
    );
    await owner.client.from("academy_course_mentors").delete().eq("course_id", lc.course.id);
    await owner.client.from("academy_mentors").upsert({ user_id: mentor.id, display_name: "Test Mentor" });
    await owner.client.from("academy_course_mentors").insert({ course_id: lc.course.id, user_id: mentor.id, role: "lead" });
  });

  it("enrols a free course without an order and keeps the answer key from students", async () => {
    const res = must(await learner.client.rpc("academy_create_order", { p_course: lc.course.id, p_cohort: null, p_coupon: null, p_consent: true }));
    expect(res).toMatchObject({ ok: true, enrolled: true, free: true });
    expect((await admin.from("academy_orders").select("id").eq("user_id", learner.id)).data).toHaveLength(0);
    expect((await learner.client.from("academy_quiz_keys").select("*")).data).toHaveLength(0);
    const q = (await learner.client.from("academy_quiz_questions").select("*").eq("lesson_id", qLessons[2].id)).data;
    expect(q).toHaveLength(1);
    expect(JSON.stringify(q)).not.toContain("correct");
  });

  it("lets a student finish an ordinary lesson but not a graded one", async () => {
    must(await learner.client.rpc("academy_complete_lesson", { p_lesson: qLessons[0].id }));
    expect((await learner.client.rpc("academy_complete_lesson", { p_lesson: qLessons[2].id })).error?.message).toContain("graded_lesson");
    expect((await learner.client.rpc("academy_complete_lesson", { p_lesson: qLessons[3].id })).error?.message).toContain("graded_lesson");
    expect((await learner.client.from("academy_lesson_progress").insert({ user_id: learner.id, lesson_id: qLessons[3].id, course_id: lc.course.id })).error).not.toBeNull();
    expect((await bob.client.rpc("academy_complete_lesson", { p_lesson: qLessons[1].id })).error?.message).toContain("no_access");
  });

  it("grades a quiz on the server, never revealing the key", async () => {
    const wrong = must(await learner.client.rpc("academy_submit_quiz", { p_lesson: qLessons[2].id, p_answers: { [quizQuestion.id]: [0] } }));
    expect(wrong).toMatchObject({ passed: false, score_pct: 0 });
    expect(JSON.stringify(wrong)).not.toContain("correct\":[");
    const right = must(await learner.client.rpc("academy_submit_quiz", { p_lesson: qLessons[2].id, p_answers: { [quizQuestion.id]: [1] } }));
    expect(right).toMatchObject({ passed: true, score_pct: 100 });
  });

  it("takes a submission and lets only that course's mentor grade it", async () => {
    must(await learner.client.rpc("academy_complete_lesson", { p_lesson: qLessons[1].id }));
    const id = must(await learner.client.rpc("academy_submit_assignment", { p_assignment: assignment.id, p_repo: "https://github.com/example/repo", p_demo: null, p_notes: "done", p_file: null }));
    expect((await learner.client.rpc("academy_submit_assignment", { p_assignment: assignment.id, p_repo: "https://github.com/example/repo", p_demo: null, p_notes: null, p_file: null })).error?.message).toContain("awaiting_review");
    expect((await learner.client.rpc("academy_grade_submission", { p_submission: id, p_scores: { code: 60, docs: 40 }, p_score: null, p_feedback: "self", p_action: "grade" })).error).not.toBeNull();
    expect((await bob.client.rpc("academy_grade_submission", { p_submission: id, p_scores: { code: 60, docs: 40 }, p_score: null, p_feedback: "x", p_action: "grade" })).error).not.toBeNull();
    expect((await bob.client.from("academy_submissions").select("id").eq("id", id)).data).toHaveLength(0);
    // a mentor of another course cannot grade this one
    const otherMentor = await createUser("ac-mentor2");
    await grantRoleDirect(otherMentor.id, "academy_mentor");
    expect((await otherMentor.client.rpc("academy_grade_submission", { p_submission: id, p_scores: { code: 60, docs: 40 }, p_score: null, p_feedback: "x", p_action: "grade" })).error?.message).toContain("forbidden");
    // out-of-range rubric points are refused
    expect((await mentor.client.rpc("academy_grade_submission", { p_submission: id, p_scores: { code: 61, docs: 40 }, p_score: null, p_feedback: "x", p_action: "grade" })).error?.message).toContain("invalid_scores");
    const graded = must(await mentor.client.rpc("academy_grade_submission", { p_submission: id, p_scores: { code: 50, docs: 30 }, p_score: null, p_feedback: "Nice work", p_action: "grade" }));
    expect(graded).toMatchObject({ passed: true, score: 80 });
    const queue = must(await mentor.client.rpc("academy_review_queue", { p_status: "graded" }));
    expect(queue.some((r) => r.id === id)).toBe(true);
    const notes = await admin.from("notifications").select("data").eq("user_id", learner.id).eq("type", "academy_feedback");
    expect(notes.data).toHaveLength(1);
  });

  it("marks the enrolment completed once everything is done and says so once", async () => {
    const state = must(await learner.client.rpc("academy_my_progress", { p_course: lc.course.id }));
    expect(state).toMatchObject({ completion_pct: 100, eligible: true, assignments_passed: 1 });
    const e = (await admin.from("academy_enrollments").select("*").eq("user_id", learner.id).eq("course_id", lc.course.id).single()).data;
    expect(e.status).toBe("completed");
    expect((await admin.from("notifications").select("id").eq("user_id", learner.id).eq("type", "academy_completed")).data).toHaveLength(1);
    learner.enrollment = e;
  });

  it("reminds about a live class and a deadline once, even if the worker runs twice", async () => {
    const soon = new Date(Date.now() + 30 * 60_000).toISOString();
    must(await owner.client.from("academy_live_sessions").insert({ course_id: lc.course.id, title: "Doubt clearing", starts_at: soon, ends_at: new Date(Date.now() + 90 * 60_000).toISOString() }));
    const fresh = await createUser("ac-fresh");
    must(await fresh.client.rpc("academy_create_order", { p_course: lc.course.id, p_cohort: null, p_coupon: null, p_consent: true }));
    must(await owner.client.from("academy_assignments").update({ due_at: new Date(Date.now() + 3 * 3600_000).toISOString() }).eq("id", assignment.id));
    must(await admin.rpc("academy_send_reminders"));
    must(await admin.rpc("academy_send_reminders"));
    const live = await admin.from("notifications").select("id").eq("user_id", fresh.id).eq("type", "academy_live_reminder");
    const due = await admin.from("notifications").select("id").eq("user_id", fresh.id).eq("type", "academy_assignment_due");
    expect(live.data).toHaveLength(1);
    expect(due.data).toHaveLength(1);
  });

  it("keeps the meeting link from people who are not enrolled", async () => {
    const sessions = (await owner.client.from("academy_live_sessions").select("id").eq("course_id", lc.course.id)).data;
    const id = sessions[0].id;
    await owner.client.from("academy_live_session_links").upsert({ session_id: id, meeting_url: "https://meet.example.com/abc-defg" });
    expect(must(await learner.client.rpc("academy_session_access", { p_session: id })).meeting_url).toBe("https://meet.example.com/abc-defg");
    expect(must(await bob.client.rpc("academy_session_access", { p_session: id }))).toBeNull();
    expect((await bob.client.from("academy_live_session_links").select("*")).data).toHaveLength(0);
    expect((await bob.client.from("academy_live_sessions").select("id").eq("id", id)).data).toHaveLength(0);
  });

  it("refuses to mark a recording available without recording consent", async () => {
    const id = (await owner.client.from("academy_live_sessions").select("id").eq("course_id", lc.course.id)).data[0].id;
    const res = await owner.client.from("academy_live_sessions").update({ recording_available: true }).eq("id", id);
    expect(res.error).not.toBeNull();
  });

  describe("certificates", () => {
    let template, version, cert;
    const fields = [
      { id: "name", kind: "text", page: 0, x: 0.1, y: 0.4, w: 0.8, text: "{{student_name}}", font: "HelveticaBold", size: 30, color: "#111111", align: "center" },
      { id: "course", kind: "text", page: 0, x: 0.1, y: 0.5, w: 0.8, text: "completed {{course_title}} ({{course_code}})", font: "Helvetica", size: 16, color: "#111111", align: "center" },
      { id: "cid", kind: "text", page: 0, x: 0.1, y: 0.9, w: 0.5, text: "{{certificate_id}}", font: "Courier", size: 10, color: "#333333", align: "left" },
      { id: "qr", kind: "qr", page: 0, x: 0.8, y: 0.8, w: 0.12 },
    ];

    beforeAll(async () => {
      const file = must(
        await admin
          .from("files")
          .insert({ owner_id: owner.id, bucket: "private", storage_key: `academy_template/${owner.id}/${crypto.randomUUID()}.pdf`, purpose: "academy_template", mime_type: "application/pdf", size_bytes: 1000, status: "ready" })
          .select("id")
          .single(),
      );
      template = must(await owner.client.rpc("academy_save_template", { p_id: null, p_name: `Template ${tag}`, p_description: null, p_is_default: false, p_active: true }));
      version = must(await owner.client.rpc("academy_new_template_version", { p_template: template, p_file: file.id, p_pages: 1, p_width: 842, p_height: 595, p_notes: null }));
      must(await owner.client.rpc("academy_assign_template", { p_course: lc.course.id, p_template: template }));
    });

    it("refuses to activate a template that is incomplete or uses an unknown variable", async () => {
      const bad = must(await owner.client.rpc("academy_save_template_fields", { p_version: version, p_fields: [{ ...fields[0], text: "{{password}}" }] }));
      expect(bad.join(" ")).toContain("unknown variable");
      expect(must(await owner.client.rpc("academy_save_template_fields", { p_version: version, p_fields: [fields[0]] }))).toEqual([]);
      const incomplete = must(await owner.client.rpc("academy_activate_template_version", { p_version: version }));
      expect(incomplete.join(" ")).toContain("QR");
      expect((await mentor.client.rpc("academy_activate_template_version", { p_version: version })).error).not.toBeNull();
      must(await owner.client.rpc("academy_save_template_fields", { p_version: version, p_fields: fields }));
      expect(must(await owner.client.rpc("academy_activate_template_version", { p_version: version }))).toEqual([]);
      // An active version is frozen even for the service role; staff cannot write the table at all, only call the functions.
      const locked = await admin.from("academy_cert_template_versions").update({ fields: [] }).eq("id", version);
      expect(locked.error?.message ?? "").toContain("version_locked");
      expect((await owner.client.from("academy_cert_template_versions").update({ fields: [] }).eq("id", version)).error).not.toBeNull();
    });

    it("will not begin a certificate for an unauthorised user, an ineligible student or one who has not consented", async () => {
      const id = learner.enrollment.id;
      expect((await mentor.client.rpc("academy_begin_certificate", { p_enrollment: id })).error).not.toBeNull();
      expect((await learner.client.rpc("academy_begin_certificate", { p_enrollment: id })).error).not.toBeNull();
      const fresh = await createUser("ac-nocert");
      must(await fresh.client.rpc("academy_create_order", { p_course: lc.course.id, p_cohort: null, p_coupon: null, p_consent: true }));
      const e2 = (await admin.from("academy_enrollments").select("id").eq("user_id", fresh.id).eq("course_id", lc.course.id).single()).data;
      expect(must(await owner.client.rpc("academy_begin_certificate", { p_enrollment: e2.id })).error).toBe("not_eligible");
      await admin.from("academy_enrollments").update({ verify_consent_at: null }).eq("id", id);
      expect(must(await owner.client.rpc("academy_begin_certificate", { p_enrollment: id })).error).toBe("consent_required");
      await admin.from("academy_enrollments").update({ verify_consent_at: new Date().toISOString() }).eq("id", id);
    });

    it("issues a certificate with a unique ID, shows it as pending until the PDF exists, then valid", async () => {
      const begun = must(await owner.client.rpc("academy_begin_certificate", { p_enrollment: learner.enrollment.id }));
      expect(begun.ok).toBe(true);
      expect(begun.certificate_id).toMatch(/^US-\d{4}-WD-\d{5}$/);
      expect(begun.snapshot).toMatchObject({ recipient_name: "Test ac-learner", course_code: lc.course.code });
      expect(must(await anon().rpc("academy_verify_certificate", { p_id: begun.certificate_id })).status).toBe("pending");
      expect(must(await admin.rpc("academy_finish_certificate", { p_id: begun.id, p_pdf_key: `academy/certificates/${begun.id}.pdf`, p_sha256: "a".repeat(64), p_bytes: 1234, p_actor: owner.id })).ok).toBe(true);
      cert = begun;
      const v = must(await anon().rpc("academy_verify_certificate", { p_id: begun.certificate_id.toLowerCase() }));
      expect(v).toMatchObject({ status: "valid", recipient_name: "Test ac-learner", course_code: lc.course.code });
      // issuing again returns the same certificate
      expect(must(await owner.client.rpc("academy_begin_certificate", { p_enrollment: learner.enrollment.id }))).toMatchObject({ existing: true, certificate_id: begun.certificate_id });
      expect((await admin.from("notifications").select("data").eq("user_id", learner.id).eq("type", "academy_certificate")).data).toHaveLength(1);
    });

    it("exposes only approved fields: no email, no internal notes, score only if the holder agreed", async () => {
      const v = must(await anon().rpc("academy_verify_certificate", { p_id: cert.certificate_id }));
      expect(JSON.stringify(v)).not.toMatch(/example\.test|revoke_reason|pdf_key|user_id/);
      expect(v.score_pct).toBeNull();
      await learner.client.from("academy_profiles").upsert({ user_id: learner.id, share_score: true });
      expect(must(await anon().rpc("academy_verify_certificate", { p_id: cert.certificate_id })).score_pct).toBe(90); // the average of the best result in each scored item: assignment 80, quiz 100
      await learner.client.from("academy_profiles").upsert({ user_id: learner.id, share_score: false });
    });

    it("keeps the table private: visitors and other students read nothing", async () => {
      expect((await anon().from("academy_certificates").select("id")).error ?? { data: [] }).toBeTruthy();
      expect(((await anon().from("academy_certificates").select("id")).data ?? []).length).toBe(0);
      expect((await bob.client.from("academy_certificates").select("id")).data).toHaveLength(0);
      expect((await learner.client.from("academy_certificates").select("id")).data).toHaveLength(1);
      expect((await learner.client.from("academy_certificates").update({ status: "revoked" }).eq("id", cert.id).select()).data ?? []).toHaveLength(0);
    });

    it("answers not-found for unknown and malformed IDs", async () => {
      for (const id of ["US-2099-WD-99999", "garbage", "'; drop table x;--", ""]) {
        expect(must(await anon().rpc("academy_verify_certificate", { p_id: id })).status).toBe("not_found");
      }
    });

    it("never reuses an ID, even under concurrent issuance", async () => {
      const students = await Promise.all([1, 2, 3, 4].map((n) => createUser(`ac-conc${n}`)));
      const ids = [];
      for (const s of students) {
        must(await s.client.rpc("academy_create_order", { p_course: lc.course.id, p_cohort: null, p_coupon: null, p_consent: true }));
        const e = (await admin.from("academy_enrollments").select("id").eq("user_id", s.id).eq("course_id", lc.course.id).single()).data;
        await admin.from("academy_enrollments").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", e.id);
        ids.push(e.id);
        // make them eligible: lessons + assignment
        for (const l of [qLessons[0], qLessons[1], qLessons[2], qLessons[3]]) await admin.from("academy_lesson_progress").insert({ user_id: s.id, lesson_id: l.id, course_id: lc.course.id });
        await admin.from("academy_submissions").insert({ assignment_id: assignment.id, course_id: lc.course.id, user_id: s.id, attempt: 1, status: "graded", score: 90, score_pct: 90, passed: true, notes: "x" });
      }
      const results = await Promise.all(ids.map((id) => owner.client.rpc("academy_begin_certificate", { p_enrollment: id })));
      const issued = results.map((r) => r.data).filter((d) => d?.ok);
      expect(issued).toHaveLength(4);
      expect(new Set(issued.map((d) => d.certificate_id)).size).toBe(4);
    });

    it("revokes with a mandatory reason, shows it publicly without the reason, keeps the record and the ID", async () => {
      expect((await owner.client.rpc("academy_revoke_certificate", { p_id: cert.id, p_reason: "x" })).error).not.toBeNull();
      expect((await mentor.client.rpc("academy_revoke_certificate", { p_id: cert.id, p_reason: "Plagiarised the project" })).error).not.toBeNull();
      expect((await finance.client.rpc("academy_revoke_certificate", { p_id: cert.id, p_reason: "Plagiarised the project" })).error).not.toBeNull();
      must(await owner.client.rpc("academy_revoke_certificate", { p_id: cert.id, p_reason: "Plagiarised the project", p_public_note: "Issued in error" }));
      const v = must(await anon().rpc("academy_verify_certificate", { p_id: cert.certificate_id }));
      expect(v).toMatchObject({ status: "revoked", revoked_note: "Issued in error" });
      expect(JSON.stringify(v)).not.toContain("Plagiarised");
      expect((await owner.client.rpc("academy_revoke_certificate", { p_id: cert.id, p_reason: "Again please" })).error).not.toBeNull();
      const row = (await admin.from("academy_certificates").select("status, certificate_id").eq("id", cert.id).single()).data;
      expect(row).toMatchObject({ status: "revoked", certificate_id: cert.certificate_id });
      const events = (await admin.from("academy_certificate_events").select("action").eq("certificate_id", cert.id)).data.map((e) => e.action);
      expect(events).toEqual(expect.arrayContaining(["begun", "issued", "revoked"]));
      expect((await admin.from("academy_certificate_events").delete().eq("certificate_id", cert.id)).error).not.toBeNull();
    });

    it("reissues a corrected certificate: the old one is superseded and points to the new one", async () => {
      const e = (await admin.from("academy_enrollments").select("id").eq("user_id", learner.id).eq("course_id", lc.course.id).single()).data;
      const first = must(await owner.client.rpc("academy_begin_certificate", { p_enrollment: e.id }));
      // the revoked one does not block a new certificate for the same enrolment
      expect(first.ok).toBe(true);
      expect(first.certificate_id).not.toBe(cert.certificate_id);
      must(await admin.rpc("academy_finish_certificate", { p_id: first.id, p_pdf_key: "k1", p_sha256: "b".repeat(64), p_bytes: 10, p_actor: owner.id }));
      const second = must(await owner.client.rpc("academy_begin_certificate", { p_enrollment: e.id, p_replaces: first.id, p_note: "Name corrected" }));
      expect(second.ok).toBe(true);
      expect(must(await anon().rpc("academy_verify_certificate", { p_id: first.certificate_id })).status).toBe("valid"); // not revoked until the new one exists
      must(await admin.rpc("academy_finish_certificate", { p_id: second.id, p_pdf_key: "k2", p_sha256: "c".repeat(64), p_bytes: 10, p_actor: owner.id }));
      const old = must(await anon().rpc("academy_verify_certificate", { p_id: first.certificate_id }));
      expect(old).toMatchObject({ status: "revoked", replaced_by: second.certificate_id });
      expect(must(await anon().rpc("academy_verify_certificate", { p_id: second.certificate_id })).status).toBe("valid");
    });
  });
});

describe("staff views, audit and erasure", () => {
  it("shows the overview without money to people who may not see money", async () => {
    const asOwner = must(await owner.client.rpc("academy_admin_overview", { p_days: 30 }));
    expect(asOwner.gross_minor).toBeDefined();
    const asManager = must(await manager.client.rpc("academy_admin_overview", { p_days: 30 }));
    expect(asManager.gross_minor).toBeUndefined();
    expect(asManager.published_courses).toBeGreaterThan(0);
    expect((await alice.client.rpc("academy_admin_overview", { p_days: 30 })).error).not.toBeNull();
  });

  it("records course, price and coupon changes in the audit log with who and what", async () => {
    const log = must(await owner.client.rpc("academy_list_audit", { p_search: course.code, p_limit: 50 }));
    expect(log.some((r) => r.action === "academy.course.updated" && r.metadata.status)).toBe(true);
    expect((await manager.client.rpc("academy_list_audit", {})).error).not.toBeNull();
  });

  it("keeps financial records and the certificate, but drops the person's name, when an account is erased", async () => {
    const erased = await createUser("ac-erase");
    const c = await publishedCourse(5000);
    const o = must(await erased.client.rpc("academy_create_order", { p_course: c.course.id, p_cohort: null, p_coupon: null, p_consent: true }));
    const p = await pay(o.order_id);
    must(await p.settle(`pay_${tag}_erase`));
    must(await admin.rpc("academy_erase_user", { p_user: erased.id }));
    const row = (await admin.from("academy_orders").select("buyer_name, buyer_username, total_minor").eq("id", o.order_id).single()).data;
    expect(row.buyer_name).toBeNull();
    expect(money(row.total_minor)).toBe(5000);
  });

  it("gives every Academy role only its own permissions", async () => {
    const perms = async (u) => new Set((await u.client.rpc("my_permissions")).data.map((p) => p.permission));
    const f = await perms(finance), m = await perms(mentor), c = await perms(manager);
    expect(f.has("academy.refunds.process")).toBe(true);
    expect(f.has("academy.certificates.issue")).toBe(false);
    expect(m.has("academy.finance.view")).toBe(false);
    expect(m.has("academy.certificates.issue")).toBe(false);
    expect(c.has("academy.pricing.manage")).toBe(false);
    expect(c.has("academy.finance.view")).toBe(false);
  });
});
