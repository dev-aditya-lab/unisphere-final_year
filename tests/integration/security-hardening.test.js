import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, anon, cleanupUsers, createUser } from "../helpers/supabase.js";

/**
 * Migration 20260141000049 and the standing rules behind it, tested with real sessions:
 *   - privileged database functions refuse an ordinary member, whatever they are called with;
 *   - the relationship helpers are not an oracle about other people;
 *   - link columns cannot hold anything but http(s), even when the API is called directly.
 */

let a, b, c;
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

beforeAll(async () => {
  a = await createUser("sec-a");
  b = await createUser("sec-b");
  c = await createUser("sec-c");
});
afterAll(async () => {
  await admin.from("user_blocks").delete().in("blocker_id", [b?.id, c?.id].filter(Boolean));
  await admin.from("connections").delete().in("user_a", [b?.id, c?.id].filter(Boolean));
  await cleanupUsers();
});

// Functions that exist for staff. An ordinary member must get an error or an empty list from every one of them.
const PRIVILEGED = /^(admin_|orbit_admin_|review_|moderate_|grant_role|revoke_role|staff_|set_system_setting|set_feature_flag|set_privacy_setting|set_blue_tick|set_community_official|save_release|save_privacy|triage_|resolve_report|assign_report|add_report_note|add_privacy_|approve_privacy|create_privacy_incident|update_privacy_incident|record_privacy|mark_privacy_incident|get_report|list_reports|list_appeals|list_role_assignments|list_privacy_requests|privacy_request_counts|privacy_request_detail|privacy_access_snapshot|delete_release|blue_tick_refund)/;

async function rpcCatalogue(token) {
  const res = await fetch(`${URL}/rest/v1/`, { headers: { apikey: KEY, Authorization: `Bearer ${token}` } });
  const doc = await res.json();
  return Object.entries(doc.paths)
    .filter(([path]) => path.startsWith("/rpc/"))
    .map(([path, def]) => {
      const props = def.post?.parameters?.find((p) => p.in === "body")?.schema?.properties ?? {};
      return { name: path.slice(5), props };
    });
}

const sample = (spec, victim) => {
  if (spec.format === "uuid") return victim;
  if (spec.type === "integer") return 1;
  if (spec.type === "boolean") return false;
  if (spec.type === "array") return [];
  if (spec.format === "jsonb") return {};
  return "x";
};

describe("privileged database functions", () => {
  it("refuse an ordinary member, however they are called", async () => {
    const token = (await a.client.auth.getSession()).data.session.access_token;
    const catalogue = (await rpcCatalogue(token)).filter((f) => PRIVILEGED.test(f.name));
    expect(catalogue.length).toBeGreaterThan(60); // the sweep must actually find the admin surface

    const leaks = [];
    for (const fn of catalogue) {
      for (const argsFor of [(s) => null, (s) => sample(s, b.id), (s) => sample(s, randomUUID())]) {
        const args = Object.fromEntries(Object.entries(fn.props).map(([k, s]) => [k, argsFor(s)]));
        const { data, error } = await a.client.rpc(fn.name, args);
        const refused = error !== null;
        const emptyList = !error && Array.isArray(data) && data.length === 0;
        if (!refused && !emptyList) leaks.push(`${fn.name} answered an ordinary member: ${JSON.stringify(data)?.slice(0, 80)}`);
      }
    }
    expect(leaks).toEqual([]);
  }, 120_000);

  it("are not callable at all by a logged-out visitor", async () => {
    const visitor = anon();
    for (const name of ["admin_list_users", "list_reports", "grant_role", "set_system_setting", "orbit_admin_adjust", "admin_purge_content"]) {
      const { data, error } = await visitor.rpc(name, {});
      expect(error, name).not.toBeNull();
      expect(data, name).toBeNull();
    }
  });
});

describe("relationship helpers are not an oracle", () => {
  beforeAll(async () => {
    const [x, y] = [b.id, c.id].sort();
    expect((await admin.from("connections").insert({ user_a: x, user_b: y })).error).toBeNull();
    expect((await admin.from("user_blocks").insert({ blocker_id: b.id, blocked_id: c.id })).error).toBeNull();
  });

  it("a third party learns nothing about two other members", async () => {
    expect((await a.client.rpc("are_connected", { a: b.id, b: c.id })).data).toBe(false);
    expect((await a.client.rpc("is_blocked_between", { a: b.id, b: c.id })).data).toBe(false);
  });

  it("the people involved, and the server itself, still get the real answer", async () => {
    expect((await b.client.rpc("are_connected", { a: b.id, b: c.id })).data).toBe(true);
    expect((await c.client.rpc("are_connected", { a: b.id, b: c.id })).data).toBe(true);
    expect((await b.client.rpc("is_blocked_between", { a: b.id, b: c.id })).data).toBe(true);
    expect((await admin.rpc("are_connected", { a: b.id, b: c.id })).data).toBe(true);
    expect((await admin.rpc("is_blocked_between", { a: c.id, b: b.id })).data).toBe(true);
  });

  it("a member cannot run the counter-refresh helpers", async () => {
    expect((await a.client.rpc("refresh_post_reactions", { p_post: randomUUID() })).error).not.toBeNull();
    expect((await a.client.rpc("event_counts_refresh", { p_event: randomUUID() })).error).not.toBeNull();
  });
});

