import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GREENFIELD, RIVERSIDE, admin, anon, cleanupUsers, createUser, grantRoleDirect } from "../helpers/supabase.js";

/**
 * Refer & Earn (migration 20260143000051) with real sessions: attribution, the qualification rule, the single 100-Orbit reward through
 * the existing ledger, badge isolation, the referral leaderboard, review and reversal by administrators, the reminder cooldown and
 * the one-time announcement. Everything the browser could try to force is tried here and must be refused.
 */

const tag = Math.random().toString(36).slice(2, 7);
const rpc = (u, fn, args) => u.client.rpc(fn, args);
const istDay = (offset = 0) => new Date(Date.now() + offset * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
let keyN = 0;
const key = (p = "t") => `${p}-${tag}-${++keyN}`;

const balance = async (u) => (await admin.from("orbit_balances").select("balance").eq("user_id", u.id).maybeSingle()).data?.balance ?? 0;
const totals = async (u) => (await admin.from("orbit_balances").select("balance, earned_total, badge_earned_total").eq("user_id", u.id).maybeSingle()).data ?? { balance: 0, earned_total: 0, badge_earned_total: 0 };
const referralLedger = async (u) => (await admin.from("orbit_ledger").select("*").eq("user_id", u.id).eq("kind", "referral")).data;
const referralRow = async (referred) => (await admin.from("referrals").select("*").eq("referred_id", referred.id).maybeSingle()).data;
const codeOf = async (u) => (await rpc(u, "referral_my_code", {})).data;
const attribute = async (referrer, referred, net = null) => admin.rpc("referral_attribute", { p_referred: referred.id, p_code: await codeOf(referrer), p_net_hash: net });
/** One day of recognised Orbits activity (the daily bonus) for a member, recorded the way the app records it. */
const activeOn = (u, offset = 0) => admin.from("orbit_ledger").insert({ user_id: u.id, kind: "checkin", amount: 5, idempotency_key: key("act"), day: istDay(offset), source_type: "test" });
const qualify = async (referred, days = [0, -1]) => { for (const d of days) { const { error } = await activeOn(referred, d); if (error) throw error; } };

let snapshot;
let alice, bob, carol, dave, erin, frank, viewer, gadmin, cadmin, outsider;

beforeAll(async () => {
  snapshot = (await admin.from("referral_settings").select("*")).data;
  await admin.from("referral_settings").update({ value: true }).eq("key", "program_enabled");
  await admin.from("referral_settings").update({ value: 10 }).eq("key", "daily_referrer_cap");
  await admin.from("referral_settings").update({ value: 2 }).eq("key", "activation_days");
  [alice, bob, carol, dave, erin, frank, viewer] = await Promise.all(["ref-a", "ref-b", "ref-c", "ref-d", "ref-e", "ref-f", "ref-v"].map((n) => createUser(n)));
  outsider = await createUser("ref-out", { collegeId: RIVERSIDE });
  gadmin = await createUser("ref-gadmin");
  cadmin = await createUser("ref-cadmin");
  await grantRoleDirect(gadmin.id, "global_admin");
  await grantRoleDirect(cadmin.id, "college_admin", GREENFIELD);
});

afterAll(async () => {
  for (const s of snapshot ?? []) await admin.from("referral_settings").update({ value: s.value }).eq("key", s.key);
  await admin.from("notifications").delete().like("dedupe_key", `campaign:test-${tag}%`);
  await admin.from("referral_campaign_sends").delete().like("campaign_key", `test-${tag}%`);
  await cleanupUsers();
  await admin.from("orbit_seasons").delete().like("name", `T${tag}%`);
});

describe("invite codes", () => {
  it("creates one random, well-formed code per member and never changes it", async () => {
    const a = await codeOf(alice);
    expect(a).toMatch(/^[a-z0-9_-]{3,30}-[abcdefghjkmnpqrstuvwxyz23456789]{4}$/);
    expect(a.startsWith(`${alice.username.toLowerCase().slice(0, 30)}-`)).toBe(true); // related to the username, so it is easy to remember
    expect(await codeOf(alice)).toBe(a);
    const b = await codeOf(bob);
    expect(b).not.toBe(a);
    expect((await admin.from("referral_codes").select("user_id").in("user_id", [alice.id, bob.id])).data).toHaveLength(2);
  });

  it("is available to signed-in members only, and only for an active, onboarded account", async () => {
    expect((await anon().rpc("referral_my_code", {})).error).not.toBeNull();
    await admin.from("profiles").update({ status: "suspended" }).eq("id", frank.id);
    expect((await rpc(frank, "referral_my_code", {})).error?.message).toMatch(/account_restricted/);
    await admin.from("profiles").update({ status: "active" }).eq("id", frank.id);
  });

  it("shows the sign-up page only whether a code is usable and the inviter's display name (service role only)", async () => {
    const code = await codeOf(alice);
    expect((await admin.rpc("referral_preview", { p_code: code })).data).toEqual({ valid: true, name: "Test ref-a" });
    expect((await admin.rpc("referral_preview", { p_code: code.toLowerCase() })).data.valid).toBe(true);
    expect((await admin.rpc("referral_preview", { p_code: "nobody-zzzz" })).data).toEqual({ valid: false });
    expect((await admin.rpc("referral_preview", { p_code: alice.username })).data).toEqual({ valid: false }); // a bare username is not a code
    expect((await admin.rpc("referral_preview", { p_code: "x'; drop table referrals;--" })).data).toEqual({ valid: false });
    expect((await rpc(bob, "referral_preview", { p_code: code })).error).not.toBeNull();
    expect((await anon().rpc("referral_preview", { p_code: code })).error).not.toBeNull();
  });
});

describe("attribution at sign-up", () => {
  it("records one referrer for a brand-new account and nothing for anything else", async () => {
    const res = await attribute(alice, bob);
    expect(res.data).toMatchObject({ attributed: true });
    const row = await referralRow(bob);
    expect(row).toMatchObject({ referrer_id: alice.id, status: "registered", reward_amount: null, qualified_at: null, idempotency_key: `referral:${bob.id}` });
    expect(await referralLedger(alice)).toHaveLength(0); // a registration alone pays nothing
    expect(await balance(alice)).toBe(0);
  });

  it("allows only one referrer per account and never counts the same account twice", async () => {
    expect((await attribute(alice, bob)).data).toMatchObject({ attributed: false, reason: "already_attributed" });
    expect((await attribute(carol, bob)).data).toMatchObject({ attributed: false, reason: "already_attributed" });
    expect((await admin.from("referrals").select("id").eq("referred_id", bob.id)).data).toHaveLength(1);
    expect((await admin.from("referrals").select("referrer_id").eq("referred_id", bob.id).single()).data.referrer_id).toBe(alice.id);
  });

  it("rejects a self-referral", async () => {
    expect((await attribute(carol, carol)).data).toMatchObject({ attributed: false, reason: "self_referral" });
    expect(await referralRow(carol)).toBeNull();
    // and the table itself refuses it, whoever writes
    const { error } = await admin.from("referrals").insert({ referrer_id: carol.id, referred_id: carol.id, qualify_by: new Date(Date.now() + 1e9).toISOString(), idempotency_key: key("self") });
    expect(error).not.toBeNull();
  });

  it("handles invalid, unknown, expired and disabled cases without throwing", async () => {
    const real = await codeOf(alice);
    for (const bad of ["", "short", "nobody-0000", real.slice(0, -1), `${real}x`, `${real.slice(0, -1)}1`, "<script>alert(1)</script>", null]) {
      expect((await admin.rpc("referral_attribute", { p_referred: dave.id, p_code: bad, p_net_hash: null })).data, String(bad)).toMatchObject({ attributed: false, reason: "invalid_code" });
    }
    expect(await referralRow(dave)).toBeNull();
    // an account that is not new cannot be "referred" after the fact
    await admin.from("profiles").update({ created_at: new Date(Date.now() - 5 * 3600_000).toISOString() }).eq("id", dave.id);
    expect((await attribute(alice, dave)).data).toMatchObject({ attributed: false, reason: "not_new" });
    await admin.from("profiles").update({ created_at: new Date().toISOString() }).eq("id", dave.id);
    // the program switch
    await admin.from("referral_settings").update({ value: false }).eq("key", "program_enabled");
    expect((await attribute(alice, dave)).data).toMatchObject({ attributed: false, reason: "disabled" });
    await admin.from("referral_settings").update({ value: true }).eq("key", "program_enabled");
    expect(await referralRow(dave)).toBeNull();
    const refused = (await admin.from("referral_events").select("detail").eq("kind", "attribution_rejected").gte("created_at", new Date(Date.now() - 600_000).toISOString())).data.map((e) => e.detail.reason);
    expect(refused).toEqual(expect.arrayContaining(["self_referral", "not_new", "invalid_code"]));
  });

  it("is not callable from a browser session", async () => {
    const code = await codeOf(alice);
    for (const who of [alice, outsider]) expect((await rpc(who, "referral_attribute", { p_referred: dave.id, p_code: code, p_net_hash: null })).error, who.username).not.toBeNull();
    expect((await anon().rpc("referral_attribute", { p_referred: dave.id, p_code: code })).error).not.toBeNull();
    expect(await referralRow(dave)).toBeNull();
  });
});

describe("qualification and the 100-Orbit reward", () => {
  it("does not pay for a registration, one active day, or a link that was only opened", async () => {
    expect((await referralRow(bob)).status).toBe("registered");
    await activeOn(bob, 0);
    expect((await referralRow(bob)).status).toBe("pending_qualification");
    expect(await referralLedger(alice)).toHaveLength(0);
    expect(await balance(alice)).toBe(0);
  });

  it("pays exactly 100 Orbits, once, through the Orbits ledger when the rule is met", async () => {
    const before = await totals(alice);
    await activeOn(bob, -1); // the second active day
    const row = await referralRow(bob);
    expect(row).toMatchObject({ status: "rewarded", reward_amount: 100 });
    expect(row.qualified_at).not.toBeNull();
    const entries = await referralLedger(alice);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ amount: 100, kind: "referral", source_type: "referral", source_id: row.id, idempotency_key: `referral:${bob.id}`, earned_amount: 100, badge_amount: 0 });
    expect(row.reward_ledger_id).toBe(entries[0].id);
    const after = await totals(alice);
    expect(after.balance - before.balance).toBe(100); // lifetime balance
    expect(after.earned_total - before.earned_total).toBe(100); // all-time leaderboard metric
    expect(after.badge_earned_total - before.badge_earned_total).toBe(0); // badge progress
    const note = (await admin.from("notifications").select("type, category, data").eq("user_id", alice.id).eq("type", "referral_reward")).data;
    expect(note).toHaveLength(1);
    expect(note[0]).toMatchObject({ category: "rewards", data: { amount: 100 } });
  });

  it("never pays a second time, however the same event arrives again", async () => {
    await activeOn(bob, -2);
    await activeOn(bob, -3);
    await qualify(bob, [-4, -5]);
    expect(await referralLedger(alice)).toHaveLength(1);
    expect(await balance(alice)).toBe(100);
    // the ledger itself refuses a duplicate of the reward's idempotency key
    const dup = await admin.from("orbit_ledger").insert({ user_id: alice.id, kind: "referral", amount: 100, idempotency_key: `referral:${bob.id}`, day: istDay(), source_type: "referral" });
    expect(dup.error?.code).toBe("23505");
    // and the referral cannot be re-attributed to someone else, which would let another member be paid for the same account
    expect((await attribute(carol, bob)).data.attributed).toBe(false);
  });

  it("survives parallel qualification events: two tabs, retries, many events at once", async () => {
    const referred = await createUser("ref-par");
    await attribute(carol, referred);
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => activeOn(referred, -i)));
    expect(results.map((r) => r.error?.message).filter(Boolean)).toEqual([]);
    expect(await referralLedger(carol)).toHaveLength(1);
    expect(await balance(carol)).toBe(100);
    expect((await referralRow(referred)).status).toBe("rewarded");
  });

  it("pays nothing when the invited account never finishes onboarding or is not active, and nothing after the window", async () => {
    const ghost = await createUser("ref-ghost");
    await admin.from("profiles").update({ onboarded_at: null }).eq("id", ghost.id);
    await attribute(dave, ghost);
    await qualify(ghost);
    expect((await referralRow(ghost)).status).toBe("registered");
    expect(await referralLedger(dave)).toHaveLength(0);
    // finishing onboarding re-evaluates at once (activity came first)
    await admin.from("profiles").update({ onboarded_at: new Date().toISOString() }).eq("id", ghost.id);
    expect((await referralRow(ghost)).status).toBe("rewarded");

    const late = await createUser("ref-late");
    await attribute(erin, late);
    await admin.from("referrals").update({ qualify_by: new Date(Date.now() - 1000).toISOString() }).eq("referred_id", late.id);
    await qualify(late);
    expect((await referralRow(late)).status).toBe("expired");
    expect(await referralLedger(erin)).toHaveLength(0);
  });

  it("does not pay when the inviter's account is not in good standing, and pays after reinstatement", async () => {
    const referred = await createUser("ref-susp");
    await attribute(frank, referred);
    await admin.from("profiles").update({ status: "suspended" }).eq("id", frank.id);
    await qualify(referred);
    expect((await referralRow(referred)).status).toBe("pending_qualification");
    expect(await referralLedger(frank)).toHaveLength(0);
    await admin.from("profiles").update({ status: "active" }).eq("id", frank.id);
    await activeOn(referred, -6);
    expect((await referralRow(referred)).status).toBe("rewarded");
  });

  it("is the same system as the rest of Orbits: the member sees the reward in their history and overview", async () => {
    const hist = await rpc(alice, "orbit_overview", {});
    expect(hist.data.balance).toBe(100);
    expect(hist.data.recent.find((r) => r.kind === "referral")).toMatchObject({ amount: 100 });
    const own = (await alice.client.from("orbit_ledger").select("kind, amount").eq("kind", "referral")).data;
    expect(own).toEqual([{ kind: "referral", amount: 100 }]);
  });
});

