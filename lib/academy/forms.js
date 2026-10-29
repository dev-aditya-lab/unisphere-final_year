// Field lists for the Academy console's forms (plain data, shared by the pages that render them). The matching rules live in
// lib/validators/academy.js; the database re-checks everything.
import { DELIVERY_MODES, KINDS, LEVELS } from "@/lib/academy/constants";
import { timetableToText } from "@/lib/academy/timetable";

const opts = (obj) => Object.entries(obj).map(([value, label]) => ({ value, label }));
const kinds = Object.entries(KINDS).map(([value, k]) => ({ value, label: k.label }));

export const categoryFields = [
  { name: "name", label: "Name", required: true },
  { name: "slug", label: "Address part", required: true, hint: "lowercase-with-hyphens" },
  { name: "code_prefix", label: "Course code prefix", required: true, hint: "2 to 8 capitals, e.g. WD. New courses get codes like USA-WD-004. Existing codes never change." },
  { name: "position", label: "Order", type: "number", default: 0 },
  { name: "description", label: "Description", type: "textarea", rows: 2 },
  { name: "active", label: "Shown to visitors", type: "checkbox", default: true },
];

export const courseFields = (categories) => [
  { name: "title", label: "Title", required: true, wide: true },
  { name: "slug", label: "Address part", required: true, hint: "lowercase-with-hyphens; part of the public link" },
  { name: "kind", label: "Type", type: "select", options: kinds, default: "course" },
  { name: "category_id", label: "Subject", type: "select", options: categories.map((c) => ({ value: c.id, label: `${c.name} (${c.code_prefix})` })), hint: "Decides the course code prefix at creation." },
  { name: "delivery_mode", label: "How it is taught", type: "select", options: Object.entries(DELIVERY_MODES).map(([value, m]) => ({ value, label: `${m.label}: ${m.blurb}` })), default: "recorded", hint: "Shown on the course page and cards. Live classes are scheduled under Live classes." },
  { name: "level", label: "Level", type: "select", options: opts(LEVELS), default: "beginner" },
  { name: "language", label: "Language", default: "English" },
  { name: "short_description", label: "Short description", type: "textarea", rows: 2, hint: "Up to 280 characters; shown on cards." },
  { name: "description_md", label: "About (Markdown)", type: "textarea", rows: 8 },
  { name: "syllabus_md", label: "Syllabus (Markdown)", type: "textarea", rows: 8, wide: true, hint: "The written syllabus: topics week by week, tools, projects. Headings (##), lists and **bold** work. The lesson-by-lesson curriculum is built separately under Curriculum." },
  { name: "timetable_text", label: "Timetable", type: "textarea", rows: 5, wide: true, placeholder: "Mon | 19:00-20:30 | Frontend basics\nWed | 19:00-20:30 | Backend basics", hint: "One slot per line: day | start-end | topic. 24-hour India time. Leave empty for a self-paced course." },
  { name: "timetable_note", label: "Timetable note", hint: "For example: Classes repeat every week. Recordings are posted within a day." },
  { name: "objectives", label: "What students will learn", type: "textarea", rows: 4, hint: "One per line." },
  { name: "prerequisites", label: "Prerequisites", type: "textarea", rows: 3, hint: "One per line." },
  { name: "skills", label: "Skills covered", type: "textarea", rows: 3, hint: "One per line. Printed on certificates as {{skills_covered}}." },
  { name: "outcomes", label: "Outcomes", type: "textarea", rows: 3, hint: "One per line." },
  { name: "tags", label: "Tags", hint: "Comma separated." },
  { name: "duration_label", label: "Duration label", placeholder: "12 weeks", hint: "Shown on the page and as {{program_duration}}." },
  { name: "duration_minutes", label: "Duration (minutes)", type: "number" },
  { name: "enrollment_limit", label: "Seat limit", type: "number", hint: "Leave empty for no limit." },
  { name: "access_days", label: "Access period (days)", type: "number", hint: "Empty = no expiry." },
  { name: "starts_at", label: "Starts", type: "datetime" },
  { name: "ends_at", label: "Ends (enrolment closes)", type: "datetime" },
  { name: "promo_video_url", label: "Promo video link", hint: "A full https:// link." },
  { name: "seo_title", label: "Search title" },
  { name: "seo_description", label: "Search description" },
  { name: "cert_min_completion", label: "Certificate: lessons completed (%)", type: "number", default: 100, min: 0, max: 100 },
  { name: "cert_min_score", label: "Certificate: minimum average score (%)", type: "number", default: 0, min: 0, max: 100, hint: "0 = no minimum." },
  { name: "cert_require_assignments", label: "Required assignments must be passed", type: "checkbox", default: true },
  { name: "cert_manual_approval", label: "A person must approve each certificate", type: "checkbox", default: false },
];

