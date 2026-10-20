import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GREENFIELD, RIVERSIDE, admin, anon, cleanupUsers, createUser, grantRoleDirect } from "../helpers/supabase.js";

/**
 * Orbits (migration 20260125000032) with real sessions: every reward is idempotent and recorded in an append-only ledger,
 * the answer key is unreadable before answering, and leaderboards, seasons and admin tools respect scope and privacy.
 */

const tag = Math.random().toString(36).slice(2, 7);
const rpc = (u, fn, args) => u.client.rpc(fn, args);
const istDay = (offset = 0) => {
  const d = new Date(Date.now() + offset * 86_400_000);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
};
const today = () => istDay(0);
const slug = (p) => `${p}-${tag}-${Math.random().toString(36).slice(2, 7)}`;
const balance = async (u) => (await admin.from("orbit_balances").select("balance").eq("user_id", u.id).maybeSingle()).data?.balance ?? 0;
const ledger = async (u, kind) => {
  let q = admin.from("orbit_ledger").select("*").eq("user_id", u.id).order("created_at");
  if (kind) q = q.eq("kind", kind);
  return (await q).data;
};
const sumLedger = async (u) => (await ledger(u)).reduce((s, r) => s + r.amount, 0);
let keyN = 0;
// a reward (counts as earned); staff corrections are tested on their own because they deliberately do not count
const give = (u, amount, day = today()) => admin.from("orbit_ledger").insert({ user_id: u.id, kind: "post", amount, idempotency_key: `t-${tag}-${++keyN}`, day, source_type: "test" });

let a, b, c, d, e, outsider, gadmin, cadmin, quiet;
const questionIds = [];
async function makeQuestion({ date = today(), status = "published", correct = 1, question = `Which option is right? ${tag} ${Math.random()}` } = {}) {
  const { data, error } = await admin.from("orbit_questions").insert({
    question, options: ["Alpha", "Bravo", "Charlie", "Delta"], correct_index: correct, explanation: "Bravo is right because the test says so.", category: "general", publish_date: date, status,
  }).select("id").single();
  if (error) throw error;
  questionIds.push(data.id);
  return data.id;
}

beforeAll(async () => {
  // the production key set may contain a live question for today: the tests use dates far enough away or clear it first
  await admin.from("orbit_questions").delete().gte("publish_date", istDay(-10));
  await admin.from("orbit_seasons").delete().like("name", "T%"); // leftovers of an interrupted run
  [a, b, c, d, e, quiet] = await Promise.all(["orb-a", "orb-b", "orb-c", "orb-d", "orb-e", "orb-quiet"].map((n) => createUser(n)));
  outsider = await createUser("orb-out", { collegeId: RIVERSIDE });
  gadmin = await createUser("orb-gadmin");
  cadmin = await createUser("orb-cadmin");
  await grantRoleDirect(gadmin.id, "global_admin");
  await grantRoleDirect(cadmin.id, "college_admin", GREENFIELD);
});
afterAll(async () => {
  await admin.from("orbit_questions").delete().in("id", questionIds);
  await admin.from("posts").delete().like("slug", `%-${tag}-%`);
  await cleanupUsers();
  await admin.from("orbit_seasons").delete().like("name", `T${tag}%`); // after the members: badges reference the season
});

describe("Daily Orbit Bonus", () => {
  it("pays once, then reports it as already claimed", async () => {
    const first = await rpc(a, "orbit_claim_checkin", {});
    expect(first.error).toBeNull();
    expect(first.data).toMatchObject({ claimed: true, amount: 5, balance: 5 });
    const again = await rpc(a, "orbit_claim_checkin", {});
    expect(again.data).toMatchObject({ claimed: false, already_claimed: true, amount: 0, balance: 5 });
    expect(await ledger(a, "checkin")).toHaveLength(1);
  });

  it("survives a burst of parallel claims (two tabs, two devices)", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => rpc(b, "orbit_claim_checkin", {})));
    expect(results.filter((r) => r.data?.claimed).length).toBe(1);
    expect(await ledger(b, "checkin")).toHaveLength(1);
    expect(await balance(b)).toBe(5);
  });

  it("does not count as a streak day", async () => {
    const overview = (await rpc(a, "orbit_overview", {})).data;
    expect(overview.streak.current).toBe(0);
    expect(overview.checkin.claimed_today).toBe(true);
    expect((await admin.from("orbit_streak_days").select("day").eq("user_id", a.id)).data).toEqual([]);
  });

  it("is refused for a suspended account and for anonymous callers", async () => {
    await admin.from("profiles").update({ status: "suspended" }).eq("id", quiet.id);
    expect((await rpc(quiet, "orbit_claim_checkin", {})).error?.message).toMatch(/account_restricted/);
    await admin.from("profiles").update({ status: "active" }).eq("id", quiet.id);
    expect((await anon().rpc("orbit_claim_checkin", {})).error).not.toBeNull();
  });
});