describe("referral Orbits count for the balance and leaderboards, not for badges, streaks or the challenge", () => {
  it("counts toward this week's Orbits leaderboard and the all-time one", async () => {
    const weekly = (await rpc(viewer, "orbit_leaderboard", { p_scope: "global", p_period: "weekly", p_limit: 50, p_offset: 0 })).data;
    expect(Number(weekly.find((r) => r.user_id === alice.id)?.score)).toBe(100);
    const all = (await rpc(viewer, "orbit_leaderboard", { p_scope: "global", p_period: "alltime", p_limit: 50, p_offset: 0 })).data;
    expect(Number(all.find((r) => r.user_id === alice.id)?.score)).toBe(100);
    expect((await rpc(alice, "orbit_overview", {})).data.earned_week).toBe(100);
  });

  it("leaves streaks, daily challenges and badges untouched by the reward itself", async () => {
    expect(await totals(alice)).toMatchObject({ balance: 100, earned_total: 100, badge_earned_total: 0 });
    const o = (await rpc(alice, "orbit_overview", {})).data;
    expect(o.streak.current).toBe(0);
    expect(o.checkin.claimed_today).toBe(false);
    expect((await admin.from("orbit_streak_days").select("day").eq("user_id", alice.id)).data).toEqual([]);
    expect((await admin.from("orbit_answers").select("question_id").eq("user_id", alice.id)).data).toEqual([]);
    expect((await admin.from("orbit_streaks").select("current_streak").eq("user_id", alice.id)).data).toEqual([]);
    expect((await admin.from("orbit_user_achievements").select("achievement_id").eq("user_id", alice.id)).data).toEqual([]);
    expect(o.next_achievement).toMatchObject({ id: "first_challenge", progress: 0 }); // no badge moved closer
  });

  it("does not count toward 'Earned 100 Orbits' or any badge, while the same 100 ordinary Orbits do", async () => {
    const inviter = await createUser("ref-bi");
    const referred = await createUser("ref-bj");
    await attribute(inviter, referred);
    await qualify(referred);
    const control = await createUser("ref-ctl");
    await admin.from("orbit_ledger").insert({ user_id: control.id, kind: "post", amount: 100, idempotency_key: key("ctl"), day: istDay(), source_type: "test" });
    expect(await totals(inviter)).toMatchObject({ balance: 100, earned_total: 100, badge_earned_total: 0 });
    expect(await totals(control)).toMatchObject({ balance: 100, earned_total: 100, badge_earned_total: 100 });
    // a contribution makes the app re-check every badge for the member (this is what a post or an answer does)
    for (const u of [inviter, control]) expect((await admin.rpc("_orbit_mark_day", { p_user: u.id, p_day: istDay(), p_kind: "post" })).error).toBeNull();
    const earnedIds = async (u) => (await admin.from("orbit_user_achievements").select("achievement_id").eq("user_id", u.id)).data.map((a) => a.achievement_id);
    expect(await earnedIds(control)).toContain("orbits_100");
    expect(await earnedIds(inviter)).not.toContain("orbits_100");
    expect(await earnedIds(inviter)).toEqual(["first_contribution"]); // only what the contribution itself earned
    const progress = (await rpc(inviter, "orbit_overview", {})).data.next_achievement;
    expect(progress.id).not.toBe("orbits_100");
  });

  it("does not let referral Orbits buy an Orbit Elite season badge", async () => {
    const x = await createUser("ref-sx");
    const y = await createUser("ref-sy");
    const d = istDay(-400);
    await admin.from("orbit_ledger").insert([
      { user_id: x.id, kind: "referral", amount: 100, idempotency_key: key("sx"), day: d, source_type: "test" },
      { user_id: y.id, kind: "post", amount: 50, idempotency_key: key("sy"), day: d, source_type: "test" },
    ]);
    const season = await rpc(gadmin, "orbit_admin_save_season", { p_id: null, p_name: `T${tag}ref`, p_from: d, p_to: istDay(-399) });
    expect(season.error).toBeNull();
    expect((await rpc(gadmin, "orbit_admin_finalize_season", { p_id: season.data })).error).toBeNull();
    const results = (await admin.from("orbit_season_results").select("user_id, rank, score").eq("season_id", season.data).eq("scope", "global")).data;
    expect(results.find((r) => r.user_id === y.id)).toMatchObject({ rank: 1, score: 50 });
    expect(results.find((r) => r.user_id === x.id)).toBeUndefined();
  });

  it("keeps the rules in one explicit table, with referral excluded and unknown sources counting for nothing", async () => {
    const rules = Object.fromEntries((await admin.from("orbit_reward_sources").select("kind, counts_for_badges")).data.map((r) => [r.kind, r.counts_for_badges]));
    expect(rules.referral).toBe(false);
    expect(rules.manual_adjustment).toBe(false);
    for (const k of ["checkin", "challenge_participation", "challenge_correct", "post", "helpful_answer", "streak_milestone", "achievement"]) expect(rules[k], k).toBe(true);
    // a member cannot change the rules
    expect((await alice.client.from("orbit_reward_sources").update({ counts_for_badges: true }).eq("kind", "referral").select()).data ?? []).toEqual([]);
    expect((await admin.from("orbit_reward_sources").select("counts_for_badges").eq("kind", "referral").single()).data.counts_for_badges).toBe(false);
  });
});

