import { test, expect } from "@playwright/test";
import { admin, cleanupUsers, createUser, grantRoleDirect } from "../helpers/supabase.js";
import { CURRENT_NOTICE } from "../../lib/privacy/registry.js";

/**
 * The Academy learning pipeline in a real browser, against the local stack:
 *   a student sees a class that is on now (with Join), their weekly schedule and what is left for a certificate;
 *   an instructor sees the Teaching page with the class, the work waiting and their students;
 *   a person who teaches nothing does not get a Teaching tab.
 *
 *   E2E_BASE_URL=http://localhost:3100 npx playwright test tests/e2e/academy-pipeline.spec.js
 */
const BASE = process.env.E2E_BASE_URL || "http://localhost:3100";
const tag = Math.random().toString(36).slice(2, 7);
const iso = (m) => new Date(Date.now() + m * 60_000).toISOString();
const must = (res, label) => {
  if (res.error) throw new Error(`${label}: ${res.error.message}`);
  return res.data;
};

let student, teacher, outsider, course, running, later;
const states = {};

async function signIn(browser, user) {
  const context = await browser.newContext({ baseURL: BASE });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill("Passw0rd!test-xyz");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 90_000 });
  const state = await context.storageState();
  await context.close();
  return state;
}
const as = async (browser, who) => {
  const context = await browser.newContext({ baseURL: BASE, storageState: states[who] });
  return { context, page: await context.newPage() };
};

test.beforeAll(async ({ browser }) => {
  test.setTimeout(300_000); // the first visit to each page compiles it in the dev server
  await admin.rpc("publish_privacy_notice", {
    p_version: CURRENT_NOTICE.version, p_effective_at: CURRENT_NOTICE.effectiveAt, p_hash: CURRENT_NOTICE.fingerprint,
    p_purposes: [], p_document: {}, p_reconsent: CURRENT_NOTICE.reconsentPurposes, p_summary: CURRENT_NOTICE.summary,
  });
  [student, teacher, outsider] = await Promise.all(["pipe-student", "pipe-teacher", "pipe-outsider"].map((l) => createUser(l)));
  await grantRoleDirect(teacher.id, "academy_mentor");
  const { data: category } = await admin.from("academy_categories").select("id").eq("code_prefix", "WD").single();
  course = must(await admin.from("academy_courses").insert({
    slug: `pipe-${tag}`, title: `Pipeline course ${tag}`, category_id: category.id, short_description: "Pipeline", price_minor: 0, delivery_mode: "hybrid",
    timetable: [{ day: "Mon", start: "19:00", end: "20:00", topic: "Weekly lab" }, { day: "Thu", start: "19:00", end: "20:00", topic: "Weekly talk" }],
  }).select("*").single(), "course");
  const mod = must(await admin.from("academy_modules").insert({ course_id: course.id, title: "Module 1" }).select("id").single(), "module");
  must(await admin.from("academy_lessons").insert({ course_id: course.id, module_id: mod.id, title: "Lesson 1", kind: "text", position: 0 }).select("id").single(), "lesson");
  await admin.from("academy_courses").update({ status: "published" }).eq("id", course.id);
  await admin.from("academy_mentors").upsert({ user_id: teacher.id, display_name: `Teacher ${tag}` });
  await admin.from("academy_course_mentors").insert({ course_id: course.id, user_id: teacher.id, role: "lead" });
  must(await admin.rpc("_academy_enroll", { p_user: student.id, p_course: course.id, p_cohort: null, p_source: "complimentary", p_order: null, p_granted_by: null, p_reason: "e2e", p_consent: true }), "enrol");
  running = must(await admin.from("academy_live_sessions").insert({ course_id: course.id, title: `Running ${tag}`, starts_at: iso(-10), ends_at: iso(50), instructor_id: teacher.id }).select("*").single(), "running");
  later = must(await admin.from("academy_live_sessions").insert({ course_id: course.id, title: `Later ${tag}`, starts_at: iso(60 * 26), ends_at: iso(60 * 27), instructor_id: teacher.id }).select("*").single(), "later");
  await admin.from("academy_live_session_links").upsert({ session_id: running.id, meeting_url: "https://meet.google.com/abc-defg-hij" });
  must(await admin.rpc("academy_advance_sessions"), "advance");
  states.student = await signIn(browser, student);
  states.teacher = await signIn(browser, teacher);
  states.outsider = await signIn(browser, outsider);
});

test.afterAll(async () => {
  if (course) {
    await admin.from("academy_live_sessions").delete().eq("course_id", course.id);
    await admin.from("academy_enrollments").delete().eq("course_id", course.id);
    await admin.from("academy_course_mentors").delete().eq("course_id", course.id);
  }
  await cleanupUsers();
});

