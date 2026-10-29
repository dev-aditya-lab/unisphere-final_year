import { describe, expect, it } from "vitest";
import { PDFArray, PDFDocument, PDFName } from "pdf-lib";
import { formatBps, formatMoney, inclusiveTaxNote, minorToInput, percentToBps, priceSummary, quoteLines, toMinor } from "@/lib/academy/money";
import { CERT_VARIABLE_KEYS, certificateData, cleanText, fillText, formatDateLong, missingRequired, sampleData, variablesIn } from "@/lib/academy/cert-vars";
import { CertificateError, inspectTemplatePdf, renderCertificate } from "@/lib/academy/cert-pdf";
import { parseVideoInput, videoSource } from "@/lib/academy/video";
import { verifyUrl } from "@/lib/academy/urls";
import { parseTimetable, timetableToText } from "@/lib/academy/timetable";
import { assignmentSchema, couponSchema, courseSchema, lessonContentSchema, mentorSchema, priceRuleSchema, quizQuestionSchema, settingSchemas } from "@/lib/validators/academy";
import { describeNotification, notificationCategory } from "@/lib/notification-text";
import { buildCsp } from "@/lib/security/csp";

const UUID = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("money is whole paise and never goes through floating point", () => {
  it("reads typed amounts exactly", () => {
    expect(toMinor("19.99")).toBe(1999);
    expect(toMinor("0.1")).toBe(10);
    expect(toMinor("1000")).toBe(100000);
    expect(toMinor("0")).toBe(0);
    for (const bad of ["", "-5", "1,000", "1.234", "abc", "1e3", "99999999999"]) expect(toMinor(bad), bad).toBeNull();
  });
  it("formats and round-trips", () => {
    expect(formatMoney(100000)).toBe("₹1,000");
    expect(formatMoney(149950)).toBe("₹1,499.50");
    expect(formatMoney("2500")).toBe("₹25");
    expect(minorToInput(149950)).toBe("1499.50");
    expect(minorToInput(100000)).toBe("1000");
    expect(toMinor(minorToInput(1999))).toBe(1999);
  });
  it("reads percentages as basis points", () => {
    expect(percentToBps("18")).toBe(1800);
    expect(percentToBps("12.5")).toBe(1250);
    expect(percentToBps("0")).toBeNull();
    expect(percentToBps("101")).toBeNull();
    expect(formatBps(1800)).toBe("18%");
    expect(formatBps(1825)).toBe("18.25%");
  });
  it("lays out a quote's lines without adding anything up itself", () => {
    const q = { ok: true, list_minor: 100000, sale: { label: "Launch", discount_minor: 20000, ends_at: null }, coupon: { code: "HELLO", discount_minor: 8000 }, tax: { mode: "exclusive", minor: 12960, rate_bps: 1800, label: "GST" }, total_minor: 84960 };
    expect(quoteLines(q).map((l) => [l.key, l.minor])).toEqual([["list", 100000], ["sale", -20000], ["coupon", -8000], ["tax", 12960]]);
    expect(inclusiveTaxNote({ tax: { mode: "inclusive", minor: 15254, label: "GST", rate_bps: 1800 } })).toBe("Includes ₹152.54 GST (18%)");
    expect(inclusiveTaxNote({ tax: { mode: "exclusive", minor: 100 } })).toBeNull();
  });
  it("summarises a card price", () => {
    expect(priceSummary({ free: true }).label).toBe("Free");
    expect(priceSummary({ sold_out: true }).soldOut).toBe(true);
    expect(priceSummary({ total_minor: 70000, list_minor: 100000, sale: { label: "Early bird" }, tax: { mode: "none" } })).toMatchObject({ label: "₹700", was: "₹1,000", saleLabel: "Early bird" });
    expect(priceSummary(null).label).toMatch(/unavailable/);
  });
});