describe("the referral leaderboard", () => {
  it("ranks qualified, non-reversed referrals, with the earliest to reach a count winning a tie", async () => {
    // carol has 1 (above), dave gets 2, erin gets 1 later than carol
    for (const n of ["lb1", "lb2"]) { const r = await createUser(`ref-${n}`); await attribute(dave, r); await qualify(r); }
    const e = await createUser("ref-lb3");
    await attribute(erin, e);
    await qualify(e);
    const board = (await rpc(viewer, "referral_leaderboard", { p_period: "alltime", p_limit: 50, p_offset: 0 })).data;
    const mine = board.filter((r) => [alice.id, carol.id, dave.id, erin.id].includes(r.user_id));
    expect(mine[0].user_id).toBe(dave.id);
    expect(Number(mine[0].score)).toBe(3); // ref-ghost counted as well
    const order = mine.map((r) => r.user_id);
    expect(order.indexOf(alice.id)).toBeLessThan(order.indexOf(carol.id)); // alice and carol tie on 1: alice qualified first
    expect(order.indexOf(carol.id)).toBeLessThan(order.indexOf(erin.id));
    for (let i = 1; i < board.length; i++) expect(Number(board[i - 1].score)).toBeGreaterThanOrEqual(Number(board[i].score));
    expect(board.every((r, i) => Number(r.rank) === Number(board[0].rank) + i)).toBe(true);
    const row = board.find((r) => r.user_id === alice.id);
    expect(Object.keys(row).sort()).toEqual(["avatar_key", "full_name", "in_progress", "period_end", "period_start", "rank", "score", "total", "user_id", "username"]);
  });

  it("shows the signed-in member their own rank, even outside the page", async () => {
    const page1 = (await rpc(alice, "referral_leaderboard", { p_period: "alltime", p_limit: 1, p_offset: 0 })).data;
    expect(page1).toHaveLength(1);
    const me = (await rpc(alice, "referral_my_rank", { p_period: "alltime" })).data[0];
    expect(Number(me.rank)).toBeGreaterThan(0);
    expect(Number(me.score)).toBe(1);
    expect(me.participating).toBe(true);
    const none = (await rpc(viewer, "referral_my_rank", { p_period: "alltime" })).data[0];
    expect(none.rank).toBeNull();
    expect(Number(none.score)).toBe(0);
  });

  it("uses the same IST weeks as the Orbits board, and keeps all-time permanent", async () => {
    const weekly = (await rpc(viewer, "referral_leaderboard", { p_period: "weekly", p_limit: 50, p_offset: 0 })).data;
    expect(weekly.find((r) => r.user_id === alice.id)).toBeTruthy();
    expect(weekly[0].in_progress).toBe(true);
    const orbitWeek = (await rpc(viewer, "orbit_leaderboard", { p_scope: "global", p_period: "weekly", p_limit: 1, p_offset: 0 })).data[0];
    expect(weekly[0].period_start).toBe(orbitWeek.period_start);
    expect(weekly[0].period_end).toBe(orbitWeek.period_end);
    // a referral that qualified last week is in all time but not this week
    const old = await createUser("ref-old");
    await attribute(frank, old);
    await qualify(old);
    await admin.from("referrals").update({ qualified_day: istDay(-14) }).eq("referred_id", old.id);
    const w = (await rpc(viewer, "referral_leaderboard", { p_period: "weekly", p_limit: 50, p_offset: 0 })).data;
    const a = (await rpc(viewer, "referral_leaderboard", { p_period: "alltime", p_limit: 50, p_offset: 0 })).data;
    expect(Number(w.find((r) => r.user_id === frank.id)?.score ?? 0)).toBe(1); // frank also has the earlier suspended-then-reinstated referral
    expect(Number(a.find((r) => r.user_id === frank.id)?.score)).toBe(2);
  });

  it("leaves out members who opted out of leaderboards, and rejects unknown periods", async () => {
    await admin.from("profiles").update({ orbits_on_leaderboard: false }).eq("id", erin.id);
    const board = (await rpc(viewer, "referral_leaderboard", { p_period: "alltime", p_limit: 50, p_offset: 0 })).data;
    expect(board.find((r) => r.user_id === erin.id)).toBeUndefined();
    await admin.from("profiles").update({ orbits_on_leaderboard: true }).eq("id", erin.id);
    expect((await rpc(viewer, "referral_leaderboard", { p_period: "monthly", p_limit: 5, p_offset: 0 })).error?.message).toMatch(/invalid_scope/);
    expect((await anon().rpc("referral_leaderboard", { p_period: "alltime", p_limit: 5, p_offset: 0 })).error).not.toBeNull();
  });

  it("pages in the database and caps the page size", async () => {
    const big = (await rpc(viewer, "referral_leaderboard", { p_period: "alltime", p_limit: 5000, p_offset: 0 })).data;
    expect(big.length).toBeLessThanOrEqual(50);
    const second = (await rpc(viewer, "referral_leaderboard", { p_period: "alltime", p_limit: 2, p_offset: 2 })).data;
    expect(Number(second[0]?.rank)).toBe(Number(big[2]?.rank));
  });
});