/** A stored course row -> the form's starting values. */
export const courseInitial = (c) => ({
  ...c,
  tags: (c.tags ?? []).join(", "), timetable_text: timetableToText(c.timetable),
  objectives: (c.objectives ?? []).join("\n"), prerequisites: (c.prerequisites ?? []).join("\n"), skills: (c.skills ?? []).join("\n"), outcomes: (c.outcomes ?? []).join("\n"),
  cert_min_completion: c.certificate_criteria?.min_completion_pct ?? 100, cert_min_score: c.certificate_criteria?.min_score_pct ?? 0,
  cert_require_assignments: c.certificate_criteria?.require_assignments !== false, cert_manual_approval: c.certificate_criteria?.manual_approval === true,
});

export const MODULE_FIELDS = [
  { name: "title", label: "Module title", required: true },
  { name: "position", label: "Order", type: "number", default: 0 },
  { name: "summary", label: "Summary", type: "textarea", rows: 2, wide: true },
];
export const LESSON_FIELDS = [
  { name: "title", label: "Lesson title", required: true, wide: true },
  { name: "kind", label: "Type", type: "select", options: [{ value: "video", label: "Video" }, { value: "text", label: "Reading" }, { value: "resource", label: "Resource" }, { value: "quiz", label: "Quiz" }, { value: "assignment", label: "Assignment" }], default: "video" },
  { name: "duration_minutes", label: "Minutes", type: "number" },
  { name: "position", label: "Order", type: "number", default: 0 },
  { name: "pass_pct", label: "Quiz pass mark (%)", type: "number", default: 70, min: 1, max: 100 },
  { name: "is_preview", label: "Free preview (anyone can open it)", type: "checkbox" },
];
export const LESSON_CONTENT_FIELDS = [
  { name: "video", label: "Video (YouTube or Vimeo link)", wide: true, hint: "Only YouTube and Vimeo are supported." },
  { name: "body_md", label: "Text (Markdown)", type: "textarea", rows: 8 },
];
export const QUESTION_FIELDS = [
  { name: "prompt", label: "Question", required: true, wide: true },
  { name: "options_text", label: "Answers", type: "textarea", rows: 4, hint: "One per line, 2 to 8." },
  { name: "correct", label: "Correct answer number(s)", placeholder: "2 or 1,3", hint: "Numbers count from 1. Students never see this." },
  { name: "multiple", label: "Several answers can be correct", type: "checkbox" },
  { name: "position", label: "Order", type: "number", default: 0 },
  { name: "explanation", label: "Explanation (shown to staff only)", wide: true },
];
export const COHORT_FIELDS = [
  { name: "name", label: "Name", required: true },
  { name: "status", label: "Status", type: "select", options: [{ value: "open", label: "Open" }, { value: "closed", label: "Closed" }, { value: "archived", label: "Archived" }], default: "open" },
  { name: "starts_at", label: "Starts", type: "datetime" },
  { name: "ends_at", label: "Ends", type: "datetime" },
  { name: "capacity", label: "Seats", type: "number" },
];
export const PRICE_RULE_FIELDS = (cohorts = []) => [
  { name: "label", label: "Label shown to students", required: true, placeholder: "Early bird" },
  { name: "kind", label: "Kind", type: "select", options: [{ value: "sale", label: "Sale" }, { value: "early_bird", label: "Early bird" }, { value: "cohort", label: "Cohort price" }, { value: "promotion", label: "Promotion" }], default: "sale" },
  { name: "price", label: "Price (₹)", type: "money", required: true, hint: "The price during the window. Must be below the list price to have any effect." },
  { name: "starts_at", label: "Starts", type: "datetime" },
  { name: "ends_at", label: "Ends", type: "datetime", hint: "Empty = until switched off." },
  { name: "cohort_id", label: "Only for cohort", type: "select", allowEmpty: true, emptyLabel: "Everyone", options: cohorts.map((c) => ({ value: c.id, label: c.name })) },
  { name: "max_uses", label: "Seats at this price", type: "number" },
  { name: "active", label: "Active", type: "checkbox", default: true },
];
export const PRICE_FIELDS = [
  { name: "price", label: "List price (₹)", type: "money", hint: "0 = free. Empty = not priced yet (cannot be published)." },
  { name: "refund_days", label: "Refund window (days)", type: "number", hint: "Empty = the Academy default." },
];
export const ASSIGNMENT_FIELDS = (lessons = []) => [
  { name: "title", label: "Title", required: true, wide: true },
  { name: "status", label: "Status", type: "select", options: [{ value: "draft", label: "Draft" }, { value: "published", label: "Published" }, { value: "archived", label: "Archived" }], default: "draft" },
  { name: "lesson_id", label: "Lesson it belongs to", type: "select", allowEmpty: true, emptyLabel: "None (course-level)", options: lessons.map((l) => ({ value: l.id, label: l.title })), hint: "A passing grade completes that lesson." },
  { name: "summary", label: "Summary", type: "textarea", rows: 2 },
  { name: "instructions_md", label: "Instructions (Markdown)", type: "textarea", rows: 6 },
  { name: "objectives", label: "Learning objectives", type: "textarea", rows: 3, hint: "One per line." },
  { name: "due_at", label: "Due", type: "datetime" },
  { name: "max_score", label: "Maximum score", type: "number", default: 100 },
  { name: "pass_pct", label: "Pass mark (%)", type: "number", default: 60 },
  { name: "rubric_text", label: "Rubric", type: "textarea", rows: 4, hint: "One line per criterion: key | Label | points. Example: code_quality | Code quality | 30. Leave empty for one overall score." },
  { name: "formats", label: "Students may submit", type: "multi", options: [{ value: "repo", label: "Repository link" }, { value: "demo", label: "Live demo link" }, { value: "file", label: "File" }, { value: "text", label: "Notes" }], default: ["repo", "demo", "text"] },
  { name: "max_attempts", label: "Attempts allowed", type: "number", default: 3 },
  { name: "allow_resubmission", label: "Allow resubmission after grading", type: "checkbox", default: true },
  { name: "allow_late", label: "Accept late work (marked late)", type: "checkbox", default: true },
  { name: "required_for_certificate", label: "Required for the certificate", type: "checkbox", default: true },
];
export const COUPON_FIELDS = (courses = [], categories = []) => [
  { name: "code", label: "Code", required: true, hint: "Capital letters, numbers, - or _. Case does not matter to students." },
  { name: "kind", label: "Discount", type: "select", options: [{ value: "percent", label: "Percentage" }, { value: "fixed", label: "Fixed amount" }], default: "percent" },
  { name: "percent", label: "Percent off", placeholder: "20", hint: "For a percentage coupon." },
  { name: "amount", label: "Amount off (₹)", hint: "For a fixed coupon." },
  { name: "max_discount", label: "Largest discount (₹)", hint: "Percentage coupons only. Empty = no cap." },
  { name: "min_purchase", label: "Minimum price (₹)", hint: "Checked against the price after any sale." },
  { name: "starts_at", label: "Starts", type: "datetime" },
  { name: "expires_at", label: "Expires", type: "datetime" },
  { name: "usage_limit", label: "Total uses", type: "number", hint: "Empty = unlimited." },
  { name: "per_user_limit", label: "Uses per student", type: "number", default: 1 },
  { name: "description", label: "Description (shown to nobody)", wide: true },
  { name: "auto_apply", label: "Apply automatically (no code to type)", type: "checkbox", hint: "Signed-in students who qualify get it at checkout without typing anything, and see a celebration when it appears. If several automatic offers qualify they get the best one. A code they type replaces it; the two never add up." },
  { name: "public_label", label: "Name students will see", placeholder: "Welcome offer", hint: "Needed for an automatic offer. Examples: Welcome offer, Early supporter, Scholarship." },
  { name: "kinds", label: "Applies to", type: "multi", options: kinds, default: ["course", "program", "internship"] },
  { name: "course_ids", label: "Only these courses (none ticked = all)", type: "multi", options: courses.map((c) => ({ value: c.id, label: `${c.code} ${c.title}` })), default: [] },
  { name: "category_ids", label: "Or these subjects", type: "multi", options: categories.map((c) => ({ value: c.id, label: c.name })), default: [] },
  { name: "usernames", label: "Only these people (usernames)", type: "textarea", rows: 2, hint: "Empty = anyone. Separate with spaces or commas." },
  { name: "first_purchase_only", label: "First purchase only", type: "checkbox" },
  { name: "stackable_with_sale", label: "May be used on top of a sale price", type: "checkbox", default: true },
  { name: "active", label: "Active", type: "checkbox", default: true },
  { name: "internal_note", label: "Internal note", type: "textarea", rows: 2 },
];
export const MENTOR_FIELDS = [
  { name: "username", label: "UniSphere username", required: true, hint: "Exact username of an existing member." },
  { name: "display_name", label: "Name shown publicly", required: true },
  { name: "headline", label: "Headline" },
  { name: "bio", label: "About the instructor", type: "textarea", rows: 5, wide: true, hint: "Up to 1500 characters. Shown on every course this person teaches." },
  { name: "expertise", label: "Expertise", hint: "Comma separated, up to 8. Example: React, Node.js, System design." },
  { name: "experience_years", label: "Years of experience", type: "number" },
  { name: "linkedin_url", label: "LinkedIn link", hint: "A full https:// link." },
  { name: "website_url", label: "Website or portfolio link", hint: "A full https:// link." },
  { name: "active", label: "Shown on the Academy", type: "checkbox", default: true },
];
export const LIVE_FIELDS = (courses = [], mentors = []) => [
  { name: "title", label: "Title", required: true, wide: true },
  { name: "course_id", label: "Course", type: "select", options: courses.map((c) => ({ value: c.id, label: `${c.code} ${c.title}` })) },
  { name: "instructor_id", label: "Instructor", type: "select", allowEmpty: true, emptyLabel: "None", options: mentors.map((m) => ({ value: m.user_id, label: m.display_name })) },
  { name: "starts_at", label: "Starts", type: "datetime", required: true },
  { name: "ends_at", label: "Ends", type: "datetime", required: true },
  { name: "status", label: "Status", type: "select", options: [{ value: "scheduled", label: "Scheduled" }, { value: "live", label: "Live" }, { value: "completed", label: "Completed" }, { value: "cancelled", label: "Cancelled" }], default: "scheduled" },
  { name: "auto_meet", label: "Create a Google Meet and invite enrolled students by email", type: "checkbox", hint: "Needs Google connected in Academy settings. Google sends each enrolled student an invitation; invited students join without asking, anyone else must ask to be let in. The meeting link below is then filled in for you." },
  { name: "meeting_url", label: "Meeting link", hint: "Only for a meeting you create yourself (Zoom, Teams, a Meet of your own). Students see it only from an hour before the class. Ignored when the Google Meet above is switched on." },
  { name: "recording_url", label: "Recording link", hint: "Private link from your storage or video provider." },
  { name: "recording_consent", label: "Participants were told it would be recorded", type: "checkbox" },
  { name: "recording_available", label: "Recording is available to students", type: "checkbox", hint: "Needs the box above. Expires after the retention period in Academy settings." },
  { name: "description", label: "Description", type: "textarea", rows: 2 },
  { name: "resources_note", label: "Resources note", type: "textarea", rows: 2 },
];
export const ANNOUNCEMENT_FIELDS = (courses = []) => [
  { name: "course_id", label: "Who", type: "select", allowEmpty: true, emptyLabel: "Every active student", options: courses.map((c) => ({ value: c.id, label: `${c.code} ${c.title}` })) },
  { name: "title", label: "Title", required: true, wide: true },
  { name: "message", label: "Message", type: "textarea", rows: 4, required: true },
];
export const TEMPLATE_FIELDS = [
  { name: "name", label: "Name", required: true },
  { name: "description", label: "Description" },
  { name: "is_default", label: "Default template (used when a course has none)", type: "checkbox" },
  { name: "active", label: "Active", type: "checkbox", default: true },
];
export const ENROLL_FIELDS = (courses = []) => [
  { name: "username", label: "Student's username", required: true },
  { name: "courseId", label: "Course", type: "select", options: courses.map((c) => ({ value: c.id, label: `${c.code} ${c.title}` })) },
  { name: "source", label: "Why", type: "select", options: [{ value: "complimentary", label: "Complimentary" }, { value: "scholarship", label: "Scholarship" }], default: "complimentary" },
  { name: "days", label: "Access (days)", type: "number", hint: "Empty = the course default." },
  { name: "reason", label: "Reason (kept in the audit log)", required: true, wide: true },
];
export const ADD_MENTOR_TO_COURSE = (mentors = []) => [
  { name: "user_id", label: "Mentor", type: "select", options: mentors.map((m) => ({ value: m.user_id, label: m.display_name })) },
  { name: "role", label: "Role", type: "select", options: [{ value: "lead", label: "Lead" }, { value: "mentor", label: "Mentor" }], default: "mentor" },
];
