import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, anon, cleanupUsers, createUser } from "../helpers/supabase.js";

/**
 * Daily Challenge automation (migration 20260128000036). The schedule is tested by passing the moment to the functions
 * (`p_now`); dates are far in the future so no real question is touched. All times below are IST (UTC+5:30).
 */
const DAY = "2031-03-11";
const PREV = "2031-03-10";
const at = (date, hhmm) => new Date(`${date}T${hhmm}:00+05:30`).toISOString();
const claim = (when) => admin.rpc("orbit_auto_draft_claim", { p_now: when });
const publishDue = (when) => admin.rpc("orbit_auto_publish_due", { p_now: when });
const options = ["Alpha", "Bravo", "Charlie", "Delta"];
const save = (day = DAY, extra = {}) => admin.rpc("orbit_auto_draft_save", { p_day: day, p_question: "Which option is right for this test?", p_options: options, p_correct: 1, p_explanation: "Bravo is right because the test says so.", p_category: "science", ...extra });
const questionOn = async (day = DAY) => (await admin.from("orbit_questions").select("*").eq("publish_date", day)).data;
const setSwitch = (key, value) => admin.from("orbit_config").update({ value }).eq("key", key);

async function clean() {
  await admin.from("orbit_questions").delete().in("publish_date", [PREV, DAY]);
  await admin.from("orbit_question_automation").delete().in("day", [PREV, DAY]);
}
beforeAll(clean);
afterAll(async () => {
  await clean();
  await setSwitch("auto_question_draft", 1);
  await setSwitch("auto_question_publish", 1);
  await cleanupUsers();
});

describe("drafting tomorrow's question", () => {
  it("is not due before 16:00 or between 02:00 and 16:00", async () => {
    for (const t of [at(PREV, "15:59"), at(PREV, "10:00"), at(DAY, "02:00"), at(DAY, "09:00")]) expect((await claim(t)).data).toBeNull();
  });

  it("is due from 16:00, once per half hour, and at most 8 times", async () => {
    expect((await claim(at(PREV, "16:00"))).data).toBe(DAY);
    expect((await claim(at(PREV, "16:05"))).data).toBeNull(); // a second worker in the same half hour
    expect((await claim(at(PREV, "16:30"))).data).toBe(DAY);
    for (let i = 0; i < 6; i++) expect((await claim(at(PREV, `${17 + i}:${i % 2 ? "00" : "01"}`))).data).toBe(DAY);
    const row = (await admin.from("orbit_question_automation").select("attempts").eq("day", DAY).single()).data;
    expect(row.attempts).toBe(8);
    expect((await claim(at(DAY, "00:50"))).data).toBeNull(); // the cap holds
  });

  it("targets the same day again in the last two hours before the publish time", async () => {
    await admin.from("orbit_question_automation").delete().eq("day", DAY);
    expect((await claim(at(DAY, "00:30"))).data).toBe(DAY);
  });

  it("does nothing when the day already has a question, even an archived one", async () => {
    await admin.from("orbit_question_automation").delete().eq("day", DAY);
    await admin.from("orbit_questions").insert({ question: "An archived one for the test?", options, correct_index: 0, explanation: "Archived on purpose here.", category: "general", publish_date: DAY, status: "archived" });
    expect((await claim(at(PREV, "16:00"))).data).toBeNull();
    await clean();
  });

  it("does nothing when the switch is off", async () => {
    await setSwitch("auto_question_draft", 0);
    expect((await claim(at(PREV, "16:00"))).data).toBeNull();
    await setSwitch("auto_question_draft", 1);
  });
});

describe("saving the draft", () => {
  it("stores an AI draft with nobody recorded as author or reviewer", async () => {
    const { data: id, error } = await save();
    expect(error).toBeNull();
    const [q] = await questionOn();
    expect(q).toMatchObject({ id, status: "draft", source: "ai_draft", created_by: null, reviewed_by: null, reviewed_at: null, correct_index: 1 });
  });

  it("refuses a second question for the same day and bad content", async () => {
    expect((await save()).data).toBeNull();
    await clean();
    expect((await save(DAY, { p_options: ["Same", "same", "C", "D"] })).error?.message).toMatch(/duplicate_options/);
    expect((await save(DAY, { p_correct: 4 })).error?.message).toMatch(/invalid_correct/);
    expect((await save(DAY, { p_options: ["a", "b", "c"] })).error?.message).toMatch(/invalid_options/);
    expect(await questionOn()).toHaveLength(0);
  });
});

describe("publishing an unapproved AI draft at 02:00", () => {
  it("waits for 02:00 and then publishes only the AI draft", async () => {
    await save();
    expect((await publishDue(at(DAY, "01:59"))).data).toBe(0);
    expect((await questionOn())[0].status).toBe("draft");
    expect((await publishDue(at(DAY, "02:00"))).data).toBe(1);
    const [q] = await questionOn();
    expect(q).toMatchObject({ status: "published", reviewed_by: null, reviewed_at: null });
    expect((await publishDue(at(DAY, "02:01"))).data).toBe(0); // already live
    const log = await admin.from("audit_logs").select("action").eq("target_id", q.id).eq("action", "orbits.question_auto_published");
    expect(log.data).toHaveLength(1);
    await clean();
  });

  it("leaves a draft an administrator wrote alone", async () => {
    await admin.from("orbit_questions").insert({ question: "A manual draft for the test?", options, correct_index: 0, explanation: "Written by a person here.", category: "general", publish_date: DAY, status: "draft", source: "manual" });
    expect((await publishDue(at(DAY, "06:00"))).data).toBe(0);
    await clean();
  });

  it("does not replace an approved question, and does not publish an archived draft", async () => {
    await admin.from("orbit_questions").insert({ question: "An approved one for the test?", options, correct_index: 0, explanation: "Approved by hand here.", category: "general", publish_date: DAY, status: "scheduled" });
    expect((await publishDue(at(DAY, "06:00"))).data).toBe(0);
    await clean();
    await admin.from("orbit_questions").insert({ question: "A rejected AI draft for the test?", options, correct_index: 0, explanation: "Archived by an admin here.", category: "general", publish_date: DAY, status: "archived", source: "ai_draft" });
    expect((await publishDue(at(DAY, "06:00"))).data).toBe(0);
    await clean();
  });

  it("does nothing when the switch is off", async () => {
    await save();
    await setSwitch("auto_question_publish", 0);
    expect((await publishDue(at(DAY, "06:00"))).data).toBe(0);
    await setSwitch("auto_question_publish", 1);
    expect((await publishDue(at(DAY, "06:00"))).data).toBe(1);
    await clean();
  });
});

describe("access", () => {
  it("is closed to the API roles", async () => {
    const member = await createUser("auto-q");
    for (const client of [anon(), member.client]) {
      expect((await client.rpc("orbit_auto_publish_due", {})).error).not.toBeNull();
      expect((await client.rpc("orbit_auto_draft_claim", {})).error).not.toBeNull();
      expect((await client.rpc("orbit_auto_draft_save", { p_day: DAY, p_question: "x".repeat(12), p_options: options, p_correct: 0, p_explanation: "x".repeat(12), p_category: "general" })).error).not.toBeNull();
    }
    expect(await questionOn()).toHaveLength(0);
  });
});