describe("the member's own dashboard", () => {
  it("counts successful and pending referrals and the Orbits earned, and names nobody", async () => {
    const pending = await createUser("ref-pend");
    await attribute(alice, pending);
    const o = (await rpc(alice, "referral_overview", {})).data;
    expect(o).toMatchObject({ enabled: true, reward: 100, successful: 1, pending: 1, orbits_earned: 100, activation_days: 2 });
    expect(o.code).toBe(await codeOf(alice));
    const json = JSON.stringify(o.recent);
    for (const u of [bob, pending]) expect(json).not.toContain(u.username);
    expect(o.recent.map((r) => r.status).sort()).toEqual(["registered", "rewarded"]);
    expect(Object.keys(o.recent[0]).sort()).toEqual(["at", "id", "status"]);
  });
});

describe("what a browser cannot do", () => {
  it("cannot read or write referral tables directly", async () => {
    for (const t of ["referrals", "referral_codes", "referral_events", "referral_settings", "referral_prompt_state", "referral_campaign_sends"]) {
      const read = await alice.client.from(t).select("*").limit(5);
      expect(read.error !== null || (read.data ?? []).length === 0, `${t} readable`).toBe(true);
    }
    const row = await referralRow(bob);
    expect((await alice.client.from("referrals").update({ status: "rewarded" }).eq("id", row.id).select()).data ?? []).toEqual([]);
    expect((await bob.client.from("referrals").update({ referrer_id: bob.id }).eq("id", row.id).select()).data ?? []).toEqual([]);
    expect((await carol.client.from("referrals").insert({ referrer_id: carol.id, referred_id: erin.id, qualify_by: new Date().toISOString(), idempotency_key: key("hack") })).error).not.toBeNull();
    expect((await alice.client.from("referral_codes").update({ code: "aaaaaa-aaaa" }).eq("user_id", alice.id).select()).data ?? []).toEqual([]);
    expect((await admin.from("referral_codes").select("code").eq("user_id", alice.id).single()).data.code).not.toBe("aaaaaa-aaaa");
    expect((await alice.client.from("referral_settings").update({ value: false }).eq("key", "program_enabled").select()).data ?? []).toEqual([]);
  });

  it("cannot call the internal functions or force a qualification", async () => {
    const pending = (await admin.from("referrals").select("id, referred_id").eq("status", "registered").limit(1).single()).data;
    const attempts = [
      ["_referral_evaluate", { p_referred: pending.referred_id }],
      ["_referral_credit", { p_id: pending.id, p_actor: null, p_signals: null }],
      ["referral_campaign_deliver", { p_limit: 5 }],
      ["referral_maintenance", {}],
      ["_referral_new_code", {}],
    ];
    for (const [fn, args] of attempts) {
      expect((await alice.client.rpc(fn, args)).error, fn).not.toBeNull();
      expect((await anon().rpc(fn, args)).error, fn).not.toBeNull();
    }
    expect((await admin.from("referrals").select("status").eq("id", pending.id).single()).data.status).toBe("registered");
    expect(await referralLedger(carol)).toHaveLength(1); // only the parallel-test reward
  });

  it("cannot reach any administrator function, and a college admin has no referral permission", async () => {
    const id = (await referralRow(bob)).id;
    const calls = [
      ["referral_admin_metrics", {}],
      ["referral_admin_list", { p_status: null, p_q: null, p_limit: 5, p_offset: 0 }],
      ["referral_admin_detail", { p_id: id }],
      ["referral_admin_review", { p_id: id, p_decision: "approve", p_reason: "let me in" }],
      ["referral_admin_reverse", { p_id: id, p_reason: "just because" }],
      ["referral_admin_settings", {}],
      ["referral_admin_set_setting", { p_key: "program_enabled", p_value: false }],
      ["referral_admin_stop_campaign", { p_retract: true }],
      ["referral_admin_export", { p_from: null, p_to: null }],
    ];
    for (const who of [alice, cadmin]) for (const [fn, args] of calls) expect((await rpc(who, fn, args)).error?.message, `${fn} as ${who.username}`).toMatch(/forbidden/);
    for (const [fn, args] of calls) expect((await anon().rpc(fn, args)).error, fn).not.toBeNull();
    expect((await admin.from("referral_settings").select("value").eq("key", "program_enabled").single()).data.value).toBe(true);
    expect((await admin.from("referrals").select("status").eq("id", id).single()).data.status).toBe("rewarded");
  });
});