describe("Daily Challenge", () => {
  let q;
  beforeAll(async () => {
    q = await makeQuestion();
  });

  it("never exposes the answer key or explanation before the member answers", async () => {
    const res = (await rpc(c, "orbit_daily_question", {})).data;
    expect(res.id).toBe(q);
    expect(res.options).toHaveLength(4);
    expect(res.answered).toBe(false);
    expect(res.result).toBeNull();
    expect(JSON.stringify(res)).not.toMatch(/correct_index|Bravo is right/);
    // and the table itself cannot be read through the API
    expect((await c.client.from("orbit_questions").select("correct_index").eq("id", q)).error).not.toBeNull();
    expect((await rpc(c, "orbit_my_history", {})).data).toEqual([]);
  });

  it("pays participation and the correctness bonus once, and reveals the explanation after", async () => {
    const res = await rpc(c, "orbit_submit_answer", { p_question: q, p_selected: 1 });
    expect(res.error).toBeNull();
    // 10 for the answer, plus the 5 Orbit bonus of the "First Challenge" badge it unlocks
    expect(res.data).toMatchObject({ already_answered: false, is_correct: true, correct_index: 1, earned_participation: 5, earned_correct: 5, balance: 15 });
    expect(res.data.explanation).toMatch(/Bravo/);
    const again = await rpc(c, "orbit_submit_answer", { p_question: q, p_selected: 2 });
    expect(again.data).toMatchObject({ already_answered: true, selected: 1, is_correct: true, earned_participation: 0, earned_correct: 0, balance: 15 });
    expect(await balance(c)).toBe(15);
    expect(await ledger(c, "challenge_participation")).toHaveLength(1);
    expect(await ledger(c, "challenge_correct")).toHaveLength(1);
    const view = (await rpc(c, "orbit_daily_question", {})).data;
    expect(view.answered).toBe(true);
    expect(view.result).toMatchObject({ selected: 1, is_correct: true, correct_index: 1, earned: 10 });
  });

  it("pays only participation for a wrong answer and still counts as a streak day", async () => {
    const res = (await rpc(d, "orbit_submit_answer", { p_question: q, p_selected: 3 })).data;
    expect(res).toMatchObject({ is_correct: false, earned_participation: 5, earned_correct: 0, balance: 10 });
    const overview = (await rpc(d, "orbit_overview", {})).data;
    expect(overview.streak).toMatchObject({ current: 1, best: 1, contributed_today: true });
  });

  it("counts one answer when the same member submits in parallel, whichever option arrives first", async () => {
    const results = await Promise.all([0, 1, 2, 3, 1, 0].map((n) => rpc(e, "orbit_submit_answer", { p_question: q, p_selected: n })));
    expect(results.every((r) => r.error === null)).toBe(true);
    expect(results.filter((r) => !r.data.already_answered)).toHaveLength(1);
    expect(new Set(results.map((r) => r.data.selected)).size).toBe(1);
    expect((await admin.from("orbit_answers").select("selected").eq("user_id", e.id).eq("question_id", q)).data).toHaveLength(1);
    expect(await ledger(e, "challenge_participation")).toHaveLength(1);
  });

  it("rejects bad input and questions that are not the current one", async () => {
    const draft = await makeQuestion({ date: istDay(30), status: "draft" });
    const future = await makeQuestion({ date: istDay(31), status: "scheduled" });
    const old = await makeQuestion({ date: istDay(-9), status: "published" });
    for (const [id, sel, msg] of [[q, 4, /invalid_answer/], [q, -1, /invalid_answer/], [draft, 0, /question_not_available/], [future, 0, /question_not_available/], [old, 0, /question_not_available/]]) {
      expect((await rpc(quiet, "orbit_submit_answer", { p_question: id, p_selected: sel })).error?.message).toMatch(msg);
    }
    expect((await anon().rpc("orbit_submit_answer", { p_question: q, p_selected: 0 })).error).not.toBeNull();
  });

  it("lists only answered questions in the learning history, with their key", async () => {
    const other = await makeQuestion({ date: istDay(-1), status: "published" });
    const history = (await rpc(c, "orbit_my_history", {})).data;
    expect(history.map((h) => h.question_id)).toEqual([q]);
    expect(history[0]).toMatchObject({ selected: 1, is_correct: true, correct_index: 1, earned: 10 });
    expect(history.map((h) => h.question_id)).not.toContain(other);
    expect((await rpc(a, "orbit_my_history", {})).data).toEqual([]); // another member sees none of it
    await admin.from("orbit_questions").delete().eq("id", other);
  });

  it("allows one live question per date and a catch-up question when none is set for today, without extending the streak", async () => {
    expect((await admin.from("orbit_questions").insert({ question: "A second live question for today?", options: ["a1", "b1", "c1", "d1"], correct_index: 0, explanation: "Because the index says so.", category: "general", publish_date: today(), status: "scheduled" })).error?.code).toBe("23505");
    await admin.from("orbit_questions").update({ status: "archived" }).eq("id", q);
    const yesterday = await makeQuestion({ date: istDay(-1), status: "published", correct: 0 });
    const view = (await rpc(quiet, "orbit_daily_question", {})).data;
    expect(view).toMatchObject({ id: yesterday, fallback: true, answered: false });
    const res = (await rpc(quiet, "orbit_submit_answer", { p_question: yesterday, p_selected: 0 })).data;
    expect(res).toMatchObject({ fallback: true, is_correct: true, earned_participation: 5, earned_correct: 5 });
    expect((await admin.from("orbit_streak_days").select("day").eq("user_id", quiet.id)).data).toEqual([]);
    await admin.from("orbit_questions").update({ status: "published" }).eq("id", q);
  });
});

describe("Orbit Streak", () => {
  it("counts consecutive contribution days, restarts after a gap, keeps the best, and pays each milestone once", async () => {
    const mark = (u, day) => admin.rpc("_orbit_mark_day", { p_user: u.id, p_day: day, p_kind: "post" });
    for (const off of [-20, -19, -18]) expect((await mark(a, istDay(off))).error).toBeNull();
    expect((await admin.from("orbit_streaks").select("*").eq("user_id", a.id).single()).data).toMatchObject({ current_streak: 3, best_streak: 3 });
    expect((await ledger(a, "streak_milestone")).map((r) => r.amount)).toEqual([5]);
    await mark(a, istDay(-18)); // the same day again changes nothing
    expect((await admin.from("orbit_streak_days").select("day").eq("user_id", a.id)).data).toHaveLength(3);
    await mark(a, istDay(-15)); // a gap: the streak restarts, the best is kept
    expect((await admin.from("orbit_streaks").select("*").eq("user_id", a.id).single()).data).toMatchObject({ current_streak: 1, best_streak: 3 });
    for (const off of [-14, -13]) await mark(a, istDay(off));
    expect((await admin.from("orbit_streaks").select("current_streak").eq("user_id", a.id).single()).data.current_streak).toBe(3);
    expect(await ledger(a, "streak_milestone")).toHaveLength(1); // reaching 3 a second time pays nothing more
    // a streak that ended is shown as 0, and the balance is untouched
    const overview = (await rpc(a, "orbit_overview", {})).data;
    expect(overview.streak).toMatchObject({ current: 0, best: 3 });
    expect(overview.balance).toBe(await sumLedger(a));
  });

  it("awards streak badges from the trusted record, once", async () => {
    const earned = (await admin.from("orbit_user_achievements").select("achievement_id").eq("user_id", a.id)).data.map((r) => r.achievement_id);
    expect(earned).toEqual(expect.arrayContaining(["streak_3", "first_contribution"]));
    expect(earned).not.toContain("streak_7");
    expect(earned.filter((x) => x === "streak_3")).toHaveLength(1);
  });
});

