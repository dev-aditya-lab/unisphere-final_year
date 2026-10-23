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
| **Roles are never inferred** | No role is granted from an email domain or a request: only another administrator grants roles, and the grant is audited | `grant_role` |
| **Audit log** | Append-only (trigger blocks update, delete and truncate for everyone). Secrets and message text are scrubbed before storage | `audit_logs`, `write_audit_log` |
| **Content Security Policy** | Per-request nonce, `strict-dynamic`, no `unsafe-eval` in production, no third-party origins, `frame-ancestors 'none'` | `proxy.js`, `lib/security/csp.js` |
| **Other headers** | HSTS (production), `nosniff`, `X-Frame-Options: DENY`, strict referrer policy, restrictive Permissions-Policy, COOP same-origin | `next.config.mjs` |
| **Input validation** | Every Server Action and route validates with Zod; text is rendered as React text nodes (no HTML); Markdown from admins is rendered without raw HTML | `lib/validators/*` |
| **Uploads** | Server-relay: body size refused from headers, size limit, magic-byte type sniffing, then the image is actually decoded (truncated/polyglot files and decompression bombs are refused, EXIF/GPS is stripped); PDFs go to an optional scanning service; private bucket by default, short-lived signed URLs; names are generated server-side | `lib/storage/*`, `app/api/upload` |
| **Rate limiting** | Redis fixed windows per user and per IP for auth, writes, search, uploads, AI, feedback; runtime-tunable. The IP is the address the trusted proxy appended (`TRUSTED_PROXY_HOPS`), never the client-supplied left-most `X-Forwarded-For` entry | `lib/rate-limit.js` |
| **Session** | Supabase Auth, refreshed in the proxy; claims are verified, not decoded blindly. The cookie is `SameSite=Lax`, `Secure` on https and **not HttpOnly** (the browser client reads the session for Realtime); the strict script CSP is what protects it | `lib/supabase/proxy.js`, `lib/supabase/cookie-options.js` |
| **CSRF** | Server Actions are same-origin by construction; JSON endpoints that use cookies check `Origin` and require JSON bodies | `app/api/push/subscribe` |
| **Push endpoints** | Only real browser push services are accepted (and called): an arbitrary https address would let a member make the server request internal URLs | `lib/push-endpoint.js` |
| **Link columns** | Database CHECK constraints: http(s) only, so a `javascript:` value cannot be stored even through a direct API call | migration 0049 |
| **Secrets** | Only `NEXT_PUBLIC_*` reach the browser. The service-role client is `server-only` and used after an explicit permission check | `lib/supabase/admin.js` |
| **Job endpoint** | `/api/cron/tick` refuses everything without `CRON_SECRET` (constant-time compare), accepted as a Bearer header or, for monitors that cannot send headers, `?secret=` | `app/api/cron/tick/route.js` |

## Rate limiting

Per-IP limits trust only the address a proxy **you run or rent** appended to `X-Forwarded-For`, counted from the right.
Set `TRUSTED_PROXY_HOPS` to the number of such proxies: `1` (default) for Vercel, Render or Caddy/Nginx, `2` with
Cloudflare in front of one of those. Too low lumps visitors behind one address together; too high lets a client choose its
own identity. Verify after deploying: log `getClientIp()` once for a request from your own phone and check it is your address.
Limits live in `system_settings.rate_limits` (auth, write, search, upload, AI) and in the call sites (`grep enforceRateLimit`).
Without `REDIS_URL` limits are per server process, which is not a global limit on a multi-instance deployment.

## Reporting what was audited

The 2026-10-21 audit, its findings, what was fixed and what could not be verified are in [security-audit.md](security-audit.md).

## Privacy decisions worth knowing

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
- Email addresses are visible to administrators with `users.view` (needed for support). Restrict that role.
- Account recovery depends on email access. There is no SMS or authenticator-app second factor yet.
- Uploaded PDFs are validated (magic bytes) but only scanned when `UPLOAD_SCAN_URL` points at a scanning service; none ships with the app. PDFs open inline from the storage domain (a different origin from the app).
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
- [ ] `npm audit --omit=dev` reviewed; dependencies updated (the framework's security releases are announced on nextjs.org/blog; `npm audit` can lag them)
- [ ] `TRUSTED_PROXY_HOPS` matches the real proxy chain (see Rate limiting)
- [ ] Privacy policy and terms reviewed by the college; contact/support address monitored

## Dependency and release hygiene

Run `npm audit --omit=dev` and update regularly. `package-lock.json` is committed; builds use `npm ci`. Review
migrations like code: any new table needs RLS enabled and explicit grants, and any new definer function needs
`set search_path = ''` and a permission check, with a test in `tests/integration`.

## Community spaces (2.3.0)

Authorisation lives in SQL (`community_can`, `can_view_channel`, `channel_post_state`) and every write is a `SECURITY DEFINER` function that checks `auth.uid()` itself; the
tables are read-only for members. Findings fixed: unchecked community picture keys, banned and pending members listable by any member, direct-message attachments readable after
deletion. Invitation codes are stored as hashes, shown once, and every failure answers identically. Reports are visible only to staff who outrank the reported person, and
platform staff see escalated reports only. See docs/COMMUNITIES.md for the full list, the tests that prove it, and the remaining risks.