describe("abuse limits, review and reversal", () => {
  it("holds rewards over the 24-hour cap for review instead of paying or punishing", async () => {
    await admin.from("referral_settings").update({ value: 2 }).eq("key", "daily_referrer_cap");
    const inviter = await createUser("ref-cap");
    const people = await Promise.all(["c1", "c2", "c3"].map((n) => createUser(`ref-${n}`)));
    for (const p of people) { await attribute(inviter, p, "same-net"); }
    for (const p of people) await qualify(p);
    const rows = await Promise.all(people.map(referralRow));
    expect(rows.filter((r) => r.status === "rewarded")).toHaveLength(2);
    const held = rows.find((r) => r.status === "flagged");
    expect(held.signals).toEqual(expect.arrayContaining(["velocity"]));
    expect(await balance(inviter)).toBe(200);
    // the shared network is only a signal, recorded on the rewarded ones too
    expect(rows.some((r) => r.signals.includes("shared_network"))).toBe(true);
    await admin.from("referral_settings").update({ value: 10 }).eq("key", "daily_referrer_cap");

    // an administrator decides: approving pays once, a second decision is refused
    expect((await rpc(gadmin, "referral_admin_review", { p_id: held.id, p_decision: "approve", p_reason: "ok" })).error?.message).toMatch(/reason_required/);
    expect((await rpc(gadmin, "referral_admin_review", { p_id: held.id, p_decision: "maybe", p_reason: "not sure at all" })).error?.message).toMatch(/invalid_decision/);
    const ok = await rpc(gadmin, "referral_admin_review", { p_id: held.id, p_decision: "approve", p_reason: "Looks like real classmates" });
    expect(ok.error).toBeNull();
    expect(await balance(inviter)).toBe(300);
    expect((await rpc(gadmin, "referral_admin_review", { p_id: held.id, p_decision: "approve", p_reason: "again please" })).error?.message).toMatch(/not_reviewable/);
    expect((await rpc(gadmin, "referral_admin_review", { p_id: held.id, p_decision: "reject", p_reason: "changed my mind" })).error?.message).toMatch(/not_reviewable/);
    expect(await balance(inviter)).toBe(300);
    expect((await referralLedger(inviter)).length).toBe(3);
    const audit = (await admin.from("audit_logs").select("action, actor_id").eq("target_id", held.id)).data;
    expect(audit).toEqual(expect.arrayContaining([expect.objectContaining({ action: "referrals.approve", actor_id: gadmin.id })]));
  });

  it("lets an administrator reject a held referral: no reward, on record", async () => {
    await admin.from("referral_settings").update({ value: 1 }).eq("key", "daily_referrer_cap");
    const inviter = await createUser("ref-rej");
    const [p1, p2] = await Promise.all([createUser("ref-r1"), createUser("ref-r2")]);
    await attribute(inviter, p1); await attribute(inviter, p2);
    await qualify(p1); await qualify(p2);
    await admin.from("referral_settings").update({ value: 10 }).eq("key", "daily_referrer_cap");
    const held = await referralRow(p2);
    expect(held.status).toBe("flagged");
    expect((await rpc(gadmin, "referral_admin_review", { p_id: held.id, p_decision: "reject", p_reason: "Same person, two accounts" })).error).toBeNull();
    expect((await referralRow(p2))).toMatchObject({ status: "rejected", reward_amount: null, reviewed_by: gadmin.id });
    expect(await balance(inviter)).toBe(100);
    expect((await rpc(gadmin, "referral_admin_review", { p_id: (await referralRow(p1)).id, p_decision: "approve", p_reason: "this one was paid" })).error?.message).toMatch(/not_reviewable/);
  });

  it("reverses a reward with a compensating entry, once, audited, and removes it from the ranking", async () => {
    const referred = await createUser("ref-rev");
    const inviter = await createUser("ref-revi");
    await attribute(inviter, referred); await qualify(referred);
    const row = await referralRow(referred);
    expect(await balance(inviter)).toBe(100);
    expect((await rpc(gadmin, "referral_admin_reverse", { p_id: row.id, p_reason: "x" })).error?.message).toMatch(/reason_required/);
    const res = await rpc(gadmin, "referral_admin_reverse", { p_id: row.id, p_reason: "Both accounts belong to one person" });
    expect(res.data).toEqual({ taken: 100, shortfall: 0 });
    expect(await balance(inviter)).toBe(0);
    const entries = (await admin.from("orbit_ledger").select("*").eq("user_id", inviter.id).order("created_at")).data;
    expect(entries.map((e) => [e.kind, e.amount])).toEqual([["referral", 100], ["reversal", -100]]);
    expect(entries[1]).toMatchObject({ reverses_id: entries[0].id, created_by: gadmin.id, earned_amount: -100, badge_amount: 0 });
    expect(await referralRow(referred)).toMatchObject({ status: "reversed", reversal_ledger_id: entries[1].id, reversed_by: gadmin.id, reversal_shortfall: 0 });
    expect((await totals(inviter)).earned_total).toBe(0);
    expect((await totals(inviter)).badge_earned_total).toBe(0);
    expect((await rpc(gadmin, "referral_admin_reverse", { p_id: row.id, p_reason: "Doing it twice please" })).error?.message).toMatch(/not_reversible/);
    const me = (await rpc(inviter, "referral_my_rank", { p_period: "alltime" })).data[0];
    expect(me.rank).toBeNull();
    expect(Number(me.score)).toBe(0);
    const audit = (await admin.from("audit_logs").select("action, actor_id, metadata").eq("target_id", row.id).eq("action", "referrals.reversal")).data;
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actor_id: gadmin.id, metadata: { taken: 100, shortfall: 0 } });
    expect((await admin.from("notifications").select("type").eq("user_id", inviter.id).eq("type", "referral_reversed")).data).toHaveLength(1);
  });

  it("never takes a balance below zero or confiscates more than the reward", async () => {
    const referred = await createUser("ref-sf");
    const inviter = await createUser("ref-sfi");
    await attribute(inviter, referred); await qualify(referred);
    await admin.from("orbit_ledger").insert({ user_id: inviter.id, kind: "post", amount: 40, idempotency_key: key("own"), day: istDay(), source_type: "test" });
    // the staff correction used elsewhere: the balance now holds only 30
    expect((await rpc(gadmin, "orbit_admin_adjust", { p_user: inviter.id, p_amount: -110, p_reason: "Spent on a previous correction", p_key: key("adj-long") })).error).toBeNull();
    expect(await balance(inviter)).toBe(30);
    const res = await rpc(gadmin, "referral_admin_reverse", { p_id: (await referralRow(referred)).id, p_reason: "Fake account confirmed" });
    expect(res.data).toEqual({ taken: 30, shortfall: 70 });
    expect(await balance(inviter)).toBe(0);
    expect(await referralRow(referred)).toMatchObject({ status: "reversed", reversal_shortfall: 70 });
  });

  it("sends referral rewards to their own review, not the generic Orbit reversal", async () => {
    const entry = (await referralLedger(alice))[0];
    expect((await rpc(gadmin, "orbit_admin_reverse", { p_entry: entry.id, p_reason: "wrong tool for this" })).error?.message).toMatch(/use_referral_review/);
    expect(await balance(alice)).toBe(100);
  });

  it("expires referrals that ran out of time in the housekeeping step", async () => {
    const stale = await createUser("ref-stale");
    await attribute(bob, stale);
    await admin.from("referrals").update({ qualify_by: new Date(Date.now() - 86_400_000).toISOString() }).eq("referred_id", stale.id);
    const res = await admin.rpc("referral_maintenance");
    expect(res.error).toBeNull();
    expect(res.data.expired).toBeGreaterThanOrEqual(1);
    expect((await referralRow(stale)).status).toBe("expired");
  });

  it("keeps the signup-network hash short-lived", async () => {
    const stale = await createUser("ref-net");
    await attribute(bob, stale, "network-hash");
    expect((await referralRow(stale)).net_hash).toBe("network-hash");
    await admin.from("referrals").update({ registered_at: new Date(Date.now() - 100 * 86_400_000).toISOString() }).eq("referred_id", stale.id);
    await admin.rpc("referral_maintenance");
    expect((await referralRow(stale)).net_hash).toBeNull();
  });

  it("validates settings and audits every change", async () => {
    const set = (p_key, p_value) => rpc(gadmin, "referral_admin_set_setting", { p_key, p_value });
    for (const [k, v] of [["activation_days", 0], ["activation_days", 99], ["popup_frequency_days", "weekly"], ["program_enabled", "yes"], ["campaign_key", "Bad Key!"], ["campaign_title", "ab"], ["attribution_days", -1], ["daily_referrer_cap", 1.5]]) {
      expect((await set(k, v)).error?.message, `${k}=${v}`).toMatch(/invalid_value/);
    }
    expect((await set("reward_amount", 1000)).error?.message).toMatch(/unknown_setting/); // the reward is not a setting
    expect((await set("popup_frequency_days", 14)).error).toBeNull();
    expect((await admin.from("referral_settings").select("value").eq("key", "popup_frequency_days").single()).data.value).toBe(14);
    await set("popup_frequency_days", 7);
    const audit = (await admin.from("audit_logs").select("action").eq("target_id", "popup_frequency_days")).data;
    expect(audit.length).toBeGreaterThanOrEqual(2);
    // every number the admin screen can change is bounded in the database too
    expect((await admin.from("referrals").insert({ referrer_id: bob.id, qualify_by: new Date().toISOString(), idempotency_key: key("amt"), reward_amount: 500, status: "registered" })).error).not.toBeNull();
  });

  it("lists, searches and exports without private data", async () => {
    const list = await rpc(gadmin, "referral_admin_list", { p_status: null, p_q: alice.username, p_limit: 25, p_offset: 0 });
    expect(list.error).toBeNull();
    expect(list.data.length).toBeGreaterThanOrEqual(2);
    expect(list.data.every((r) => r.referrer_username === alice.username || r.referred_username === alice.username)).toBe(true);
    expect(Object.keys(list.data[0]).sort()).toEqual(["id", "referred_username", "referrer_username", "qualified_at", "registered_at", "signals", "status", "total_count"].sort());
    for (const q of ["%", "_", "\\", "' or 1=1 --", "a".repeat(500)]) expect((await rpc(gadmin, "referral_admin_list", { p_status: null, p_q: q, p_limit: 5, p_offset: 0 })).error, q.slice(0, 5)).toBeNull();
    expect((await rpc(gadmin, "referral_admin_list", { p_status: null, p_q: "%", p_limit: 5, p_offset: 0 })).data).toEqual([]);
    const detail = (await rpc(gadmin, "referral_admin_detail", { p_id: (await referralRow(bob)).id })).data;
    expect(detail).toMatchObject({ status: "rewarded", activity_days_required: 2 });
    expect(detail.referred.email_confirmed).toBe(true);
    expect(JSON.stringify(detail)).not.toContain("@example.test");
    expect(JSON.stringify(detail)).not.toContain("net_hash");
    const exported = await rpc(gadmin, "referral_admin_export", { p_from: null, p_to: null });
    expect(exported.error).toBeNull();
    expect(Object.keys(exported.data[0]).sort()).toEqual(["qualified_at", "referral_id", "registered_at", "reward_amount", "signals", "status"]);
    expect((await admin.from("audit_logs").select("action").eq("actor_id", gadmin.id).eq("action", "referrals.exported")).data.length).toBeGreaterThanOrEqual(1);
  });

  it("reports aggregate metrics to authorised staff only", async () => {
    const m = (await rpc(gadmin, "referral_admin_metrics", {})).data;
    expect(m.by_status.rewarded).toBeGreaterThanOrEqual(5);
    expect(m.orbits_issued).toBeGreaterThanOrEqual(500);
    expect(typeof m.campaign.key).toBe("string");
  });
});

