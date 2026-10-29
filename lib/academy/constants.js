// Shared Academy constants (isomorphic: safe in client components).

export const ACADEMY_PATH = "/academy";
export const ACADEMY_NAME = "UniSphere Academy";

/** Kinds of learning product. They share one table; the catalogue pages filter on `kind`. */
export const KINDS = {
  course: { label: "Course", plural: "Courses", path: "/academy/courses", blurb: "Structured lessons with quizzes, assignments and mentor feedback." },
  program: { label: "Program", plural: "Programs", path: "/academy/programs", blurb: "A guided path of projects with a mentor and a cohort." },
  internship: { label: "Project internship", plural: "Project internships", path: "/academy/internships", blurb: "A structured, project-based training programme run by UniSphere Academy. It is training, not employment." },
};
export const kindFromPath = (segment) => ({ courses: "course", programs: "program", internships: "internship" })[segment] ?? null;
export const detailPath = (course) => `${KINDS[course.kind]?.path ?? "/academy/courses"}/${course.slug}`;

export const LEVELS = { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced", all: "All levels" };
export const LESSON_KINDS = { video: "Video", text: "Reading", resource: "Resource", quiz: "Quiz", assignment: "Assignment" };
export const COURSE_STATUSES = { draft: "Draft", published: "Published", unpublished: "Unpublished", archived: "Archived" };
export const ENROLLMENT_STATUSES = { active: "Active", completed: "Completed", expired: "Expired", revoked: "Revoked", suspended: "Suspended", refunded: "Refunded" };
export const ORDER_STATUSES = { pending: "Awaiting payment", paid: "Paid", failed: "Failed", cancelled: "Cancelled", expired: "Expired", refunded: "Refunded", partially_refunded: "Partly refunded" };
export const REFUND_STATUSES = { requested: "Requested", approved: "Approved", completed: "Refunded", rejected: "Declined", failed: "Gateway refused" };
export const CERT_STATUSES = { pending: "Being prepared", issued: "Issued", revoked: "Revoked", failed: "Failed" };

export const ENROLL_SOURCES = { free: "Free", paid: "Paid", complimentary: "Complimentary", scholarship: "Scholarship" };

/** Permissions the Academy console uses (the database re-checks every one). */
export const ACADEMY_PERMISSIONS = [
  "academy.courses.manage", "academy.courses.publish", "academy.pricing.manage", "academy.coupons.manage", "academy.finance.view",
  "academy.refunds.process", "academy.students.view", "academy.students.manage", "academy.assignments.review", "academy.certificates.issue",
  "academy.certificates.revoke", "academy.templates.manage", "academy.live.manage", "academy.announce", "academy.analytics.view",
  "academy.export", "academy.audit.view", "academy.settings.manage",
];

export const ACADEMY_ROLES = [
  { value: "academy_admin", label: "Academy administrator", hint: "Everything in the Academy console." },
  { value: "course_manager", label: "Course manager", hint: "Courses, curriculum, publishing, live classes, announcements. No prices or payments." },
  { value: "finance_manager", label: "Finance manager", hint: "Prices, coupons, orders, refunds and exports. Cannot issue certificates." },
  { value: "academy_mentor", label: "Mentor", hint: "Grades work in the courses they are assigned to. No payment access." },
  { value: "academy_support", label: "Academy support", hint: "Sees students and posts announcements." },
];

/** Plain-language messages for the error codes the database functions return (an `error` string in `{ ok:false }`, or a raised exception). */
export const ACADEMY_ERRORS = {
  course_unavailable: "This course is not open for enrolment right now.",
  price_not_set: "This course does not have a price yet.",
  enrollment_closed: "Enrolment for this course has closed.",
  cohort_unavailable: "That cohort is not open for enrolment.",
  sold_out: "This course is full.",
  sign_in_required: "Sign in to use a coupon.",
  coupon_invalid: "That coupon code is not valid.",
  coupon_not_started: "That coupon is not active yet.",
  coupon_expired: "That coupon has expired.",
  coupon_not_eligible: "That coupon does not apply to this course.",
  coupon_not_needed: "This course is already free.",
  coupon_no_stack: "That coupon cannot be combined with the current sale price.",
  coupon_min_spend: "The price is too low for that coupon.",
  coupon_exhausted: "That coupon has been fully used.",
  coupon_user_limit: "You have already used that coupon the most times it allows.",
  coupon_first_purchase: "That coupon is for a first purchase only.",
  already_enrolled: "You are already enrolled in this course.",
  consent_required: "Please agree to the certificate verification terms to continue.",
  sales_closed: "Paid enrolment is not open yet.",
  account_unavailable: "Your account cannot enrol right now.",
  payments_unconfigured: "Payments are not set up yet. Please try again later.",
};

/** Raised exceptions (SQLSTATE message) -> text. Anything not listed becomes a generic message, never raw SQL. */
export const ACADEMY_EXCEPTIONS = {
  forbidden: "You do not have permission to do that.",
  forbidden_pricing: "Only people with pricing access can change prices or refund windows.",
  forbidden_publish: "Only people who can publish courses can change a course's status.",
  code_immutable: "A course code can never be changed.",
  price_required: "Set a price (0 for free) before publishing.",
  lessons_required: "Add at least one lesson before publishing a course.",
  kind_locked: "A course that has students cannot change its type.",
  invalid_image: "That image could not be used.",
  no_access: "You are not enrolled in this course.",
  graded_lesson: "This lesson is completed by passing its quiz or assignment.",
  too_many_attempts: "Too many attempts today. Try again tomorrow.",
  quiz_empty: "This quiz has no questions yet.",
  empty_submission: "Add a link, a note or a file to submit.",
  format_not_allowed: "This assignment does not accept that kind of submission.",
  invalid_file: "That file could not be used. Please upload it again.",
  awaiting_review: "Your last submission is still waiting for a review.",
  already_passed: "You have already passed this assignment.",
  resubmission_closed: "This assignment does not allow another attempt.",
  attempts_used: "You have used all the attempts for this assignment.",
  deadline_passed: "The deadline for this assignment has passed.",
  cannot_review_own_work: "You cannot review your own work.",
  cannot_grant_to_self: "Someone else has to do that for you.",
  cannot_review_own_request: "Someone else has to review your own request.",
  invalid_scores: "The scores do not match the rubric.",
  feedback_required: "Add feedback before sending this back.",
  reason_required: "Please give a reason (at least 3 characters).",
  note_required: "Please explain why the request is declined.",
  invalid_state: "That is not possible in the current state.",
  not_found: "That could not be found.",
  not_refundable: "This order cannot be refunded.",
  refund_window_closed: "The refund window for this order has closed.",
  invalid_amount: "That refund amount is not valid.",
  version_locked: "A live template version cannot be edited. Create a new version.",
  invalid_value: "That value is not valid for this setting.",
  unsupported_currency: "Only INR is supported by the payment gateway for now.",
  target_unavailable: "That member is not available.",
  course_unavailable_for_grant: "That course is not available.",
  certificate_immutable: "An issued certificate cannot be changed.",
  invalid_rubric: "The rubric is not valid (unique keys, 2–60 character labels, points between 1 and 1000).",
};

/** Notification pages (used by lib/notification-text.js): a course id is only ever put in a path after it is checked to be a uuid. */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