describe("certificate variables", () => {
  it("lists exactly the variables the database accepts", () => {
    expect([...CERT_VARIABLE_KEYS].sort()).toEqual(["assessment_score", "certificate_id", "completion_date", "course_code", "course_title", "issue_date", "issuing_organization", "mentor_name", "program_duration", "project_title", "project_url", "skills_covered", "student_name"]);
  });
  it("fills text and reports what was empty", () => {
    const data = certificateData({ recipient_name: "Asha Rao", course_title: "Python", course_code: "USA-PY-002", issue_date: "2026-10-29", issuing_organization: "UniSphere Academy", skills: ["Python", "SQL"], score_pct: 87.4 }, "US-2026-PY-00007");
    expect(fillText("{{student_name}} finished {{course_title}} ({{ course_code }})", data)).toEqual({ text: "Asha Rao finished Python (USA-PY-002)", missing: [] });
    expect(fillText("Mentor: {{mentor_name}}", data)).toEqual({ text: "Mentor:", missing: ["mentor_name"] });
    expect(data.skills_covered).toBe("Python, SQL");
    expect(data.assessment_score).toBe("87%");
    expect(data.issue_date).toBe("29 October 2026");
    expect(fillText("{{not_a_variable}}", data).text).toBe("");
    expect(variablesIn("{{a}} {{b}} {{a}}")).toEqual(["a", "b"]);
  });
  it("strips control characters; text only ever goes into a PDF, never into a page", () => {
    expect(cleanText("Asha\u0000 \n Rao‮")).toBe("Asha Rao");
    expect(formatDateLong("not a date")).toBe("");
  });
  it("names the required values that are missing", () => {
    expect(missingRequired({ student_name: "A", course_title: "B" })).toEqual(["course_code", "certificate_id", "issue_date", "issuing_organization"]);
    expect(missingRequired(sampleData())).toEqual([]);
  });
});

describe("certificate PDF", () => {
  async function template(pages = 1) {
    const doc = await PDFDocument.create();
    for (let i = 0; i < pages; i += 1) doc.addPage([842, 595]);
    // An annotation list like an uploaded file might carry: it must not survive.
    doc.getPage(0).node.set(PDFName.of("Annots"), doc.context.obj([doc.context.obj({ Type: "Annot", Subtype: "Link" })]));
    return doc.save();
  }
  const fields = [
    { id: "name", kind: "text", page: 0, x: 0.1, y: 0.4, w: 0.8, text: "{{student_name}}", font: "HelveticaBold", size: 34, color: "#111111", align: "center", required: true },
    { id: "course", kind: "text", page: 0, x: 0.1, y: 0.52, w: 0.8, text: "has completed {{course_title}} ({{course_code}})", font: "Helvetica", size: 16, color: "#222222", align: "center" },
    { id: "cid", kind: "text", page: 0, x: 0.06, y: 0.9, w: 0.4, text: "{{certificate_id}}", font: "Courier", size: 10, color: "#333333", align: "left" },
    { id: "qr", kind: "qr", page: 0, x: 0.8, y: 0.78, w: 0.12 },
  ];
  const data = (over = {}) => ({ ...sampleData("US-2026-WD-00142"), ...over });

  it("draws the fields and the QR code over the template and returns a valid PDF with a checksum", async () => {
    const out = await renderCertificate({ templateBytes: await template(), fields, data: data(), verifyUrl: verifyUrl("US-2026-WD-00142", "https://unispheres.in") });
    expect(Buffer.from(out.bytes.subarray(0, 5)).toString()).toBe("%PDF-");
    expect(out.sha256).toMatch(/^[0-9a-f]{64}$/);
    const reread = await PDFDocument.load(out.bytes);
    expect(reread.getPageCount()).toBe(1);
    expect(reread.getTitle()).toBe("Certificate US-2026-WD-00142");
    expect(reread.getPage(0).node.lookupMaybe(PDFName.of("Annots"), PDFArray)?.size() ?? 0).toBe(0); // the template's link annotation was dropped
  });
  it("keeps the QR address on the configured site, with the certificate ID encoded", () => {
    expect(verifyUrl("US-2026-WD-00142", "https://unispheres.in")).toBe("https://unispheres.in/academy/verify/US-2026-WD-00142");
    expect(verifyUrl("a/b?c", "https://x.test")).toBe("https://x.test/academy/verify/a%2Fb%3Fc");
  });
  it("refuses to make a real certificate when a required value is missing, but previews with a sample mark", async () => {
    await expect(renderCertificate({ templateBytes: await template(), fields, data: data({ student_name: "" }), verifyUrl: "https://x.test" })).rejects.toMatchObject({ code: "missing_data" });
    const preview = await renderCertificate({ templateBytes: await template(), fields, data: data({ student_name: "" }), verifyUrl: "https://x.test", preview: true });
    expect((await PDFDocument.load(preview.bytes)).getTitle()).toBe("Certificate preview");
  });
  it("shrinks a very long name to fit, and fails clearly on characters the font cannot print", async () => {
    const long = "Venkata Satya Narayana Raghavendra Subrahmanyam Chandrasekhara Venkataraman Iyer";
    await expect(renderCertificate({ templateBytes: await template(), fields, data: data({ student_name: long }), verifyUrl: "https://x.test" })).resolves.toBeTruthy();
    await expect(renderCertificate({ templateBytes: await template(), fields, data: data({ student_name: "आरव शर्मा" }), verifyUrl: "https://x.test" })).rejects.toMatchObject({ code: "unsupported_characters" });
  });
  it("inspects an upload and rejects what is not a usable PDF", async () => {
    expect(await inspectTemplatePdf(await template(2))).toMatchObject({ pageCount: 2, width: 842, height: 595 });
    await expect(inspectTemplatePdf(Buffer.from("not a pdf"))).rejects.toBeInstanceOf(CertificateError);
    await expect(inspectTemplatePdf(Buffer.alloc(9 * 1024 * 1024))).rejects.toMatchObject({ code: "too_large" });
  });
});