describe("the reminder popup cooldown (kept on the server so it holds across devices and re-renders)", () => {
  let u;
  beforeAll(async () => {
    u = await createUser("ref-pop");
    await admin.from("profiles").update({ onboarded_at: new Date(Date.now() - 10 * 86_400_000).toISOString() }).eq("id", u.id);
  });
  const check = async () => (await rpc(u, "referral_prompt_check", {})).data.show;
  const record = async (event) => (await rpc(u, "referral_prompt_record", { p_event: event })).data;
  const state = async () => (await admin.from("referral_prompt_state").select("*").eq("user_id", u.id).maybeSingle()).data;

  it("waits for a meaningful point in the journey: onboarding done, some days passed, the platform actually used", async () => {
    expect(await check()).toBe(false); // no Orbits activity yet
    await activeOn(u, 0);
    expect(await check()).toBe(true);
    const fresh = await createUser("ref-pop-new");
    await activeOn(fresh, 0);
    expect((await rpc(fresh, "referral_prompt_check", {})).data.show).toBe(false); // onboarded a moment ago
  });

  it("counts a showing once and starts the cooldown; repeated reports do not move it", async () => {
    expect(await record("shown")).toEqual({ counted: true });
    const first = (await state()).last_shown_at;
    expect(await check()).toBe(false);
    for (let i = 0; i < 5; i++) expect(await record("shown")).toEqual({ counted: false }); // renders, route changes, another tab
    const s = await state();
    expect(s.last_shown_at).toBe(first);
    expect(s.shown_count).toBe(1);
  });

  it("counts one dismissal per showing", async () => {
    expect(await record("dismissed")).toEqual({ counted: true });
    expect(await record("dismissed")).toEqual({ counted: false });
    expect((await state()).dismiss_count).toBe(1);
  });

  it("comes back after the configured number of days, and the frequency is a setting", async () => {
    await admin.from("referral_prompt_state").update({ last_shown_at: new Date(Date.now() - 8 * 86_400_000).toISOString() }).eq("user_id", u.id);
    expect(await check()).toBe(true);
    await admin.from("referral_settings").update({ value: 30 }).eq("key", "popup_frequency_days");
    expect(await check()).toBe(false);
    await admin.from("referral_settings").update({ value: 7 }).eq("key", "popup_frequency_days");
    expect(await check()).toBe(true);
  });

  it("stops for good after the dismissal limit, and when the member or an administrator switches it off", async () => {
    for (let i = 0; i < 2; i++) {
      await admin.from("referral_prompt_state").update({ last_shown_at: new Date(Date.now() - 20 * 86_400_000).toISOString() }).eq("user_id", u.id);
      expect(await record("shown")).toEqual({ counted: true });
      expect(await record("dismissed")).toEqual({ counted: true });
    }
    expect((await state()).dismiss_count).toBe(3);
    await admin.from("referral_prompt_state").update({ last_shown_at: new Date(Date.now() - 90 * 86_400_000).toISOString() }).eq("user_id", u.id);
    expect(await check()).toBe(false); // limit reached
    expect(await record("opt_in")).toEqual({ counted: true }); // the member turns reminders back on: the count restarts
    expect(await check()).toBe(true);
    await record("opt_out");
    expect(await check()).toBe(false);
    expect((await rpc(u, "referral_prompt_preference", {})).data).toEqual({ opted_out: true });
    await record("opt_in");
    await admin.from("referral_settings").update({ value: false }).eq("key", "popup_enabled");
    expect(await check()).toBe(false);
    await admin.from("referral_settings").update({ value: true }).eq("key", "popup_enabled");
    expect(await check()).toBe(true);
  });

  it("refuses unknown events and anonymous callers", async () => {
    expect((await rpc(u, "referral_prompt_record", { p_event: "reset_everything" })).error?.message).toMatch(/invalid_event/);
    expect((await anon().rpc("referral_prompt_check", {})).error).not.toBeNull();
  });
});