describe("post and helpful-answer rewards", () => {
  const body = (n) => `A post that says something worth reading about topic number ${n} and adds enough detail to count. ${tag}`;
  const post = (u, over = {}) => u.client.from("posts").insert({ author_id: u.id, slug: slug("orbp"), body: body(Math.random()), visibility: "public", ...over }).select("id").single();

  it("pays the first eligible post of the day, once, and counts it as a streak day", async () => {
    expect((await post(quiet)).error).toBeNull();
    expect((await post(quiet)).error).toBeNull();
    expect((await post(quiet)).error).toBeNull();
    const rows = await ledger(quiet, "post");
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(10);
    expect((await admin.from("orbit_streak_days").select("kind").eq("user_id", quiet.id)).data).toEqual([{ kind: "post" }]);
  });

  it("does not pay short, private or repeated posts", async () => {
    const before = (await ledger(d, "post")).length;
    expect((await post(d, { body: "too short" })).error).toBeNull();
    expect((await post(d, { visibility: "private" })).error).toBeNull();
    expect((await ledger(d, "post")).length).toBe(before);
    const same = "The very same text is posted over and over again to farm the reward, which is not allowed. " + tag;
    expect((await post(d, { body: same })).error).toBeNull();
    const paid = (await ledger(d, "post")).length;
    expect((await post(d, { body: same })).error).toBeNull();
    expect((await ledger(d, "post")).length).toBe(paid);
  });

  it("takes the reward back when the post is removed, once, and does not re-offer that day's reward", async () => {
    const mine = await post(b);
    expect(mine.error).toBeNull();
    const reward = (await ledger(b, "post"))[0];
    expect(reward).toBeTruthy();
    const balBefore = await balance(b);
    await admin.from("posts").update({ status: "removed", removed_reason: "test" }).eq("id", mine.data.id);
    const reversal = (await ledger(b, "reversal"))[0];
    expect(reversal).toMatchObject({ amount: -10, reverses_id: reward.id });
    expect(await balance(b)).toBe(balBefore - 10);
    expect((await post(b)).error).toBeNull();
    expect(await ledger(b, "post")).toHaveLength(1); // the day's reward was spent
  });

  it("pays a helpful answer only when the question's author likes it, capped per day, and never for one's own answer", async () => {
    const asked = (await post(e, { category: "questions", title: "How do I read a datasheet?" })).data.id;
    const answer = async (u, text) => (await u.client.from("comments").insert({ post_id: asked, author_id: u.id, body: text }).select("id").single()).data.id;
    const long = (n) => `Start with the electrical characteristics table, then check the absolute maximum ratings (${n}).`;
    const helpful = await answer(c, long(1));
    const short = await answer(c, "Read it.");
    const own = await answer(e, long(2));
    await b.client.from("comment_reactions").insert({ comment_id: helpful, user_id: b.id }); // a bystander's like is not a signal
    expect(await ledger(c, "helpful_answer")).toHaveLength(0);
    await e.client.from("comment_reactions").insert({ comment_id: short, user_id: e.id });
    await e.client.from("comment_reactions").insert({ comment_id: own, user_id: e.id });
    expect(await ledger(c, "helpful_answer")).toHaveLength(0);
    await e.client.from("comment_reactions").insert({ comment_id: helpful, user_id: e.id });
    expect((await ledger(c, "helpful_answer")).map((r) => r.amount)).toEqual([5]);
    await e.client.from("comment_reactions").delete().eq("comment_id", helpful);
    await e.client.from("comment_reactions").insert({ comment_id: helpful, user_id: e.id });
    expect(await ledger(c, "helpful_answer")).toHaveLength(1); // like, unlike, like again: still one reward
    expect((await admin.from("orbit_streak_days").select("kind").eq("user_id", c.id).eq("day", today())).data).toEqual([{ kind: "challenge" }]); // the day was already counted
    for (let i = 3; i <= 7; i++) {
      const more = await answer(c, long(i));
      await e.client.from("comment_reactions").insert({ comment_id: more, user_id: e.id });
    }
    expect(await ledger(c, "helpful_answer")).toHaveLength(3); // the daily cap
  });
});

describe("the ledger and balances cannot be tampered with", () => {
  it("is append-only, unreadable across members, and unwritable through the API", async () => {
    const row = (await ledger(a))[0];
    expect((await admin.from("orbit_ledger").update({ amount: 9999 }).eq("id", row.id)).error?.message).toMatch(/append-only/);
    expect((await admin.from("orbit_ledger").delete().eq("id", row.id)).error?.message).toMatch(/append-only/);
    for (const who of [a, gadmin]) {
      expect((await who.client.from("orbit_ledger").insert({ user_id: who.id, kind: "checkin", amount: 500, idempotency_key: `forge-${who.id}`, day: today() })).error).not.toBeNull();
      expect((await who.client.from("orbit_balances").update({ balance: 99999 }).eq("user_id", who.id)).error).not.toBeNull();
      expect((await who.client.from("orbit_balances").insert({ user_id: who.id, balance: 99999 })).error).not.toBeNull();
      expect((await who.client.from("orbit_user_achievements").insert({ user_id: who.id, achievement_id: "streak_365" })).error).not.toBeNull();
      expect((await who.client.from("orbit_answers").insert({ user_id: who.id, question_id: questionIds[0], selected: 1, is_correct: true })).error).not.toBeNull();
    }
    expect((await b.client.from("orbit_ledger").select("id").eq("user_id", a.id)).data).toEqual([]);
    expect((await b.client.from("orbit_balances").select("balance").eq("user_id", a.id)).data).toEqual([]);
    expect((await b.client.from("orbit_answers").select("question_id").eq("user_id", c.id)).data).toEqual([]);
  });

  it("keeps each balance equal to the sum of its ledger entries, and never negative", async () => {
    for (const u of [a, b, c, d, e, quiet]) expect(await balance(u)).toBe(await sumLedger(u));
    expect((await admin.from("orbit_balances").update({ balance: -1 }).eq("user_id", a.id)).error).not.toBeNull();
  });

  it("allows the ledger to leave with the member when an account is erased", async () => {
    const gone = await createUser("orb-gone");
    await rpc(gone, "orbit_claim_checkin", {});
    expect(await ledger(gone)).toHaveLength(1);
    expect((await admin.auth.admin.deleteUser(gone.id)).error).toBeNull();
    expect((await admin.from("orbit_ledger").select("id").eq("user_id", gone.id)).data).toEqual([]);
  });

  it("does not let anyone call the internal functions", async () => {
    for (const [fn, args] of [["_orbit_award", { p_user: a.id, p_kind: "checkin", p_amount: 100, p_key: "x-forge", p_source_type: "x", p_source_id: "y" }], ["_orbit_mark_day", { p_user: a.id, p_day: today(), p_kind: "post" }], ["orbit_finalize_due_seasons", {}]]) {
      expect((await rpc(a, fn, args)).error, fn).not.toBeNull();
      expect((await rpc(gadmin, fn, args)).error, fn).not.toBeNull();
    }
  });
});

