# Security

How UniSphere protects members, what it deliberately does not do, and what to review before and after launch.

## Reporting a vulnerability

Email the support address shown on the Contact page with "Security" in the subject. Do not open a public issue for a
vulnerability. Please include steps to reproduce; do not access data that is not yours.

## Layers

| Layer | What it does | Where |
| --- | --- | --- |
| **Row Level Security** | Every table denies by default; policies allow exactly what a role may read or write. Anonymous, member, staff and service roles are tested separately | `supabase/migrations/*`, `tests/integration/*` (130+ tests with real JWTs) |
| **Least privilege grants** | Default privileges are revoked; each table gets explicit column-level grants, so trust fields (status, verification, counters) cannot be changed by users | migrations 0001 to 0005 |
| **Definer functions** | Privileged actions are `SECURITY DEFINER` functions with `set search_path = ''`, re-checking the caller's permission for the record's *own* college | `has_permission`, `resolve_report`, `moderate_user`, … |
| **Private network, open registration** | Logged-out visitors can read only public settings and feature flags (the college directory is members-only too); every member-content table and view is ungranted to the anonymous role. Suspended and deactivated accounts are refused by the visibility functions themselves (`can_use_network`), so a direct API call gets nothing either | migrations 0017, 0018 |
| **College directory abuse controls** | Creating a college is a database function (never a table insert): name validation (no links or markup), normalised duplicate detection under an advisory lock plus a unique index, a per-member daily ceiling, a per-member hourly rate limit in the app, and a moderated report queue. Members cannot edit listings or mark them verified | migration 0018 |
| **Functions closed by default** | `EXECUTE` is no longer granted to `PUBLIC`; each function is granted explicitly, and anonymous visitors get a five-function allow-list (username check, permission/flag helpers) | migration 0017 |
| **Roles are never inferred** | No role is granted from an email domain, a student ID or a request: only another administrator grants roles, and the grant is audited | `grant_role` |
| **Audit log** | Append-only (trigger blocks update, delete and truncate for everyone). Secrets and message text are scrubbed before storage | `audit_logs`, `write_audit_log` |
| **Content Security Policy** | Per-request nonce, `strict-dynamic`, no `unsafe-eval` in production, no third-party origins, `frame-ancestors 'none'` | `proxy.js`, `lib/security/csp.js` |
| **Other headers** | HSTS (production), `nosniff`, `X-Frame-Options: DENY`, strict referrer policy, restrictive Permissions-Policy, COOP same-origin | `next.config.mjs` |
| **Input validation** | Every Server Action and route validates with Zod; text is rendered as React text nodes (no HTML); Markdown from admins is rendered without raw HTML | `lib/validators/*` |
| **Uploads** | Server-relay: size limit, magic-byte type sniffing (the browser's MIME is never trusted), private bucket by default, short-lived signed URLs | `lib/storage/*` |
| **Rate limiting** | Redis fixed windows per user and per IP for auth, writes, search, uploads, AI, student-ID attempts, feedback; runtime-tunable | `lib/rate-limit.js` |
| **Session** | Supabase Auth (JWT in HTTP-only cookies), refreshed in the proxy; claims are verified, not decoded blindly | `lib/supabase/proxy.js` |
| **CSRF** | Server Actions are same-origin by construction; JSON endpoints that use cookies check `Origin` and require JSON bodies | `app/api/push/subscribe` |
| **Secrets** | Only `NEXT_PUBLIC_*` reach the browser. The service-role client is `server-only` and used after an explicit permission check | `lib/supabase/admin.js` |
| **Job endpoint** | `/api/cron/tick` refuses everything without `CRON_SECRET` (constant-time compare), accepted as a Bearer header or, for monitors that cannot send headers, `?secret=` | `app/api/cron/tick/route.js` |

## Privacy decisions worth knowing

- **Student IDs** are never stored. They are normalised in memory, keyed-hashed (HMAC-SHA256 with `APP_SECRET`) and
  compared; the database keeps only the hash and the last three characters. Even administrators cannot read an ID back.
  Entries can be claimed once; wrong attempts are limited (5 per 24 hours per account, plus per-hour rate limits).
- **AI**: prompts and replies are not stored (only task name, timing, token counts, outcome). Private, connections-only
  and community posts are never sent to a provider; college-visible text only if an administrator allows it. Each member
  can switch AI assistance off. See [AI.md](AI.md).
- **Messages** are not readable from the admin console. A *report* about a message stores a snapshot for moderators.
- **Nothing is indexable.** The sitemap lists only the home, about, features, guidelines, contact, privacy and terms pages;
  `robots.txt` disallows everything else; member pages are `noindex`; there are no public social previews of member content.
- **Push** lock-screen text never contains message bodies.
- **Analytics** are first-party counts; there are no third-party trackers, ad SDKs or analytics scripts.
- **Data subject rights**: export (Settings → Security), deletion with a 14-day grace period.

## Known limits (be honest with users and reviewers)

- The CSP allows inline *styles* (`style-src 'unsafe-inline'`) because the UI library injects styles at runtime and charts
  use style attributes. Scripts are strict, which is the part that blocks XSS.
- Redis-backed rate limits are per-IP and per-account; a distributed attacker with many IPs is only slowed. Put Cloudflare
  or another edge in front for volumetric protection.
- Student IDs are a shared-secret check, not an identity proof: someone who learns another student's ID can claim it
  first. Staff can **Release** a wrongly held ID and the real owner can claim it; the audit log shows who held it.
- Email addresses are visible to administrators with `users.view` (needed for support). Restrict that role.
- Account recovery depends on email access. There is no SMS or authenticator-app second factor yet.
- The service worker never caches signed-in pages, so nothing private is left on a shared computer; that also means no
  offline reading.

## Pre-launch review checklist

- [ ] `APP_SECRET`, `CRON_SECRET`, `SUPABASE_SECRET_KEY` set, unique, stored in a password manager, not in git
- [ ] Supabase: email confirmation on, redirect URLs limited to your domain, leaked-password protection on if available
- [ ] RLS: run `npm run test:rls` against a staging database after the final migration
- [ ] Only the intended people hold `global_admin` (Admin → Staff & roles); at least two
- [ ] R2 private bucket has no public access; the public bucket contains only avatars and banners
- [ ] HTTPS only; HSTS reviewed before adding `preload`
- [ ] Resend domain verified (SPF, DKIM, DMARC at least `p=none`)
- [ ] Backups restored once successfully
- [ ] `npm audit --omit=dev` reviewed; dependencies updated
- [ ] Privacy policy and terms reviewed by the college; contact/support address monitored

## Dependency and release hygiene

Run `npm audit --omit=dev` and update regularly. `package-lock.json` is committed; builds use `npm ci`. Review
migrations like code: any new table needs RLS enabled and explicit grants, and any new definer function needs
`set search_path = ''` and a permission check, with a test in `tests/integration`.
