# UniSphere Academy

Courses, guided programs and project internships, with mentor grading, payments and certificates anyone can verify. It is part of
UniSphere, not a separate product: same accounts, same profile, same notifications and settings, same admin console.

## Where things live

| What | Where |
| --- | --- |
| Public site (home, catalogue, course pages, pricing, mentorship, certificate checks) | `/academy`, own black/white-and-green look (`app/academy/`) |
| A student's pages (overview, my learning, lessons, assignments, certificates, payments, checkout) | inside the normal member app: `/academy/dashboard`, `/academy/learn/<id>` ... (`app/(member)/(app)/academy/`) |
| Certificate name and what a verification page shows | Settings, Academy (`/settings/academy`) |
| Staff | the existing admin console: Admin, Academy group (`/admin/academy/...`) |
| Legal | the shared Terms, Privacy and Refund pages, each with an Academy section (`lib/content/legal.js`, `commerce.js`) |

## Roles and permissions

Academy roles are platform-wide and use the existing role system (`user_roles`, `role_permissions`, `has_permission`). Granted in
Admin, Staff & roles, by a global administrator.

| Role | Can |
| --- | --- |
| Global admin, Academy administrator | everything below |
| Course manager | courses, curriculum, publishing, live classes, announcements, view students. **No prices, no payments** |
| Finance manager | prices, coupons, orders, refunds, exports. **Cannot issue certificates** |
| Mentor | grade work in the courses they are assigned to (mentor and the `academy.assignments.review` permission). **No payment access** |
| Academy support | view students, post announcements |

Permissions are `academy.*` (see migration 0065). Prices and publication are enforced by database triggers, not only by the pages.

## The money path

Prices are integers in paise. The database is the only place a price is worked out (`_academy_quote`, migration 0067):

1. list price, 2. the lowest valid scheduled price, 3. a coupon (validated against the amount after step 2; percentages round half up; a cap),
4. tax from settings (none, inclusive, exclusive), 5. total. Sales and coupons stack only if the global setting and the coupon allow it.

Checkout (`academy_create_order`) takes a course, a cohort and a coupon **code**; the browser never sends an amount. The coupon row is
locked while the order is created, so the last redemption goes to one buyer. An order keeps a snapshot and cannot be edited afterwards.

Payment uses the same gateway adapter as the blue tick (`docs/PAYMENTS.md`). A payment counts only after the gateway is asked about it,
and the database re-checks amount and currency (`academy_fulfil_order`); the webhook and the return page both end there and are
idempotent. A second payment for a course the student already holds is refunded automatically. Refunds are a decision (student request,
finance approval) followed by the gateway moving the money; an order is marked refunded only after the gateway accepts it.

## Certificates

* A template is an uploaded PDF plus fields (text with `{{variables}}`, a QR code). The PDF is **never edited**: fields are drawn over its
  pages when a certificate is made (`lib/academy/cert-pdf.js`, pdf-lib). Fonts are the standard PDF fonts, so names must be in Latin letters
  (students can set a certificate name in Settings, Academy). Annotations in an uploaded file are dropped.
* A version is immutable once active; every certificate records the version used and a snapshot of the data at issue time.
* IDs look like `US-2026-WD-00142`, come from a database sequence, are unique, never reused and never client-supplied.
* Issue is two steps with the PDF between them (`academy_begin_certificate`, then `academy_finish_certificate`); a failed drawing leaves a
  `failed` certificate that can be retried. A correction creates a new certificate that points to the old one, which is marked replaced.
* The public check (`academy_verify_certificate`, callable by visitors) returns approved fields only. Score and project link appear only if
  the holder switched them on. A certificate cannot be issued until the student agreed to public verification.
* Certificate PDFs are stored privately and served through `/api/academy/certificates/<id>/pdf` after an access check.

## Delivery, syllabus, timetable and instructor (2.9.0)