describe("leaderboards", () => {
  let lb;
  beforeAll(async () => {
    lb = await Promise.all(["lb1", "lb2", "lb3", "lb4", "lb5"].map((n) => createUser(`orb-${n}`)));
    await admin.from("profiles").update({ college_id: GREENFIELD }).in("id", lb.map((u) => u.id));
    // scores this week: lb1 50, lb2 30, lb3 30 (reached later), lb4 10, lb5 40 but opted out
    await give(lb[0], 50);
    await give(lb[1], 30);
    await new Promise((r) => setTimeout(r, 15));
    await give(lb[2], 30);
    await give(lb[3], 10);
    await give(lb[4], 40);
    await admin.from("profiles").update({ orbits_on_leaderboard: false }).eq("id", lb[4].id);
    // lb1 and lb4 are connected; lb2 is not
    const [x, y] = [lb[0].id, lb[3].id].sort();
    await admin.from("connections").insert({ user_a: x, user_b: y });
    await give(outsider, 999); // another college, in the global ranking only
  });

  it("ranks globally by Orbits earned this week with deterministic tie-breaks, and leaves out opted-out members", async () => {
    const rows = (await rpc(lb[0], "orbit_leaderboard", { p_scope: "global", p_period: "weekly", p_limit: 50, p_offset: 0 })).data;
    const mine = rows.filter((r) => lb.some((u) => u.id === r.user_id)).map((r) => r.user_id);
    expect(mine).toEqual([lb[0].id, lb[1].id, lb[2].id, lb[3].id]); // 50, 30 (first), 30 (later), 10; lb5 opted out
    expect(rows[0].user_id).toBe(outsider.id);
    expect(rows[0].score).toBe(999);
    expect(rows.every((r) => r.in_progress)).toBe(true);
    expect(Object.keys(rows[0]).sort()).toEqual(["avatar_key", "full_name", "in_progress", "period_end", "period_start", "prev_rank", "rank", "score", "total", "user_id", "username"]);
    // the same query twice gives the same order
    const again = (await rpc(lb[0], "orbit_leaderboard", { p_scope: "global", p_period: "weekly", p_limit: 50, p_offset: 0 })).data;
    expect(again.map((r) => r.user_id)).toEqual(rows.map((r) => r.user_id));
  });

  it("limits the college board to the viewer's self-reported college", async () => {
    const rows = (await rpc(lb[0], "orbit_leaderboard", { p_scope: "college", p_period: "weekly", p_limit: 50, p_offset: 0 })).data;
    expect(rows.map((r) => r.user_id)).not.toContain(outsider.id);
    expect(rows.slice(0, 4).map((r) => r.user_id)).toEqual(expect.arrayContaining([lb[0].id, lb[1].id]));
    const out = (await rpc(outsider, "orbit_leaderboard", { p_scope: "college", p_period: "weekly", p_limit: 50, p_offset: 0 })).data;
    expect(out.map((r) => r.user_id)).toEqual([outsider.id]);
    await admin.from("profiles").update({ college_id: null }).eq("id", quiet.id);
    expect((await rpc(quiet, "orbit_leaderboard", { p_scope: "college", p_period: "weekly", p_limit: 50, p_offset: 0 })).data).toEqual([]);
    expect((await rpc(quiet, "orbit_my_rank", { p_scope: "college", p_period: "weekly" })).data[0]).toMatchObject({ rank: null, has_college: false });
    await admin.from("profiles").update({ college_id: GREENFIELD }).eq("id", quiet.id);
  });

  it("limits the connections board to accepted connections and oneself, and reveals no one else", async () => {
    const rows = (await rpc(lb[0], "orbit_leaderboard", { p_scope: "connections", p_period: "weekly", p_limit: 50, p_offset: 0 })).data;
    expect(rows.map((r) => r.user_id)).toEqual([lb[0].id, lb[3].id]);
    const stranger = (await rpc(lb[1], "orbit_leaderboard", { p_scope: "connections", p_period: "weekly", p_limit: 50, p_offset: 0 })).data;
    expect(stranger.map((r) => r.user_id)).toEqual([lb[1].id]);
  });

  it("reports the viewer's own rank and handles members with no Orbits and members who opted out", async () => {
    const me = (await rpc(lb[1], "orbit_my_rank", { p_scope: "global", p_period: "weekly" })).data[0];
    expect(me).toMatchObject({ score: 30, participating: true });
    expect(Number(me.rank)).toBeGreaterThan(1);
    const none = (await rpc(lb[4], "orbit_my_rank", { p_scope: "global", p_period: "weekly" })).data[0];
    expect(none).toMatchObject({ rank: null, participating: false });
    expect((await rpc(lb[0], "orbit_leaderboard", { p_scope: "galaxy", p_period: "weekly" })).error).not.toBeNull();
  });

  it("supports the monthly and all-time views and pagination, and shows movement against yesterday", async () => {
    for (const period of ["monthly", "alltime"]) {
      const rows = (await rpc(lb[0], "orbit_leaderboard", { p_scope: "global", p_period: period, p_limit: 2, p_offset: 0 })).data;
      expect(rows).toHaveLength(2);
      expect(Number(rows[0].rank)).toBe(1);
      const next = (await rpc(lb[0], "orbit_leaderboard", { p_scope: "global", p_period: period, p_limit: 2, p_offset: 2 })).data;
      expect(Number(next[0].rank)).toBe(3);
    }
    const alltime = (await rpc(lb[0], "orbit_leaderboard", { p_scope: "global", p_period: "alltime", p_limit: 50, p_offset: 0 })).data;
    expect(alltime.find((r) => r.user_id === lb[0].id).prev_rank).toBeNull(); // everything was earned today: no standing yet at yesterday's close
    expect((await rpc(lb[0], "orbit_leaderboard", { p_scope: "global", p_period: "weekly", p_limit: 5000 })).data.length).toBeLessThanOrEqual(50);
    expect((await anon().rpc("orbit_leaderboard", { p_scope: "global", p_period: "weekly" })).error).not.toBeNull();
  });

  it("hides a member whose profile the viewer may not see", async () => {
    await admin.from("profiles").update({ visibility: "connections" }).eq("id", lb[1].id);
    const rows = (await rpc(outsider, "orbit_leaderboard", { p_scope: "global", p_period: "weekly", p_limit: 50, p_offset: 0 })).data;
    expect(rows.map((r) => r.user_id)).not.toContain(lb[1].id);
    await admin.from("profiles").update({ visibility: "public" }).eq("id", lb[1].id);
  });
});

describe("profile privacy", () => {
  it("shows a profile's Orbits only as far as its owner allows, and nothing about a profile the viewer cannot see", async () => {
    await give(a, 7);
    const open = (await rpc(b, "orbit_profile_summary", { p_username: a.username })).data;
    expect(open.balance).toBeGreaterThan(0);
    expect(open.achievements.length).toBeGreaterThan(0);
    await admin.from("profiles").update({ orbits_show_balance: false, orbits_show_achievements: false }).eq("id", a.id);
    const hidden = (await rpc(b, "orbit_profile_summary", { p_username: a.username })).data;
    expect(hidden).toMatchObject({ balance: null, achievements: null, streak: null });
    const self = (await rpc(a, "orbit_profile_summary", { p_username: a.username })).data;
    expect(self.balance).toBeGreaterThan(0);
    await admin.from("profiles").update({ visibility: "connections" }).eq("id", a.id);
    expect((await rpc(outsider, "orbit_profile_summary", { p_username: a.username })).data).toBeNull();
    await admin.from("profiles").update({ visibility: "public", orbits_show_balance: true, orbits_show_achievements: true }).eq("id", a.id);
  });

  it("lets members change only their own privacy choices", async () => {
    expect((await b.client.from("profiles").update({ orbits_on_leaderboard: false }).eq("id", b.id)).error).toBeNull();
    expect((await admin.from("profiles").select("orbits_on_leaderboard").eq("id", b.id).single()).data.orbits_on_leaderboard).toBe(false);
    const other = await b.client.from("profiles").update({ orbits_on_leaderboard: false }).eq("id", c.id).select("id");
    expect(other.data ?? []).toEqual([]);
    await b.client.from("profiles").update({ orbits_on_leaderboard: true }).eq("id", b.id);
  });
});