describe("link columns accept only http(s) addresses", () => {
  const bad = ["javascript:alert(document.cookie)", "data:text/html,<script>alert(1)</script>", "vbscript:x", "//evil.example", "https://exa mple.com", "https://x.example/\"onmouseover=alert(1)", `https://${"a".repeat(2100)}.example`].map((url) => [url.length > 80 ? `an address of ${url.length} characters` : url, url]);

  it.each(bad)("refuses %s on a profile written straight through the API", async (_label, url) => {
    const { error } = await a.client.from("profiles").update({ portfolio_url: url }).eq("id", a.id);
    expect(error?.code).toBe("23514");
    const { data } = await admin.from("profiles").select("portfolio_url").eq("id", a.id).single();
    expect(data.portfolio_url).toBeNull();
  });

  it("still accepts ordinary links, and clearing a link", async () => {
    expect((await a.client.from("profiles").update({ portfolio_url: "https://example.com/me?x=1#top", github_url: "http://github.com/someone" }).eq("id", a.id)).error).toBeNull();
    expect((await a.client.from("profiles").update({ portfolio_url: null }).eq("id", a.id)).error).toBeNull();
  });

  it("covers achievements as well", async () => {
    const { error } = await a.client.from("profile_achievements").insert({ user_id: a.id, title: "x", url: "javascript:alert(1)" });
    expect(error?.code).toBe("23514");
  });
});

describe("payment fulfilment is exactly-once and closed to members", () => {
  const orderId = `order_sec_${Math.random().toString(36).slice(2, 10)}`;

  afterAll(async () => {
    await admin.from("blue_tick_applications").delete().eq("user_id", a.id);
    await admin.from("blue_tick_orders").delete().eq("provider_order_id", orderId);
  });

  it("a member cannot mark an order paid, or refund one", async () => {
    for (const [fn, args] of [
      ["fulfil_blue_tick_order", { p_order: orderId, p_payment: "pay_x", p_amount: 100, p_method: null }],
      ["fail_blue_tick_order", { p_order: orderId, p_note: null }],
      ["refund_blue_tick_order", { p_payment: "pay_x", p_actor: a.id, p_note: null }],
    ]) {
      const { error } = await a.client.rpc(fn, args);
      expect(error, fn).not.toBeNull();
    }
  });

  it("settling the same payment twice (return page plus webhook, or a replay) creates one application", async () => {
    expect((await admin.from("blue_tick_orders").insert({ user_id: a.id, payer_username: a.username, provider: "test", provider_order_id: orderId, amount_paise: 9900 })).error).toBeNull();
    const first = await admin.rpc("fulfil_blue_tick_order", { p_order: orderId, p_payment: "pay_replay_1", p_amount: 9900, p_method: "upi" });
    const again = await admin.rpc("fulfil_blue_tick_order", { p_order: orderId, p_payment: "pay_replay_1", p_amount: 9900, p_method: "upi" });
    expect(first.data).toMatchObject({ status: "paid", duplicate: false, already: false });
    expect(again.data).toMatchObject({ status: "paid", already: true });
    expect(again.data.application_id).toBe(first.data.application_id);
    const { count } = await admin.from("blue_tick_applications").select("id", { count: "exact", head: true }).eq("user_id", a.id);
    expect(count).toBe(1);
  });

  it("refuses a payment whose amount differs from the order", async () => {
    const other = `order_sec_${Math.random().toString(36).slice(2, 10)}`;
    await admin.from("blue_tick_orders").insert({ user_id: b.id, payer_username: b.username, provider: "test", provider_order_id: other, amount_paise: 9900 });
    const { error } = await admin.rpc("fulfil_blue_tick_order", { p_order: other, p_payment: "pay_cheap", p_amount: 100, p_method: null });
    expect(error?.message).toMatch(/amount_mismatch/);
    await admin.from("blue_tick_orders").delete().eq("provider_order_id", other);
  });
});