describe("video links", () => {
  it("accepts YouTube and Vimeo in their usual forms and nothing else", () => {
    expect(parseVideoInput("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({ provider: "youtube", ref: "dQw4w9WgXcQ" });
    expect(parseVideoInput("https://youtu.be/dQw4w9WgXcQ?t=5")).toEqual({ provider: "youtube", ref: "dQw4w9WgXcQ" });
    expect(parseVideoInput("https://vimeo.com/123456789")).toEqual({ provider: "vimeo", ref: "123456789" });
    expect(parseVideoInput("dQw4w9WgXcQ")).toEqual({ provider: "youtube", ref: "dQw4w9WgXcQ" });
    for (const bad of ["", "http://youtube.com/watch?v=dQw4w9WgXcQ", "https://evil.example/watch?v=dQw4w9WgXcQ", "javascript:alert(1)", "https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ"]) expect(parseVideoInput(bad), bad).toBeNull();
  });
  it("builds an embed only from a valid pair, on the two allowed hosts", () => {
    expect(videoSource("youtube", "dQw4w9WgXcQ").src).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
    expect(videoSource("vimeo", "123456789").src).toMatch(/^https:\/\/player\.vimeo\.com\/video\/123456789/);
    expect(videoSource("youtube", "x\"><script>")).toBeNull();
    expect(videoSource("url", "https://evil.test/a.mp4")).toBeNull();
  });
  it("lets those two hosts be framed on Academy pages only", () => {
    expect(buildCsp({ nonce: "n", academy: true })).toMatch(/frame-src https:\/\/www\.youtube-nocookie\.com https:\/\/player\.vimeo\.com/);
    expect(buildCsp({ nonce: "n" })).toMatch(/frame-src 'none'/);
  });
});

describe("form rules", () => {
  it("turns a coupon form into database values in paise and basis points", () => {
    const base = { code: "launch20", kind: "percent", percent: "12.5", max_discount: "500", min_purchase: "1000", active: "on", per_user_limit: "1", kinds: ["course"], course_ids: [], category_ids: [] };
    const r = couponSchema.parse(base);
    expect(r.couponRow).toMatchObject({ code: "LAUNCH20", percent_bps: 1250, max_discount_minor: 50000, min_purchase_minor: 100000, amount_minor: null });
    expect(couponSchema.safeParse({ ...base, percent: "" }).success).toBe(false);
    expect(couponSchema.safeParse({ ...base, code: "a b" }).success).toBe(false);
    expect(couponSchema.parse({ ...base, kind: "fixed", amount: "300" }).couponRow).toMatchObject({ amount_minor: 30000, percent_bps: null, max_discount_minor: null });
  });
  it("reads a rubric one criterion per line and refuses a malformed one", () => {
    const base = { course_id: UUID, title: "Build a thing", due_at: "", max_score: "100", pass_pct: "60", formats: ["repo"], allow_resubmission: "on", max_attempts: "3", allow_late: "on", required_for_certificate: "on", status: "published" };
    const ok = assignmentSchema.parse({ ...base, rubric_text: "code_quality | Code quality | 60\ndocs | Documentation | 40" });
    expect(ok.rubric).toEqual([{ key: "code_quality", label: "Code quality", max: 60 }, { key: "docs", label: "Documentation", max: 40 }]);
    expect(assignmentSchema.safeParse({ ...base, rubric_text: "Code Quality | x | 60" }).success).toBe(false);
  });
  it("checks a quiz question's key against its answers", () => {
    const base = { lesson_id: UUID, position: "0", prompt: "2 + 2?", options_text: "3\n4\n5", correct: "2", multiple: "false" };
    expect(quizQuestionSchema.parse(base)).toMatchObject({ options: ["3", "4", "5"], correct: [1] });
    expect(quizQuestionSchema.safeParse({ ...base, correct: "4" }).success).toBe(false);
    expect(quizQuestionSchema.safeParse({ ...base, correct: "1,2" }).success).toBe(false);
  });
  it("reads a price rule's price into paise", () => {
    const r = priceRuleSchema.parse({ course_id: UUID, kind: "sale", label: "Launch", price: "799.50", starts_at: "", ends_at: "2026-12-31T10:00", cohort_id: "", max_uses: "", active: "on" });
    expect(r.price_minor).toBe(79950);
    expect(r.cohort_id).toBeNull();
    expect(r.ends_at).toMatch(/^2026-12-31T/);
  });
  it("stores a lesson's video as provider and id, never as a raw address", () => {
    expect(lessonContentSchema.parse({ lesson_id: UUID, body_md: "hi", video: "https://youtu.be/dQw4w9WgXcQ" })).toMatchObject({ video_provider: "youtube", video_ref: "dQw4w9WgXcQ" });
    expect(lessonContentSchema.safeParse({ lesson_id: UUID, video: "https://evil.test/x" }).success).toBe(false);
  });
  it("accepts a course with a slug and criteria, and rejects a bad slug", () => {
    const base = { title: "Full-stack web", slug: "full-stack-web", kind: "course", category_id: UUID, level: "beginner", language: "English", duration_minutes: "", enrollment_limit: "", access_days: "", cert_min_completion: "100", cert_min_score: "0" };
    expect(courseSchema.safeParse(base).success).toBe(true);
    expect(courseSchema.safeParse({ ...base, slug: "Bad Slug!" }).success).toBe(false);
  });
  it("validates each setting's shape", () => {
    expect(settingSchemas.tax_rate_bps.parse("18")).toBe(1800);
    expect(settingSchemas.tax_rate_bps.safeParse("abc").success).toBe(false);
    expect(settingSchemas.tax_mode.safeParse("sometimes").success).toBe(false);
    expect(settingSchemas.support_email.safeParse("not an email").success).toBe(false);
  });
});

describe("Academy notifications", () => {
  const types = ["academy_enrolled", "academy_payment", "academy_refund", "academy_live_reminder", "academy_assignment_due", "academy_feedback", "academy_completed", "academy_certificate", "academy_announcement"];
  it("are all in the Academy category, with a sentence and a page of their own", () => {
    for (const type of types) {
      expect(notificationCategory(type), type).toBe("academy");
      const n = describeNotification({ type, data: { course_id: UUID, title: "Python", event: "received", status: "completed", hours: 1 } }, "x");
      expect(n.text, type).not.toBe("You have a new notification");
      expect(n.href, type).toMatch(/^\/academy\//);
    }
  });
  it("never puts a mentor's feedback or a certificate holder's words on the lock screen", () => {
    const n = describeNotification({ type: "academy_feedback", data: { assignment: "Build a thing", passed: true, feedback: "SECRET-FEEDBACK", snippet: "SECRET-FEEDBACK", reason: "SECRET-FEEDBACK" } }, "x");
    expect(n.text).not.toContain("SECRET");
    expect(n.detail ?? "").not.toContain("SECRET");
  });
  it("only builds a course link from a real id", () => {
    expect(describeNotification({ type: "academy_enrolled", data: { course_id: "../../admin", title: "X" } }).href).toBe("/academy/my-learning");
    expect(describeNotification({ type: "academy_enrolled", data: { course_id: UUID, title: "X" } }).href).toBe(`/academy/learn/${UUID}`);
  });
  it("tells a payment from a refund in plain words", () => {
    expect(describeNotification({ type: "academy_payment", data: { event: "received", amount_minor: 250000, title: "Python" } }).text).toBe("We received your payment of ₹2,500 for Python");
    expect(describeNotification({ type: "academy_payment", data: { event: "failed", title: "Python" } }).text).toBe("Your payment for Python did not go through");
    expect(describeNotification({ type: "academy_certificate", data: { event: "revoked", title: "Python" } }).text).toBe("Your certificate for Python was revoked");
  });

  it("reads a timetable typed one slot per line, in day order, and says which line is wrong", () => {
    const ok = parseTimetable("Wed | 19:00-20:30 | Backend\nmon | 9:00 - 10:00 | Frontend basics\n\n");
    expect(ok.rows).toEqual([{ day: "Mon", start: "09:00", end: "10:00", topic: "Frontend basics" }, { day: "Wed", start: "19:00", end: "20:30", topic: "Backend" }]);
    expect(timetableToText(ok.rows)).toBe("Mon | 09:00-10:00 | Frontend basics\nWed | 19:00-20:30 | Backend");
    expect(parseTimetable("Funday | 10:00-11:00").error).toMatch(/Line 1/);
    expect(parseTimetable("Mon | 25:00-26:00").error).toMatch(/Line 1/);
    expect(parseTimetable("Mon | 11:00-10:00").error).toMatch(/after the start/);
    expect(parseTimetable(Array.from({ length: 41 }, () => "Mon | 10:00-11:00").join("\n")).error).toMatch(/At most/);
    expect(parseTimetable("").rows).toEqual([]);
  });
  it("a course carries its delivery mode, written syllabus and timetable", () => {
    const base = { title: "Full-stack web", slug: "full-stack-web", kind: "course", category_id: UUID, level: "beginner", language: "English", duration_minutes: "", enrollment_limit: "", access_days: "", cert_min_completion: "100", cert_min_score: "0" };
    const r = courseSchema.parse({ ...base, delivery_mode: "hybrid", syllabus_md: "## Week 1", timetable_text: "Sat | 10:00-12:00 | Workshop" });
    expect(r.delivery_mode).toBe("hybrid");
    expect(r.timetable).toEqual([{ day: "Sat", start: "10:00", end: "12:00", topic: "Workshop" }]);
    expect(courseSchema.parse(base).delivery_mode).toBe("recorded");
    expect(courseSchema.safeParse({ ...base, delivery_mode: "telepathy" }).success).toBe(false);
    expect(courseSchema.safeParse({ ...base, timetable_text: "nonsense" }).success).toBe(false);
  });
  it("a mentor's links must be https and the lists are bounded", () => {
    const base = { username: "asha", display_name: "Asha Rao", active: "on" };
    const good = mentorSchema.parse({ ...base, expertise: "React, Node.js, React", experience_years: "7", linkedin_url: "https://linkedin.com/in/asha" });
    expect(good.expertise).toEqual(["React", "Node.js"]);
    expect(good.experience_years).toBe(7);
    expect(mentorSchema.safeParse({ ...base, website_url: "javascript:alert(1)" }).success).toBe(false);
    expect(mentorSchema.safeParse({ ...base, expertise: "a,b,c,d,e,f,g,h,i" }).success).toBe(false);
  });
});

describe("offers shown from a quote", () => {
  const quoteWith = (extra) => ({ ok: true, free: false, list_minor: 100000, ...extra });
  it("lists an automatic coupon first, then a scheduled price, using only what the server returned", async () => {
    const { offersFromQuote } = await import("@/lib/academy/money");
    const offers = offersFromQuote(quoteWith({
      coupon: { id: "c1", auto: true, label: "Welcome offer", kind: "percent", percent_bps: 1250, discount_minor: 12500 },
      sale: { rule_id: "r1", label: "Early bird", discount_minor: 30000, ends_at: "2030-01-01T00:00:00Z", uses_left: 4 },
    }));
    expect(offers.map((o) => o.id)).toEqual(["coupon:c1", "rule:r1"]);
    expect(offers[0]).toMatchObject({ label: "Welcome offer", percentOff: 12.5, saved: "₹125.00" });
    expect(offers[1]).toMatchObject({ percentOff: 30, usesLeft: 4, endsAt: "2030-01-01T00:00:00Z" });
  });
  it("shows nothing for a typed code, a free course or a failed quote", async () => {
    const { offersFromQuote } = await import("@/lib/academy/money");
    expect(offersFromQuote(quoteWith({ coupon: { id: "c1", auto: false, code: "X", discount_minor: 500 } }))).toEqual([]);
    expect(offersFromQuote({ ok: true, free: true, list_minor: 0 })).toEqual([]);
    expect(offersFromQuote({ ok: false })).toEqual([]);
    expect(offersFromQuote(null)).toEqual([]);
  });
  it("requires a name for an offer that applies by itself", () => {
    const base = { code: "WELCOME", kind: "percent", percent: "10", per_user_limit: "1", kinds: ["course"], active: "on" };
    expect(couponSchema.safeParse({ ...base, auto_apply: "on" }).success).toBe(false);
    const ok = couponSchema.parse({ ...base, auto_apply: "on", public_label: "Welcome offer" });
    expect(ok.couponRow).toMatchObject({ auto_apply: true, public_label: "Welcome offer" });
    expect(couponSchema.parse({ ...base, public_label: "ignored" }).couponRow).toMatchObject({ auto_apply: false, public_label: null });
  });
});

describe("class and teaching notifications", () => {
  const UUID = "7f9c2c1e-3b0a-4e44-9d0e-1a2b3c4d5e6f";
  it("tells a student about a new, moved or cancelled class and links to the schedule", () => {
    const base = { title: "Doubt session", course_title: "Web Dev", starts_at: "2030-01-10T13:30:00Z", role: "student" };
    expect(describeNotification({ type: "academy_live_scheduled", data: { ...base, event: "scheduled" } })).toMatchObject({ text: "New live class: Doubt session", href: "/academy/schedule" });
    expect(describeNotification({ type: "academy_live_scheduled", data: { ...base, event: "rescheduled" } }).text).toBe("Doubt session was moved");
    const cancelled = describeNotification({ type: "academy_live_scheduled", data: { ...base, event: "cancelled" } });
    expect(cancelled.text).toBe("Doubt session was cancelled");
    expect(cancelled.detail).toBe("Web Dev");
  });
  it("sends an instructor to the teaching page, not the student's course page", () => {
    expect(describeNotification({ type: "academy_live_scheduled", data: { event: "scheduled", title: "X", role: "instructor" } }).href).toBe("/academy/teach");
    expect(describeNotification({ type: "academy_live_started", data: { title: "X", role: "mentor" } }).href).toBe("/academy/teach");
    expect(describeNotification({ type: "academy_live_reminder", data: { title: "X", hours: 1, role: "instructor", course_id: UUID } }).href).toBe("/academy/teach");
    expect(describeNotification({ type: "academy_live_reminder", data: { title: "X", hours: 1, course_id: UUID } }).href).toBe(`/academy/learn/${UUID}#live`);
  });
  it("says a class is live now", () => {
    expect(describeNotification({ type: "academy_live_started", data: { title: "Week 2", course_title: "Web Dev" } })).toMatchObject({ text: "Week 2 is live now", href: "/academy/dashboard" });
  });
  it("tells mentors about an assignment, an enrolment and being added to a course", () => {
    expect(describeNotification({ type: "academy_mentor_assigned", data: { title: "Web Dev", role: "lead" } }).text).toBe("You were added as the lead mentor on Web Dev");
    expect(describeNotification({ type: "academy_submission_received", data: { student: "Asha", assignment: "Project 1", course_title: "Web Dev" } })).toMatchObject({ text: "Asha handed in Project 1", href: "/admin/academy/assignments" });
    expect(describeNotification({ type: "academy_student_enrolled", data: { student: "Asha", title: "Web Dev" } }).text).toBe("Asha enrolled in Web Dev");
  });
  it("files them all under the Academy notification switches", async () => {
    const { notificationCategory: categoryOf } = await import("@/lib/notification-text");
    for (const t of ["academy_live_scheduled", "academy_live_started", "academy_mentor_assigned", "academy_submission_received", "academy_student_enrolled"]) expect(categoryOf(t)).toBe("academy");
  });
});