describe("seasons and Orbit Elite badges", () => {
  const name = `T${tag}-season`;
  let season;
  let members;
  beforeAll(async () => {
    members = await Promise.all(["s1", "s2", "s3", "s4", "s5", "s6"].map((n) => createUser(`orb-${n}`)));
    await admin.from("profiles").update({ college_id: RIVERSIDE }).in("id", members.map((u) => u.id));
    await admin.from("orbit_config").update({ value: 3 }).eq("key", "min_group_size");
    await Promise.all(members.map((u, i) => give(u, 100 - i * 10, istDay(-60))));
    const [x, y] = [members[0].id, members[1].id].sort();
    const [x2, y2] = [members[0].id, members[2].id].sort();
    await admin.from("connections").insert([{ user_a: x, user_b: y }, { user_a: x2, user_b: y2 }]);
    const res = await rpc(gadmin, "orbit_admin_save_season", { p_id: null, p_name: name, p_from: istDay(-61), p_to: istDay(-50) });
    expect(res.error, JSON.stringify(res.error)).toBeNull();
    season = res.data;
  });
  afterAll(async () => {
    await admin.from("orbit_config").update({ value: 5 }).eq("key", "min_group_size");
  });

  it("is managed by global administrators only", async () => {
    expect((await rpc(cadmin, "orbit_admin_save_season", { p_id: null, p_name: "Nope", p_from: istDay(-5), p_to: istDay(-4) })).error?.message).toMatch(/forbidden/);
    expect((await rpc(a, "orbit_admin_finalize_season", { p_id: season })).error?.message).toMatch(/forbidden/);
    expect((await rpc(gadmin, "orbit_admin_save_season", { p_id: null, p_name: "Overlap", p_from: istDay(-55), p_to: istDay(-52) })).error?.message).toMatch(/season_overlap/);
  });

  it("will not finalise a season that is still running", async () => {
    const running = (await rpc(gadmin, "orbit_admin_save_season", { p_id: null, p_name: `T${tag}-running`, p_from: istDay(-1), p_to: istDay(5) })).data;
    expect((await rpc(gadmin, "orbit_admin_finalize_season", { p_id: running })).error?.message).toMatch(/season_not_ended/);
    await admin.from("orbit_seasons").delete().eq("id", running);
  });

  it("records the real top 10s from that season's ledger and awards each badge exactly once", async () => {
    const res = await rpc(gadmin, "orbit_admin_finalize_season", { p_id: season });
    expect(res.error, JSON.stringify(res.error)).toBeNull();
    const results = (await admin.from("orbit_season_results").select("*").eq("season_id", season)).data;
    const globalRows = results.filter((r) => r.scope === "global").sort((p, q) => p.rank - q.rank);
    expect(globalRows[0].user_id).toBe(members[0].id);
    expect(globalRows[0]).toMatchObject({ rank: 1, score: 100 });
    expect(globalRows.length).toBeLessThanOrEqual(10);
    const college = results.filter((r) => r.scope === "college" && r.scope_ref === RIVERSIDE);
    expect(college.length).toBeGreaterThanOrEqual(6);
    // member 1 has only one connection: a group of 2 is below the minimum, so no Connections badge is possible
    expect(results.find((r) => r.scope === "connections" && r.user_id === members[1].id)).toBeUndefined();
    expect(results.find((r) => r.scope === "connections" && r.user_id === members[0].id)).toMatchObject({ rank: 1, group_size: 3 });

    const badges = (await admin.from("orbit_user_achievements").select("*").eq("user_id", members[0].id).eq("season_id", season)).data;
    expect(badges.map((b) => b.achievement_id).sort()).toEqual(["rank_college_top10", "rank_connections_top10", "rank_global_top10", "season_champion"]);
    expect(badges.find((b) => b.achievement_id === "rank_global_top10")).toMatchObject({ rank: 1, score: 100, scope: "global", period: name });
    // finalising again awards nothing more
    expect((await rpc(gadmin, "orbit_admin_finalize_season", { p_id: season })).error?.message).toMatch(/already_finalized/);
    expect((await admin.from("orbit_user_achievements").select("id").eq("user_id", members[0].id).eq("season_id", season)).data).toHaveLength(4);
    expect((await admin.from("orbit_seasons").select("status").eq("id", season).single()).data.status).toBe("finalized");
  });

  it("does not hand a ranking badge to someone who is merely near the top today", async () => {
    const earned = (await admin.from("orbit_user_achievements").select("achievement_id").eq("user_id", lbTop())).data;
    expect(earned.map((x) => x.achievement_id).filter((x) => x.startsWith("rank_") || x === "season_champion")).toEqual([]);
    function lbTop() {
      return outsider.id; // 999 Orbits this week and the global leader, but no finalised season includes them
    }
  });
});