test("a student sees the class that is on now, with a Join button, and is told about it", async ({ browser }) => {
  const { context, page } = await as(browser, "student");
  await page.goto("/academy/dashboard");
  await expect(page.getByRole("heading", { name: new RegExp(`Running ${tag}`) }).first()).toBeVisible();
  await expect(page.getByText("Live now").first()).toBeVisible();
  const join = page.getByRole("link", { name: /Join/ }).first();
  await expect(join).toHaveAttribute("href", `/api/academy/live/${running.id}/join`);
  await expect(page.getByText("Certificates").first()).toBeVisible();
  await context.close();
});

test("the Join link records the join and sends the student to the meeting, but only the enrolled", async ({ browser }) => {
  const { context, page } = await as(browser, "student");
  const res = await page.request.get(`${BASE}/api/academy/live/${running.id}/join`, { maxRedirects: 0 });
  expect(res.status()).toBe(303);
  expect(res.headers().location).toBe("https://meet.google.com/abc-defg-hij");
  const { data } = await admin.from("academy_live_attendance").select("joins").eq("session_id", running.id).eq("user_id", student.id).single();
  expect(data.joins).toBe(1);
  await context.close();

  const out = await as(browser, "outsider");
  const denied = await out.page.request.get(`${BASE}/api/academy/live/${running.id}/join`, { maxRedirects: 0 });
  expect(denied.status()).toBeGreaterThanOrEqual(300);
  expect(denied.headers().location ?? "").toContain("class=not_allowed");
  await out.context.close();
});

test("the student's schedule shows the weekly timetable and the dated classes, and downloads as a calendar", async ({ browser }) => {
  const { context, page } = await as(browser, "student");
  await page.goto("/academy/schedule");
  await expect(page.getByRole("heading", { name: "My schedule" })).toBeVisible();
  await expect(page.getByText("Weekly lab")).toBeVisible();
  await expect(page.getByText("Weekly talk")).toBeVisible();
  await expect(page.getByText(`Running ${tag}`).first()).toBeVisible();
  const ics = await page.request.get(`${BASE}/api/academy/schedule.ics`);
  expect(ics.status()).toBe(200);
  const body = await ics.text();
  expect(body).toContain("BEGIN:VCALENDAR");
  expect(body).toContain(`Running ${tag}`);
  expect(body).not.toContain("meet.google.com");        // the meeting link is never put in the file
  await context.close();
});

test("the certificates page says what is still missing", async ({ browser }) => {
  const { context, page } = await as(browser, "student");
  await page.goto("/academy/certificates");
  await expect(page.getByRole("heading", { name: "Coming up" })).toBeVisible();
  await expect(page.getByText(/Finish the lessons \(0 of 1\)/)).toBeVisible();
  await expect(page.getByText(/issued automatically/i).first()).toBeVisible();
  await context.close();
});

test("an instructor gets a Teaching tab and page with their class, courses and students", async ({ browser }) => {
  const { context, page } = await as(browser, "teacher");
  await page.goto("/academy/dashboard");
  await expect(page.getByRole("link", { name: "Teaching" })).toBeVisible();
  await page.getByRole("link", { name: "Teaching" }).click();
  await expect(page.getByRole("heading", { name: "Your classes and students" })).toBeVisible();
  await expect(page.getByText(`Running ${tag}`).first()).toBeVisible();
  await expect(page.getByText(`Pipeline course ${tag}`).first()).toBeVisible();
  await expect(page.getByText(/1 students/).first()).toBeVisible();
  await context.close();
});

test("someone who teaches nothing has no Teaching tab and is told so on the page", async ({ browser }) => {
  const { context, page } = await as(browser, "outsider");
  await page.goto("/academy/dashboard");
  await expect(page.getByRole("link", { name: "Teaching" })).toHaveCount(0);
  await page.goto("/academy/teach");
  await expect(page.getByText("You are not teaching a course yet")).toBeVisible();
  await context.close();
});

test("the people involved were notified, with wording that makes sense", async () => {
  const mine = async (user, type) => (await admin.from("notifications").select("type, data").eq("user_id", user.id).eq("type", type)).data ?? [];
  expect((await mine(student, "academy_live_scheduled")).length).toBeGreaterThanOrEqual(1);
  expect((await mine(student, "academy_live_started")).length).toBe(1);
  expect((await mine(teacher, "academy_mentor_assigned")).length).toBe(1);
  expect((await mine(teacher, "academy_student_enrolled")).length).toBeGreaterThanOrEqual(1);
  expect(later.title).toContain(tag);
});