describe("the launch announcement", () => {
  const campaign = `test-${tag}`;
  let r1, r2, r3, off;
  beforeAll(async () => {
    [r1, r2, r3, off] = await Promise.all(["ref-n1", "ref-n2", "ref-n3", "ref-n4"].map((n) => createUser(n)));
    // r2 turned off "Offers & invitations"; r3 switched the reminders off
    await r2.client.from("notification_preferences").insert({ user_id: r2.id, category: "promotions", in_app: false, email: false });
    await rpc(r3, "referral_prompt_record", { p_event: "opt_out" });
    await admin.from("referral_settings").update({ value: campaign }).eq("key", "campaign_key");
    await admin.from("referral_settings").update({ value: "Test announcement" }).eq("key", "campaign_title");
    await admin.from("referral_settings").update({ value: false }).eq("key", "campaign_enabled");
    void off;
  });
  const notes = async (u) => (await admin.from("notifications").select("*").eq("user_id", u.id).eq("type", "referral_campaign")).data;

  it("sends nothing while it is switched off", async () => {
    const res = await admin.rpc("referral_campaign_deliver", { p_limit: 2000 });
    expect(res.data).toMatchObject({ sent: 0, active: false });
    expect(await notes(r1)).toHaveLength(0);
  });

  it("sends once per member, in the app only, respecting preferences", async () => {
    await admin.from("referral_settings").update({ value: true }).eq("key", "campaign_enabled");
    const first = await admin.rpc("referral_campaign_deliver", { p_limit: 2000 });
    expect(first.error).toBeNull();
    expect(first.data.sent).toBeGreaterThanOrEqual(2);
    const [n1] = await notes(r1);
    expect(n1).toMatchObject({ category: "promotions", email_status: "none", dedupe_key: `campaign:${campaign}`, data: { title: "Test announcement", campaign } });
    expect(n1.pushed_at).not.toBeNull(); // never goes out as a push
    expect(await notes(r2)).toHaveLength(0); // turned the category off
    expect(await notes(r3)).toHaveLength(0); // turned the reminders off
    const sends = Object.fromEntries((await admin.from("referral_campaign_sends").select("user_id, delivered").eq("campaign_key", campaign).in("user_id", [r1.id, r2.id, r3.id])).data.map((s) => [s.user_id, s.delivered]));
    expect(sends[r1.id]).toBe(true);
    expect(sends[r2.id]).toBe(false);
    expect(sends[r3.id]).toBe(false);
  });

  it("never sends the same announcement twice, even in parallel or after being read", async () => {
    await Promise.all([1, 2, 3].map(() => admin.rpc("referral_campaign_deliver", { p_limit: 2000 })));
    expect(await notes(r1)).toHaveLength(1);
    await r1.client.rpc("mark_all_notifications_read", { p_category: null });
    await admin.rpc("referral_campaign_deliver", { p_limit: 2000 });
    expect(await notes(r1)).toHaveLength(1);
    expect((await admin.from("referral_campaign_sends").select("user_id").eq("campaign_key", campaign).eq("user_id", r1.id)).data).toHaveLength(1);
  });

  it("is a member's category preference: the settings page can store it, and it links to Refer & Earn", async () => {
    expect((await r1.client.from("notification_preferences").insert({ user_id: r1.id, category: "promotions", in_app: true, email: false })).error).toBeNull();
    expect((await r1.client.from("notification_preferences").insert({ user_id: r1.id, category: "rewards", in_app: true, email: false })).error).toBeNull();
    expect((await r1.client.from("notification_preferences").insert({ user_id: r1.id, category: "ads", in_app: true, email: false })).error).not.toBeNull();
  });

  it("can be stopped by an administrator, optionally taking back the unread copies", async () => {
    const n = await createUser("ref-n5");
    await admin.from("referral_settings").update({ value: true }).eq("key", "campaign_enabled");
    await admin.rpc("referral_campaign_deliver", { p_limit: 2000 });
    expect(await notes(n)).toHaveLength(1);
    const stop = await rpc(gadmin, "referral_admin_stop_campaign", { p_retract: true });
    expect(stop.error).toBeNull();
    expect(stop.data.retracted).toBeGreaterThanOrEqual(1);
    expect(await notes(n)).toHaveLength(0);
    expect((await admin.from("referral_settings").select("value").eq("key", "campaign_enabled").single()).data.value).toBe(false);
    const later = await createUser("ref-n6");
    await admin.rpc("referral_campaign_deliver", { p_limit: 2000 });
    expect(await notes(later)).toHaveLength(0);
    expect((await admin.from("audit_logs").select("action").eq("actor_id", gadmin.id).eq("action", "referrals.campaign_stopped")).data.length).toBeGreaterThanOrEqual(1);
  });
});

describe("account erasure and data export", () => {
  it("keeps the inviter's count but forgets the invited person when they delete their account", async () => {
    const referred = await createUser("ref-del");
    const inviter = await createUser("ref-deli");
    await attribute(inviter, referred, "net-x");
    await qualify(referred);
    const id = (await referralRow(referred)).id;
    await admin.auth.admin.deleteUser(referred.id);
    const row = (await admin.from("referrals").select("*").eq("id", id).single()).data;
    expect(row).toMatchObject({ status: "rewarded", referred_id: null });
    await admin.rpc("referral_maintenance");
    expect((await admin.from("referrals").select("net_hash").eq("id", id).single()).data.net_hash).toBeNull();
    expect((await rpc(inviter, "referral_overview", {})).data.successful).toBe(1);
    // deleting the inviter removes their referrals, codes and prompt state with them
    await admin.auth.admin.deleteUser(inviter.id);
    expect((await admin.from("referrals").select("id").eq("id", id)).data).toEqual([]);
    expect((await admin.from("referral_codes").select("user_id").eq("user_id", inviter.id)).data).toEqual([]);
  });
});