describe("administration of Orbits", () => {
  it("keeps every admin function away from members and college administrators", async () => {
    const calls = [
      ["orbit_admin_questions", {}], ["orbit_admin_config", {}], ["orbit_admin_achievements", {}], ["orbit_admin_ledger", {}], ["orbit_admin_suspicious", {}],
      ["orbit_admin_metrics", {}], ["orbit_admin_seasons", {}],
      ["orbit_admin_set_config", { p_key: "checkin", p_value: 500 }],
      ["orbit_admin_adjust", { p_user: a.id, p_amount: 500, p_reason: "free orbits", p_key: "abcdefghij" }],
      ["orbit_admin_update_achievement", { p_id: "streak_3", p_title: "X", p_description: "Y Y Y Y", p_bonus: 1000, p_active: true }],
      ["orbit_admin_save_question", { p_id: null, p_question: "Is this allowed for members?", p_options: ["a", "b", "c", "d"], p_correct: 0, p_explanation: "It should not be.", p_category: "general", p_date: istDay(40), p_status: "draft" }],
    ];
    for (const who of [a, cadmin]) for (const [fn, args] of calls) expect((await rpc(who, fn, args)).error?.message, `${fn} as ${who.username}`).toMatch(/forbidden/);
    for (const [fn, args] of calls) expect((await anon().rpc(fn, args)).error, fn).not.toBeNull();
    expect((await admin.from("orbit_config").select("value").eq("key", "checkin").single()).data.value).toBe(5);
  });

  it("validates and freezes questions, and writes the audit trail", async () => {
    const save = (over = {}) => rpc(gadmin, "orbit_admin_save_question", { p_id: null, p_question: "What does CPU stand for in computing?", p_options: ["Central Processing Unit", "Computer Personal Unit", "Central Process Utility", "Core Program Unit"], p_correct: 0, p_explanation: "CPU means Central Processing Unit.", p_category: "technology", p_date: istDay(45), p_status: "draft", ...over });
    for (const [over, msg] of [[{ p_options: ["a", "a", "b", "c"] }, /duplicate_options/], [{ p_options: ["a", "b", "c"] }, /invalid_options/], [{ p_correct: 4 }, /invalid_correct/], [{ p_status: "live" }, /invalid_status/], [{ p_status: "scheduled", p_date: istDay(-3) }, /date_in_past/]]) {
      expect((await save(over)).error?.message, JSON.stringify(over)).toMatch(msg);
    }
    const ok = await save();
    expect(ok.error).toBeNull();
    questionIds.push(ok.data);
    expect((await save({ p_id: ok.data, p_status: "scheduled", p_date: istDay(46) })).error).toBeNull();
    expect((await save({ p_date: istDay(46), p_status: "scheduled" })).error?.message).toMatch(/date_taken/);
    const listed = (await rpc(gadmin, "orbit_admin_questions", { p_status: "scheduled" })).data;
    expect(listed.find((q) => q.id === ok.data)).toMatchObject({ correct_index: 0, answers: 0 });
    // once answered, the wording and the key are frozen
    const live = await makeQuestion({ date: istDay(-8), status: "published" });
    await admin.from("orbit_answers").insert({ user_id: a.id, question_id: live, selected: 0, is_correct: false });
    expect((await rpc(gadmin, "orbit_admin_save_question", { p_id: live, p_question: "A different question now?", p_options: ["Alpha", "Bravo", "Charlie", "Delta"], p_correct: 1, p_explanation: "Bravo is right because the test says so.", p_category: "general", p_date: istDay(-8), p_status: "published" })).error?.message).toMatch(/has_answers/);
    const audit = (await admin.from("audit_logs").select("action").eq("target_id", ok.data)).data.map((r) => r.action);
    expect(audit).toContain("orbits.question_saved");
  });

  it("changes reward values within bounds, and the next reward uses them", async () => {
    expect((await rpc(gadmin, "orbit_admin_set_config", { p_key: "checkin", p_value: 100000 })).error?.message).toMatch(/invalid_value/);
    expect((await rpc(gadmin, "orbit_admin_set_config", { p_key: "checkin", p_value: "lots" })).error?.message).toMatch(/invalid_value/);
    expect((await rpc(gadmin, "orbit_admin_set_config", { p_key: "no_such_key", p_value: 5 })).error?.message).toMatch(/unknown_setting/);
    expect((await rpc(gadmin, "orbit_admin_set_config", { p_key: "streak_bonus", p_value: { 3: 5, x: 1 } })).error?.message).toMatch(/invalid_value/);
    expect((await rpc(gadmin, "orbit_admin_set_config", { p_key: "checkin", p_value: 8 })).error).toBeNull();
    const fresh = await createUser("orb-cfg");
    expect((await rpc(fresh, "orbit_claim_checkin", {})).data.amount).toBe(8);
    expect((await rpc(gadmin, "orbit_admin_set_config", { p_key: "checkin", p_value: 5 })).error).toBeNull();
    const audit = (await admin.from("audit_logs").select("metadata").eq("action", "orbits.config_changed").eq("target_id", "checkin").order("created_at", { ascending: false })).data;
    expect(audit[0].metadata).toMatchObject({ from: 8, to: 5 });
  });

  it("corrects balances only with a reason and an idempotency key, by compensating entries, and logs it", async () => {
    const target = await createUser("orb-adj");
    await give(target, 20);
    const args = (over = {}) => ({ p_user: target.id, p_amount: 15, p_reason: "Contest prize agreed with the organiser", p_key: `adj-${tag}-1`, ...over });
    expect((await rpc(gadmin, "orbit_admin_adjust", args({ p_reason: " " }))).error?.message).toMatch(/reason_required/);
    expect((await rpc(gadmin, "orbit_admin_adjust", args({ p_amount: 5000 }))).error?.message).toMatch(/invalid_amount/);
    const first = await rpc(gadmin, "orbit_admin_adjust", args());
    expect(first.data).toMatchObject({ applied: true, amount: 15, balance: 35 });
    expect((await rpc(gadmin, "orbit_admin_adjust", args())).data).toMatchObject({ applied: false, balance: 35 }); // a retry
    expect((await rpc(gadmin, "orbit_admin_adjust", args({ p_amount: -500, p_key: `adj-${tag}-2` }))).data).toMatchObject({ amount: -35, balance: 0 }); // never below zero
    expect((await rpc(gadmin, "orbit_admin_adjust", args({ p_amount: -5, p_key: `adj-${tag}-3` }))).error?.message).toMatch(/nothing_to_remove/);
    const entry = (await ledger(target, "manual_adjustment")).find((r) => r.amount === 15);
    expect(entry).toMatchObject({ created_by: gadmin.id, reason: expect.stringContaining("Contest prize") });
    const audit = (await admin.from("audit_logs").select("action, actor_id").eq("target_id", target.id)).data;
    expect(audit.filter((x) => x.action === "orbits.manual_adjustment" && x.actor_id === gadmin.id)).toHaveLength(2);
  });

  it("reverses a reward once with a compensating entry and lists suspicious earning", async () => {
    const target = await createUser("orb-rev");
    await rpc(target, "orbit_claim_checkin", {});
    const entry = (await ledger(target, "checkin"))[0];
    expect((await rpc(gadmin, "orbit_admin_reverse", { p_entry: entry.id, p_reason: "x" })).error?.message).toMatch(/reason_required/);
    const res = await rpc(gadmin, "orbit_admin_reverse", { p_entry: entry.id, p_reason: "Confirmed abuse of the daily bonus" });
    expect(res.data).toMatchObject({ amount: -5, balance: 0 });
    expect((await rpc(gadmin, "orbit_admin_reverse", { p_entry: entry.id, p_reason: "Trying again" })).error?.message).toMatch(/already_reversed/);
    expect((await ledger(target, "reversal"))[0]).toMatchObject({ reverses_id: entry.id, amount: -5 });
    await give(target, 150);
    const rows = (await rpc(gadmin, "orbit_admin_suspicious", { p_days: 7 })).data;
    expect(rows.find((r) => r.user_id === target.id)).toMatchObject({ flagged: true });
    const ledgerPage = (await rpc(gadmin, "orbit_admin_ledger", { p_user: target.id })).data;
    expect(ledgerPage.find((r) => r.id === entry.id).reversed).toBe(true);
  });

  it("reports real measurements and lets staff manage achievement definitions", async () => {
    const m = (await rpc(gadmin, "orbit_admin_metrics", { p_days: 30 })).data;
    expect(m.checkins).toBeGreaterThan(0);
    expect(m.challenge_answers).toBeGreaterThan(0);
    expect(m.daily.length).toBe(30);
    expect(m.returned_7d).toHaveProperty("cohort");
    expect((await rpc(gadmin, "orbit_admin_update_achievement", { p_id: "streak_3", p_title: "Three in a row", p_description: "Contributed three days in a row.", p_bonus: 5000, p_active: true })).error).not.toBeNull();
    expect((await rpc(gadmin, "orbit_admin_update_achievement", { p_id: "streak_3", p_title: "Three in a row", p_description: "Contributed three days in a row.", p_bonus: 0, p_active: true })).error).toBeNull();
    await rpc(gadmin, "orbit_admin_update_achievement", { p_id: "streak_3", p_title: "3-Day Orbit Streak", p_description: "Contributed three days in a row.", p_bonus: 0, p_active: true });
  });
});

describe("achievements for the member", () => {
  it("shows earned and locked badges separately, with real dates and no invented progress", async () => {
    const all = (await rpc(a, "orbit_my_achievements", {})).data;
    const byId = Object.fromEntries(all.map((x) => [x.id, x]));
    expect(byId.streak_3.earned).toHaveLength(1);
    expect(byId.streak_3.earned[0].earned_at).toBeTruthy();
    expect(byId.streak_365.earned).toEqual([]);
    expect(byId.rank_global_top10.earned).toEqual([]);
    expect(all.length).toBeGreaterThanOrEqual(24);
  });

  it("points at the real next milestone in the overview", async () => {
    const o = (await rpc(d, "orbit_overview", {})).data;
    expect(o.next_achievement).toMatchObject({ target: expect.any(Number) });
    expect(o.next_achievement.progress).toBeLessThan(o.next_achievement.target);
    expect(o.week_days).toHaveLength(7);
    expect(o.recent.length).toBeGreaterThan(0);
  });
});