* **How it is taught:** each course is *Recorded*, *Live* or *Live + recorded* (`delivery_mode`). It shows as a chip on the course page and cards, and the catalogue can filter by live classes.
* **Syllabus (Markdown)** is the written overview (`syllabus_md`); the lesson-by-lesson **Curriculum** is still built separately.
* **Timetable** is typed one slot per line (`Mon | 19:00-20:30 | Topic`, India time), stored as rows and shown as a table. The database re-checks every row, so a hand-made request cannot store anything else.
* **About the instructor:** photo (a copy of the mentor's own UniSphere profile picture, taken when you save the mentor), bio up to 1500 characters, expertise, years of experience and https links. The public page never reads a member profile.
* **Cover image:** Admin, Academy, Courses, open a course, Details tab, *Upload cover image* (needs Cloudflare R2). Without one a drawn cover is used.

## Offers that apply by themselves (2.9.0)

* A **scheduled price** (Pricing, price rules) already applies between its dates. It now also reports the real end time and, when a seat limit is set at that price, the real number left.
* An **automatic coupon** (tick *Apply automatically* on a coupon and give it a public name such as "Welcome offer") applies to signed-in students who qualify, with no code to type. It goes through exactly the same checks as a typed code (dates, courses, first purchase, per-person and total limits, minimum spend, stacking), is locked at checkout so the last use cannot be taken twice, and the best one wins. A code the student types replaces it; they never add up. Visitors are told an offer exists, not what it is worth to them.
* The page shows a live countdown (from the real end date), "Only N left at this price" (from the real count, only when 20 or fewer remain) and the amount saved. A **party popper** plays once per offer per browser session, never with reduced-motion on. Nothing on the page is a number someone typed in to create urgency.

## Mail, Google sign-in and live classes (2.9.0)

* Academy receipts and Academy-only notification emails come from `ACADEMY_EMAIL_FROM` (docs/EMAIL.md).
* Continue with Google, and live classes on Google Calendar + Meet: docs/GOOGLE.md.

## The learning pipeline (2.10.0)

What happens by itself, who sees what, and where.

| Moment | What happens | Who is told | Where it shows |
|---|---|---|---|
| A mentor is added to a course | Notification | The mentor | Teaching |
| A student enrols | Notification (and Google invitations are refreshed) | The course's mentors | Teaching, New students |
| A class is scheduled, moved or cancelled | Notification; Google Calendar event follows | Enrolled students, the instructor, the course's mentors | Student: Overview, Schedule; Teacher: Teaching |
| An hour before a class | Reminder | Students (24 h and 1 h) and the instructor (1 h) | Bell, push, email |
| A class starts | Status becomes **live** by itself; "is live now" notification | Everyone above | Overview card "Live now" with **Join now** |
| A class ends | Status becomes **completed** by itself | | Recent classes, with how many joined |
| A student presses Join | The join is counted, the meeting opens | | Teaching: "n of m joined" (it cannot see inside Google Meet) |
| A student hands in work | Notification | The course's mentors | Teaching, Work waiting |
| A student meets every certificate rule | The certificate is issued by itself (needs R2 and a design) | The student | Certificates; the worker issues up to 5 per run |

* **Student pages:** Overview (live now card, classes, deadlines, certificates coming up), **Schedule** (weekly timetable of their courses, dated classes and deadlines for the week, "Add to my calendar" .ics), Certificates (a checklist of what is left, each line from the same check the database uses).
* **Instructor page:** Academy, **Teaching** (appears only for active mentors): next class with Join, upcoming classes with how many students are expected, work waiting, courses with student counts, new students, recent classes.
* **Admin:** every course starts with a **checklist** (price, lessons, instructor, live class or timetable, certificate design, cover) saying what to do next. The live-class form has no status to type: it goes live and finishes by the clock; the only thing chosen by hand is *Cancel this class*. Forms are grouped under plain headings, and the web address fills in from the title.
* **Settings:** *Issue certificates automatically* (default on). Turn it off to issue every certificate by hand.
* **Where it runs:** `academy_advance_sessions()` and the automatic certificate issuing run in the cron tick (`academyHousekeeping`). Without something calling `/api/cron/tick` every few minutes, statuses and automatic certificates lag. Pages refresh themselves every minute while open.

## Notifications

Category **Academy** (own In app / Push / Email switches). Types: `academy_enrolled`, `academy_payment`, `academy_refund`,
`academy_live_reminder`, `academy_live_scheduled`, `academy_live_started`, `academy_assignment_due`, `academy_feedback`, `academy_completed`, `academy_certificate`,
`academy_announcement`, and for the people who teach: `academy_mentor_assigned`, `academy_submission_received`, `academy_student_enrolled`. All go through `notify()`. Reminders and expired-order clean-up run in the worker tick
(`academyHousekeeping`), each reminder once (`academy_reminders_sent`). See `docs/NOTIFICATIONS.md`.

## Setup checklist (what is code, what is yours)

Implemented and tested: everything above. **Needs you:**

1. Apply migrations 0065 to 0077 (`supabase db push --linked`).
2. Connect a payment gateway (`PAYMENT_GATEWAY` and keys, docs/PAYMENTS.md) and test it in the gateway's test mode. The Academy cannot sell until
   this works and Admin, Academy, Settings, "Paid enrolment is open" is on. The webhook address is the existing `/api/payments/webhook`.
3. File storage (Cloudflare R2) must be configured for uploads, templates and certificate PDFs.
4. In Academy settings: support email, issuing organisation, tax (only with your accountant's advice; nothing is assumed) and refund window.
5. Create a certificate template (upload a PDF, place fields, test, activate) and set a default.
6. Add mentors (Admin, Academy, Mentors) and give them the Mentor role.
7. Live classes: either paste a link from any meeting service, or connect a Google account (docs/GOOGLE.md) and tick *Create a Google Meet and invite enrolled students by email* on the class.
8. Have the Terms, Privacy and Refund text reviewed by a lawyer. The Academy sections describe what the software does; they are not legal advice.
9. Replace the grey placeholder pictures in `public/academy/` (`node scripts/academy-placeholders.mjs` redraws them).

## Known limits

* Currency is INR only (the payment layer). Installments, bundles and subscriptions are not built; the data model does not block them.
* Certificate text uses standard PDF fonts: no Devanagari or other scripts.
* Video lessons embed YouTube or Vimeo only (the page policy frames just those hosts).
* A payment that arrives after an unpaid order expired is still honoured (the money is real), which can exceed a seat limit by that order.
* Verification IDs are sequential, as specified. Checks are rate limited per address and show nothing beyond the approved fields.
* Not yet covered by browser end-to-end tests: the lesson player, checkout against a live gateway, the template editor's drag interactions.

## Tests

`npm run test:unit` (pricing display, offers, certificate drawing, forms, notifications, routes, mail, Google, class stages and the student's week) and the browser test `tests/e2e/academy-pipeline.spec.js` and
`npx vitest run --project integration tests/integration/academy.test.js` (pricing engine, coupon race, payment settlement and refunds,
grading, access rules, certificates and verification, against a real database).

## Retention

Learning data goes with the account. Orders and payments stay without the buyer's name (`academy_erase_user`); issued certificates stay
valid with the name withdrawn. Recordings expire after the retention setting. Owner decides financial-record retention periods.
