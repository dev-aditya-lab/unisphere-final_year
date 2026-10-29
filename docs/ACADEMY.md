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

## Notifications

Category **Academy** (own In app / Push / Email switches). Types: `academy_enrolled`, `academy_payment`, `academy_refund`,
`academy_live_reminder`, `academy_assignment_due`, `academy_feedback`, `academy_completed`, `academy_certificate`,
`academy_announcement`. All go through `notify()`. Reminders and expired-order clean-up run in the worker tick
(`academyHousekeeping`), each reminder once (`academy_reminders_sent`). See `docs/NOTIFICATIONS.md`.

## Setup checklist (what is code, what is yours)

Implemented and tested: everything above. **Needs you:**

1. Apply migrations 0065 to 0069 (`supabase db push --linked`).
2. Connect a payment gateway (`PAYMENT_GATEWAY` and keys, docs/PAYMENTS.md) and test it in the gateway's test mode. The Academy cannot sell until
   this works and Admin, Academy, Settings, "Paid enrolment is open" is on. The webhook address is the existing `/api/payments/webhook`.
3. File storage (Cloudflare R2) must be configured for uploads, templates and certificate PDFs.
4. In Academy settings: support email, issuing organisation, tax (only with your accountant's advice; nothing is assumed) and refund window.
5. Create a certificate template (upload a PDF, place fields, test, activate) and set a default.
6. Add mentors (Admin, Academy, Mentors) and give them the Mentor role.
7. Live classes use a meeting link you paste (Google Meet or similar). The Academy does **not** create meetings.
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

`npm run test:unit` (pricing display, certificate drawing, forms, notifications, routes) and
`npx vitest run --project integration tests/integration/academy.test.js` (pricing engine, coupon race, payment settlement and refunds,
grading, access rules, certificates and verification, against a real database).

## Retention

Learning data goes with the account. Orders and payments stay without the buyer's name (`academy_erase_user`); issued certificates stay
valid with the name withdrawn. Recordings expire after the retention setting. Owner decides financial-record retention periods.