describe("the at-a-glance read and once-only celebrations (migration 20260126000033)", () => {
  it("reports the member's own numbers, from the same tables the Orbits page reads", async () => {
    const u = await createUser("orb-glance");
    const fresh = (await rpc(u, "orbit_glance", {})).data;
    expect(fresh).toMatchObject({ balance: 0, pending: 0, checkin: { claimed_today: false, reward: 5 }, streak: { current: 0, contributed_today: false } });
    expect(typeof fresh.at).toBe("number");

    await rpc(u, "orbit_claim_checkin", {});
    const g = (await rpc(u, "orbit_glance", {})).data;
    const overview = (await rpc(u, "orbit_overview", {})).data;
    expect(g.balance).toBe(5);
    expect(g.balance).toBe(overview.balance);
    expect(g.checkin.claimed_today).toBe(true);
    expect(g.streak).toEqual({ current: overview.streak.current, best: overview.streak.best, contributed_today: overview.streak.contributed_today, next_milestone: overview.streak.next_milestone, next_bonus: overview.streak.next_bonus });
    expect(g.at).toBeGreaterThanOrEqual(fresh.at);
  });

  it("tells whether today's challenge is open and answered, and never shows another member's state", async () => {
    await admin.from("orbit_questions").delete().gte("publish_date", istDay(-10));
    const q = await makeQuestion();
    const u = await createUser("orb-glance-q");
    const other = await createUser("orb-glance-q2");
    expect((await rpc(u, "orbit_glance", {})).data.challenge).toMatchObject({ answered: false, fallback: false, reward: 10 });
    await rpc(u, "orbit_submit_answer", { p_question: q, p_selected: 1 });
    expect((await rpc(u, "orbit_glance", {})).data.challenge.answered).toBe(true);
    expect((await rpc(other, "orbit_glance", {})).data.challenge.answered).toBe(false);
  });

  it("counts unseen badges, hands each over exactly once even in parallel, and marks them seen", async () => {
    const u = await createUser("orb-celebrate");
    expect((await rpc(u, "orbit_glance", {})).data.pending).toBe(0);
    const ach = (await admin.from("orbit_achievements").select("id, title, description").eq("active", true).limit(2)).data;
    await admin.from("orbit_user_achievements").insert(ach.map((x) => ({ user_id: u.id, achievement_id: x.id })));
    expect((await rpc(u, "orbit_glance", {})).data.pending).toBe(2);

    // two tabs asking at the same moment: between them, every badge appears once
    const [r1, r2] = await Promise.all([rpc(u, "orbit_take_celebrations", {}), rpc(u, "orbit_take_celebrations", {})]);
    const all = [...r1.data, ...r2.data];
    expect(all).toHaveLength(2);
    expect(new Set(all.map((x) => x.achievement_id))).toEqual(new Set(ach.map((x) => x.id)));
    expect(all[0]).toEqual(expect.objectContaining({ title: expect.any(String), description: expect.any(String), icon: expect.any(String), bonus: expect.any(Number) }));
    expect((await rpc(u, "orbit_glance", {})).data.pending).toBe(0);
    expect((await rpc(u, "orbit_take_celebrations", {})).data).toEqual([]);
  });

  it("does not celebrate old badges, and never takes another member's", async () => {
    const mine = await createUser("orb-celebrate-me");
    const theirs = await createUser("orb-celebrate-them");
    const ach = (await admin.from("orbit_achievements").select("id").eq("active", true).limit(1).single()).data;
    await admin.from("orbit_user_achievements").insert({ user_id: theirs.id, achievement_id: ach.id });
    expect((await rpc(mine, "orbit_take_celebrations", {})).data).toEqual([]);
    expect((await rpc(theirs, "orbit_glance", {})).data.pending).toBe(1); // still theirs to see
    // rows from before the migration were marked seen: nothing in the table that was earned earlier is waiting
    const old = (await admin.from("orbit_user_achievements").select("id").is("celebrated_at", null).lt("earned_at", new Date(Date.now() - 3_600_000).toISOString())).data;
    expect(old).toEqual([]);
  });

  it("is closed to anonymous callers, and a member cannot rewrite the seen marker through the API", async () => {
    expect((await anon().rpc("orbit_glance", {})).error).not.toBeNull();
    expect((await anon().rpc("orbit_take_celebrations", {})).error).not.toBeNull();
    const u = await createUser("orb-celebrate-api");
    const ach = (await admin.from("orbit_achievements").select("id").eq("active", true).limit(1).single()).data;
    await admin.from("orbit_user_achievements").insert({ user_id: u.id, achievement_id: ach.id });
    const res = await u.client.from("orbit_user_achievements").update({ celebrated_at: new Date().toISOString() }).eq("user_id", u.id).select();
    expect(res.data ?? []).toEqual([]);
    expect((await rpc(u, "orbit_glance", {})).data.pending).toBe(1);
  });
});

describe("what counts as earned (migration 20260126000034)", () => {
  it("keeps staff corrections out of earned today, the week, the bars, the badge progress and the leaderboard", async () => {
    const u = await createUser("orb-earned");
    await rpc(u, "orbit_claim_checkin", {}); // +5, a real reward
    const adj = await rpc(gadmin, "orbit_admin_adjust", { p_user: u.id, p_amount: 1000, p_reason: "testing the correction", p_key: `earned-${tag}-1` });
    expect(adj.error).toBeNull();

    const o = (await rpc(u, "orbit_overview", {})).data;
    expect(o.balance).toBe(1005); // the balance is everything the ledger says
    expect(o.earned_today).toBe(5); // earned is only what the member did
    expect(o.earned_week).toBe(5);
    expect(o.week_days.at(-1).earned).toBe(5);
    expect(o.earned_today).toBeLessThanOrEqual(o.earned_week);
    const progress = o.next_achievement;
    if (progress?.target >= 1000) expect(progress.progress).toBeLessThan(1000); // a correction is not progress toward "1,000 Orbits earned"
    expect((await admin.from("orbit_balances").select("balance, earned_total").eq("user_id", u.id).single()).data).toEqual({ balance: 1005, earned_total: 5 });

    expect((await rpc(u, "orbit_my_rank", { p_scope: "global", p_period: "weekly" })).data[0].score).toBe(5);
    expect((await rpc(u, "orbit_my_rank", { p_scope: "global", p_period: "alltime" })).data[0].score).toBe(5);
    expect((await ledger(u)).map((r) => r.earned_amount).sort((x, y) => x - y)).toEqual([0, 5]);
    expect((await rpc(u, "orbit_glance", {})).data.balance).toBe(1005);
  });

  it("does not subtract earned Orbits when a correction is taken back, and does subtract when a reward is", async () => {
    const u = await createUser("orb-earned-rev");
    await rpc(u, "orbit_claim_checkin", {});
    await rpc(gadmin, "orbit_admin_adjust", { p_user: u.id, p_amount: 50, p_reason: "first correction", p_key: `earned-${tag}-2` });
    const rows = await ledger(u);
    const correction = rows.find((r) => r.kind === "manual_adjustment");
    const reward = rows.find((r) => r.kind === "checkin");

    expect((await rpc(gadmin, "orbit_admin_reverse", { p_entry: correction.id, p_reason: "taking the correction back" })).error).toBeNull();
    let b = (await admin.from("orbit_balances").select("balance, earned_total").eq("user_id", u.id).single()).data;
    expect(b).toEqual({ balance: 5, earned_total: 5 }); // the reward is untouched

    expect((await rpc(gadmin, "orbit_admin_reverse", { p_entry: reward.id, p_reason: "reward was not deserved" })).error).toBeNull();
    b = (await admin.from("orbit_balances").select("balance, earned_total").eq("user_id", u.id).single()).data;
    expect(b).toEqual({ balance: 0, earned_total: 0 });
    expect((await rpc(u, "orbit_overview", {})).data.earned_today).toBe(0);
  });

  it("does not award an 'Orbits earned' badge for Orbits that were only added by staff", async () => {
    const u = await createUser("orb-earned-badge");
    await rpc(gadmin, "orbit_admin_adjust", { p_user: u.id, p_amount: 1000, p_reason: "large correction", p_key: `earned-${tag}-3` });
    await rpc(u, "orbit_claim_checkin", {});
    const earnedBadges = (await admin.from("orbit_user_achievements").select("achievement_id, orbit_achievements!inner(criteria)").eq("user_id", u.id).eq("orbit_achievements.criteria->>type", "earned")).data;
    expect(earnedBadges).toEqual([]);
  });
});

describe("badge pictures (migration 20260127000035)", () => {
  const keyFor = (owner) => `orbit_badge/${owner.id}/${crypto.randomUUID()}.png`;
  const fileRow = (owner, key, extra = {}) => ({ owner_id: owner.id, bucket: "public", storage_key: key, purpose: "orbit_badge", mime_type: "image/png", size_bytes: 1234, original_name: "badge.png", ...extra });
  let badgeId;
  const made = [];

  beforeAll(async () => {
    badgeId = (await admin.from("orbit_achievements").select("id").eq("active", true).neq("category", "ranking").limit(1).single()).data.id;
  });
  afterAll(async () => {
    await admin.from("orbit_achievements").update({ image_key: null }).eq("id", badgeId);
    if (made.length) await admin.from("files").delete().in("storage_key", made);
  });

  it("lets only a manager of Orbits create a badge picture record, and anyone signed in see it once it is ready", async () => {
    const key = keyFor(gadmin);
    made.push(key);
    const asMember = await a.client.from("files").insert(fileRow(a, keyFor(a)));
    expect(asMember.error).not.toBeNull(); // a member cannot create an orbit_badge file
    const asCollegeAdmin = await cadmin.client.from("files").insert(fileRow(cadmin, keyFor(cadmin)));
    expect(asCollegeAdmin.error).not.toBeNull();
    const mine = await gadmin.client.from("files").insert(fileRow(gadmin, key)).select("id").single();
    expect(mine.error).toBeNull();
    expect((await a.client.from("files").select("id").eq("storage_key", key)).data).toEqual([]); // still pending: private to its owner
    await admin.from("files").update({ status: "ready", ready_at: new Date().toISOString() }).eq("storage_key", key);
    expect((await a.client.from("files").select("id").eq("storage_key", key)).data).toHaveLength(1);
  });

  it("attaches only a ready badge upload, only for managers, audits it, and clears back to the built-in artwork", async () => {
    const ready = keyFor(gadmin);
    const pending = keyFor(gadmin);
    made.push(ready, pending);
    const ins = await admin.from("files").insert([fileRow(gadmin, ready, { status: "ready", ready_at: new Date().toISOString() }), fileRow(gadmin, pending, { status: "pending", ready_at: null })]);
    expect(ins.error).toBeNull();
    const wrongPurpose = `avatar/${gadmin.id}/${crypto.randomUUID()}.png`;
    made.push(wrongPurpose);
    await admin.from("files").insert(fileRow(gadmin, wrongPurpose, { purpose: "avatar", status: "ready", ready_at: new Date().toISOString() }));

    for (const bad of [pending, wrongPurpose, "orbit_badge/not-a-real-key.png", "../../etc/passwd"]) {
      expect((await rpc(gadmin, "orbit_admin_set_achievement_image", { p_id: badgeId, p_key: bad })).error, bad).not.toBeNull();
    }
    expect((await rpc(a, "orbit_admin_set_achievement_image", { p_id: badgeId, p_key: ready })).error).not.toBeNull();
    expect((await rpc(cadmin, "orbit_admin_set_achievement_image", { p_id: badgeId, p_key: ready })).error).not.toBeNull();
    expect((await rpc(gadmin, "orbit_admin_set_achievement_image", { p_id: "no_such_badge", p_key: ready })).error).not.toBeNull();

    const set = await rpc(gadmin, "orbit_admin_set_achievement_image", { p_id: badgeId, p_key: ready });
    expect(set.error).toBeNull();
    expect(set.data).toEqual({ previous: null, image_key: ready });
    const cleared = await rpc(gadmin, "orbit_admin_set_achievement_image", { p_id: badgeId, p_key: null });
    expect(cleared.data).toEqual({ previous: ready, image_key: null });
    const audit = (await admin.from("audit_logs").select("action, metadata").eq("actor_id", gadmin.id).eq("action", "orbits.badge_image")).data;
    expect(audit.length).toBeGreaterThanOrEqual(2);
  });

  it("returns the picture with the badge in every member-facing read", async () => {
    const key = keyFor(gadmin);
    made.push(key);
    await admin.from("files").insert(fileRow(gadmin, key, { status: "ready", ready_at: new Date().toISOString() }));
    await rpc(gadmin, "orbit_admin_set_achievement_image", { p_id: badgeId, p_key: key });
    const viewer = await createUser("orb-badge-img");
    await admin.from("orbit_user_achievements").insert({ user_id: viewer.id, achievement_id: badgeId });

    const mine = (await rpc(viewer, "orbit_my_achievements", {})).data.find((x) => x.id === badgeId);
    expect(mine.image_key).toBe(key);
    const profile = (await rpc(a, "orbit_profile_summary", { p_username: viewer.username })).data;
    expect(profile.achievements.find((x) => x.id === badgeId)?.image_key ?? key).toBe(key);
    const taken = (await rpc(viewer, "orbit_take_celebrations", {})).data.find((x) => x.achievement_id === badgeId);
    expect(taken.image_key).toBe(key);
    // a badge with no picture reports null, so the built-in artwork is used
    await rpc(gadmin, "orbit_admin_set_achievement_image", { p_id: badgeId, p_key: null });
    expect((await rpc(viewer, "orbit_my_achievements", {})).data.find((x) => x.id === badgeId).image_key).toBeNull();
  });
});
