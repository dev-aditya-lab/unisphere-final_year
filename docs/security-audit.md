# Security audit, 2026-10-21

> **Update, 2026-10-27:** the payment integration this audit examined was a single named gateway. It has since been made
> gateway-neutral (`docs/PAYMENTS.md`): the same controls (signature over the raw body, constant-time compare, 256 KB cap, no
> secret = 503, amounts and orders re-checked with the gateway, exactly-once settlement) now live in `lib/payments/gateway.js`,
> `app/api/payments/webhook/route.js` and `tests/unit/payment-webhook-route.test.js`, and the checkout no longer loads any
> third-party script. The findings below describe the code as audited and are otherwise unchanged.

Scope: the repository at commit `299c4b9` plus the changes listed here (not yet committed). Environment: a local Docker
Supabase stack (all 49 migrations), a production build (`next build`, `next start -p 3100`) with R2 and Redis switched
off, Node 24. **No live domain, Cloudflare dashboard, Supabase dashboard, Vercel/Render setting or provider webhook was
accessible; everything about them is marked NOT VERIFIED.** No scanner (Semgrep, CodeQL, Gitleaks) was installed, so none
was run; a pattern search of the working tree and all 40 commits for key-shaped strings stood in for a secret scan (no hits
other than placeholders in `.env.example` and docs).

Status words: **PASS** (checked, evidence below), **FIXED** (a defect existed, now fixed and tested), **PARTIAL**,
**NOT VERIFIED** (could not be inspected from here), **N/A**.

## 1. Launch blockers (in order)

1. **Deploy the framework security release.** Next.js 16.4.0 was affected by the 2026-10-14 advisories (a denial of service
   through Server Actions, which this app uses everywhere; two critical remote-code-execution issues in features this app
   does not use, `use cache` and SVG image optimisation). `npm audit` did **not** report them. Now on `next@16.4.2`,
   `react@19.3.1`. Anything running the old build must be redeployed. (FIXED in the repo; **deployment is yours**.)
2. ~~Apply migrations 0036 to 0049~~ Verified on 2026-10-22: all of 0001 to 0049 are already applied on the remote. **Migration 0050 (settings guardrails, below) is new and local only.**
3. **Set `TRUSTED_PROXY_HOPS` to match your hosting** and check it (see SECURITY.md, Rate limiting). Until you do, the default
   `1` is used.
4. **Check R2 and Cloudflare in the dashboard** (section 9): private bucket has no public access or custom domain, public
   bucket holds only avatars/covers/banners/badges, CORS lists only your origin (or is empty, since uploads are relayed).
5. Redis (`REDIS_URL`) must be set in production, otherwise rate limits are per process.

None of the findings below is a known actively exploitable unauthenticated hole; the framework advisory is the only one rated
critical/high, and part of it needs features you do not use.

## 2. Findings

| # | Severity | Finding | Evidence | Status |
| --- | --- | --- | --- | --- |
| F1 | High | Next.js 16.4.0 / React 19.3.0 affected by the Oct 14 2026 security release (Server Action DoS GHSA-p3m5-59mp-jv5r; others not reachable here). `npm audit` reports 0 | nextjs.org advisory; `npm ls` | FIXED: `next@16.4.2`, `react`/`react-dom@19.3.1`, `eslint-config-next@16.4.2`; build, lint, tests re-run |
| F2 | Medium | Web Push endpoint accepted any `https://` address and the worker POSTs to it: a member could make the server call internal addresses (SSRF, blind) | `lib/services/push.js` (before); unit + e2e tests with 169.254.169.254, localhost, 10.x, look-alike hosts | FIXED: allow-list of browser push services, checked on save and on every delivery; old rows with other hosts are deleted |
| F3 | Medium | Per-IP rate limits (login, register, reset, contact...) used the **left-most** `X-Forwarded-For` entry. Render appends to a client-supplied header, so a client could rotate it and never hit an IP limit (password spraying across many emails) | `lib/rate-limit.js` (before); Render support statement and community reports; unit tests | FIXED: address counted from the right (`TRUSTED_PROXY_HOPS`, default 1). Depends on you setting it correctly (blocker 3) |
| F4 | Medium | Relationship helpers `are_connected(a, b)` / `is_blocked_between(a, b)` were callable by any member for **any** two members: an oracle for who is connected to, or has blocked, whom | DB call as member A about B and C returned `true` | FIXED (migration 0049): the caller must be one of the pair; service role/triggers unaffected; integration test fails against the old function |
| F5 | Low-Medium | Link columns (profile links, achievements, project/event/opportunity/college URLs) had no database constraint; the app validates, but the API can be called directly, so `javascript:` / `data:` values could be stored and rendered as `href`. The strict CSP (no `unsafe-inline` scripts) blocks execution in current browsers, so this was defence in depth | direct `profiles.update` with `javascript:` succeeded before | FIXED (0049): http(s) only, 2048 chars, nine columns; tested against the old schema |
| F6 | Low-Medium | Keyset cursor from the URL (`/u/<name>?ts=&id=`) was interpolated unvalidated into a PostgREST `.or(...)` filter. Always ANDed with the author and status filters and RLS, so no data from other members was reachable, but the filter grammar could be altered (errors, odd queries) | `app/(member)/(content)/u/[username]/page.js` (before) | FIXED: `lib/cursor.js` requires a timestamp and a UUID; used by the profile page, notifications and posts services; 10 tests |
| F7 | Low | iCalendar export escaped `\r\n` and `\n` but not a lone `\r`, NEL or U+2028/9: a member's event title could inject calendar properties into the `.ics` other members download | `calendar.ics/route.js` (before) | FIXED: `lib/ics.js`, tested with every break character |
| F8 | Low | Uploads: magic bytes only. A file starting like a JPEG but not an image, a truncated file, or a decompression bomb was accepted; EXIF/GPS kept if the upload bypassed our editor; `sharp` was a devDependency but used at runtime | `lib/storage/uploads.js` (before) | FIXED: `inspectImage` decodes the image, caps 50 megapixels, checks format = claimed type, strips metadata; `sharp` is now a dependency; 12 tests incl. bomb and polyglot |
| F9 | Low | `/api/upload` read a request body of any declared size before checking it | route (before) | FIXED: 413 from `Content-Length` over 12 MB; Next's own proxy buffer set to the same ceiling. A chunked body without a length is still bounded by that buffer (verified with a 13 MB upload over HTTP) |
| F10 | Low | `/api/health?deep=1` (unauthenticated) listed which providers are configured (Redis, storage, email, push, AI) and hit the database on every call | route (before) | FIXED: anonymous callers get the database result only; details need the cron secret; 30 calls/min/IP |
| F11 | Low | Public images stored the uploader's original file name (often a person's name) in a row readable by every member | `files.original_name` | FIXED: not stored for public purposes |
| F12 | Low | Two counter-refresh functions executable by every member (cheap load amplification on a popular post) | `has_function_privilege` | FIXED (0049): revoked; only the triggers need them |
| F13 | Info | `docs/SECURITY.md` said session cookies were HTTP-only. They are not (the browser client needs them for Realtime) | `lib/supabase/cookie-options.js` | Doc corrected. Accepted risk: protected by the strict script CSP; moving the session server-side would change the messaging design |
| F14 | Info | `langchain` (umbrella package with the LangGraph tree) was installed but never imported (only `@langchain/groq`) | grep, `npm ls` | FIXED: removed (about 145 lock lines fewer) |
| F15 | Info | `braces` (via the lint chain `eslint-config-next` > `fast-glob` > `micromatch`) has an open high advisory (GHSA-vfj7-8cjw-p6xm, regex DoS); **no fixed version exists** (3.0.3 is latest). Dev-only, never shipped, input is our own glob patterns | `npm audit` | Accepted; `npm audit --omit=dev` = 0; CI audits production dependencies only |
| F16 | Info | `/api/cron/tick` also accepts the secret as `?secret=` (documented, for UptimeRobot): URLs get logged | route | Accepted and documented; the account-deleting `erasure-replay` endpoint is header-only (tested). Rotate the secret if a URL leaks |
| F17 | Info | `/api/media/[...key]?proxy=1` trusts the upstream `Content-Length` for its 8 MB cap | route | Accepted: the upstream is our own signed R2 URL |

## 3. Checklist by phase

**Phase 1, discovery and threat model: PASS.** Inventory: 22 route handlers, ~150 pages/layouts, 24 server-action modules, 97
tables, 238 member-callable definer functions, 9 upload purposes, one webhook (payment gateway), two job endpoints. Actors considered:
anonymous, member, member vs member, compromised staff, forged webhook, hostile file, AI abuse, supply chain, public storage,
scraping/spam. The findings table is the output.

**Phase 2, authentication and API authorisation: PASS** (after F2/F3/F6). Every route handler classified: public (`health`,
`llms.txt`, `robots`, `sitemap`, `.well-known`), webhook (payment gateway), job (cron, bearer), session (all others, 401 without
one; verified over HTTP: 17 requests). Server actions call `requireProfile`; privileged actions are re-checked in the
database; permanent deletion also needs the administrator's password. IDOR: with two real members over HTTP, a stranger got
404 for another member's conversation (read and write), inbox, and private file; admin exports returned 401/403/404
(`tests/e2e/security.spec.js`). Open redirects: `safeNext`/relative redirects verified for `//evil`, absolute URLs.
Impersonation/account switching: none exists. Not tested: cross-tenant checks for every page (covered by 130+ RLS tests).

**Phase 3, RLS: PASS.** All 97 public tables have RLS; 8 server-only tables have RLS and no policies (deny all); anon has table
grants on three tables only (settings, flags, notice versions); every authenticated write path has an own-row or permission
policy; reward and moderation columns have no member write grant; every definer function has a fixed `search_path`; anon can
execute 5 functions. New permanent test calls **every** staff-named function (more than 60) with 3 argument sets as an ordinary
member and requires an error or an empty list; a logged-out visitor cannot call any. Storage policies: files are in R2, not
Supabase Storage; access is the `files` RLS policies (N/A for Supabase Storage buckets).

**Phase 4, input validation and injection: PASS.** Zod on every action and route; user text rendered as React text nodes
(no `dangerouslySetInnerHTML` except the nonce'd theme script and JSON-LD with `<` escaped); Markdown via `react-markdown`
with `skipHtml`; PostgREST filters built only from validated cursors/UUIDs; `ilike` input escaped; no `eval`/child-process in
app code; hostile-input timing tests for the tokenizer (no ReDoS). Added: F6, F7, F5. SQL injection: no string-built SQL in
app code (Supabase client and RPC parameters only).

**Phase 5, rate limiting: PASS with caveats.** About 75 call sites (auth, signup, reset, resend, contact, search, posts,
comments, reactions, messages, uploads, AI, exports, admin actions, Orbits claims, payments). Fixed windows in Redis, in-memory
fallback; reward claims are idempotent in the database (unique keys). Limits are listed by `grep enforceRateLimit` and
`system_settings.rate_limits` (runtime-tunable); they are per user and per IP and deliberately generous for shared networks
(register 8/h/IP, login 10/5 min/IP and 6/5 min/email, upload 20/5 min, message 30/min). Caveats: needs Redis in production
(blocker 5); IP identity depends on `TRUSTED_PROXY_HOPS`; volumetric attacks need an edge (Cloudflare) rule, not app code.
`startConversationAction`, `loadFeedAction` and `repost` have no dedicated limit (bounded queries/RLS; low risk).

**Phase 6, uploads: FIXED / PARTIAL.** Allow-list: JPEG, PNG, WebP (+ PDF for chat and ID documents); no SVG/HTML accepted;
server-generated keys `purpose/<user>/<uuid>.<ext>`; metadata stripped; decode check; size and pixel caps; failed uploads
marked deleted; orphan sweep exists. **Malware scanning: no engine ships.** `lib/storage/scan.js` is the integration boundary
(`UPLOAD_SCAN_URL`, fails closed). Without it PDFs are validated, not scanned. Not tested end to end here: R2 was off, so
the full path through `uploadFile` to storage was not exercised (the pieces are unit-tested; the route's size/origin/auth
gates were tested over HTTP).

**Phase 7, private storage and R2: PARTIAL / NOT VERIFIED.** Code: private files only via `/api/files/<id>` (RLS, then a 2 min
signed URL, `private` cache headers; non-image documents `no-store`); public purposes cached `immutable` only because keys are
never rewritten; deleted objects removed. Tested: a stranger gets 404 for another member's file. **NOT VERIFIED:** the actual
bucket public-access setting, custom domain/cache rules, and R2 CORS (the app needs none, uploads are relayed).

**Phase 8, CORS/CSRF/HTTPS/headers: PASS (code) / NOT VERIFIED (edge).** No CORS headers anywhere (searched; a preflight
returned no `Access-Control-*`). CSRF: server actions use Next's origin check; cookie-authenticated routes check `Origin`/
`Referer` (cross-origin upload and push tests return 403); cookies `SameSite=Lax`, `Secure` on https. Headers on a production
build, every route: CSP with per-request nonce, `strict-dynamic`, no `unsafe-eval`/`unsafe-inline` for scripts,
`frame-ancestors 'none'`, `object-src 'none'`, `form-action 'self'`; HSTS (2 years, includeSubDomains, no preload),
`nosniff`, `X-Frame-Options: DENY`, strict referrer policy, Permissions-Policy, COOP; private responses `no-store`. Known
trade-off: `style-src 'unsafe-inline'`. HTTPS at the domain/CDN level and trusted-proxy behaviour: NOT VERIFIED.

**Phase 9, admin security and audit log: PASS.** Permission checks in the database for every admin function (sweep above);
role grants audited and impossible for the grantee; audit log append-only (trigger) with secrets scrubbed; destructive
deletion needs the admin's password and a typed confirmation. Not tested: a compromised global administrator (by design they
can do everything; keep two, use strong passwords; no second factor exists yet).

**Phase 10, webhooks and jobs: PASS.** Payment gateway webhook: HMAC over the raw body, constant-time compare, 256 KB cap, no secret = 503,
missing/wrong/malformed signature = 401 and the handler never runs (8 route tests); payment amount, currency and order are
re-checked and the payment is read back from the gateway; settlement is exactly-once in the database (replayed payment = one
application; amount mismatch refused; members cannot call the functions). The gateway sent no timestamp, so replay protection is
idempotency, not time windows. Cron: bearer secret in constant time; header-only on the account-erasure endpoint (5 tests).
**NOT VERIFIED:** the live webhook secret and the payment gateway's dashboard configuration.

**Phase 11, production configuration: PASS.** No `console.log`; errors to users are generic (database errors mapped, digest
shown, no stack); `productionBrowserSourceMaps: false`, `poweredByHeader: false`; the production build has no browser
source map (one empty 53-byte placeholder from the bundler); scanning the client bundle for every secret-like value in
`.env.local` and the local stack found only public values (publishable key, URLs); the only server variable name in client
code is help text. No debug/test routes. `scripts/seed-demo.mjs` carries a fixed demo password (development only; never run
it against production). The Android signing keystore sits untracked in `playstore/` (git-ignored, never committed): back it up.

**Phase 12, dependencies: PASS with one accepted item.** `npm audit --omit=dev`: 0. `npm audit`: 5 high, all the dev-only
`braces` chain (F15). Changes: next 16.4.0 to 16.4.2, react/react-dom 19.3.0 to 19.3.1, eslint-config-next to 16.4.2
(matches Next), `sharp` moved to dependencies (runtime use), `langchain` removed. Not updated (not security-driven, left for
reviewed upgrades): `@supabase/supabase-js`, `@aws-sdk/*`, `zod`, `nodemailer`, `resend` and others have patch/minor updates.
Added `.github/workflows/ci.yml` (lint, unit tests, production audit, build, source-map check, Gitleaks, database tests) and
`.github/dependabot.yml`. **The workflow has never run** (no GitHub access); check its first run.

**Phase 13, tooling: PARTIAL.** Manual structured review of routes, actions, SQL, storage, headers; the built-in
`security-review` skill was not run. Semgrep, CodeQL, Gitleaks not available locally (CI runs Gitleaks once pushed).

**Phase 14, SEO files: PASS.** `sitemap.xml` lists 19 marketing pages, all existing, canonical, indexable, none private;
`robots.txt` allows only those and disallows the rest, with the sitemap URL; `llms.txt` lists real public pages only, with a
crawler note (not claimed to be a security control); everything else is `noindex` by default. 16 tests pin this.
Domain in URLs comes from `NEXT_PUBLIC_APP_URL`: set it to the real https origin before building. Broken internal links: only
the sitemap/robots/llms targets were checked; a full link crawl was not run.

**Phase 15, social sharing and images: PARTIAL.** Default OG image and Twitter card exist; member content is never exposed
(nothing member-owned is public). Image `alt` usage reviewed in code (informative alt, empty for decoration, fallbacks on
error); `next/image` allows only the configured media host and never a wildcard. No per-page OG images (by design: pages are
private). A rendered accessibility pass was not part of this run (existing axe tests are in `tests/e2e`).

**Phase 16, bundle and performance: PARTIAL.** Baseline only: production client JavaScript is 3.3 MB uncompressed over 123
files (largest chunk 258 KB). No performance changes were made and **no gain is claimed**. Findings: one animation library,
one icon library, server-only AI code stays off the client; the unused `langchain` package was removed (server install size
only). No bundle analyser was installed.

**Phase 17, package reuse: PASS.** New dependency: none. `sharp` (already in the tree via Next) promoted for image decoding;
no custom crypto, sanitiser or rate limiter written; Redis and Zod already present.

**Phase 18, tests: see section 4.**

## 4. Tests run (2026-10-21/22) and results

| Run | Result |
| --- | --- |
| `eslint .` | clean |
| Unit (`vitest --project unit`) | 50 files, **601 passed** (baseline before this work: 40 files, 503 tests) |
| Integration with real JWTs, local Supabase (`--project integration`) | 23 files, **414 passed, 1 failed**: `orbits.test.js` "does not celebrate old badges" fails identically before my changes (one leftover row in the local database, unrelated) |
| `next build` (16.4.2, Turbopack) | succeeds, 108 pages |
| HTTP checks against `next start` | headers on 6 routes; 17 requests without a session; cron/webhook without or with a bad secret; preflight; open-redirect probes; 13 MB upload |
| E2E, new `tests/e2e/security.spec.js` | 5 passed (IDOR over HTTP, private file, oversized and cross-site upload, push SSRF, admin exports) |
| Existing e2e specs I ran (pwa, profile, phase6, auth, session, social, messaging-local-first) | **Many fail for reasons unrelated to this work and not fixed:** new test users are sent to `/privacy-review` (the privacy gate added by the DPDP work), the onboarding test expects a removed college step, the phase 6 CSP test does not allow the configured media host, the profile-upload test needs real R2. Not re-run on a pre-change baseline; the failure messages do not involve any file I changed. The full e2e suite needs maintenance |

New tests: `client-ip`, `push-endpoint`, `cursor`, `ics`, `upload-inspection` (incl. bomb, polyglot, EXIF, scan boundary),
`text-safety`, `security-config` (headers, CSP, source maps, CORS, sitemap, robots), `payment-webhook-route`, `cron-routes`,
`rate-limit-window` (unit); `security-hardening` (17 integration tests); `security.spec` (e2e). Existing `push.test.js` and
`pwa.spec.js` fixtures changed to use an allowed push host.

Not covered by any test: Redis-backed limiter (only the in-memory fallback), real R2 uploads, rendered alt-text/accessibility
after these changes, the CI workflow, behaviour behind a real proxy chain.

## 5. Database migration and deployment steps

1. `supabase/migrations/20260141000049_security_hardening.sql` (idempotent, no data changes; the link constraints fail loudly
   if a row already holds a non-http(s) link: fix or null those rows and re-run). Apply 0036 to 0048 first if the remote lacks them.
2. Redeploy with `next@16.4.2`; set `TRUSTED_PROXY_HOPS`; optionally `UPLOAD_SCAN_URL`.
3. Restart any running `next dev` (dependencies changed).
4. After the first push, confirm the GitHub Actions run; enable Dependabot alerts and secret scanning in the repository settings.

## 6. Manual work remaining (needs your accounts)

- **Cloudflare/R2:** bucket public-access off on the private bucket, no custom domain on it; public bucket contents; CORS;
  cache rules (`docs/MEDIA_CACHING.md`); WAF/rate rules for volumetric abuse; Always-HTTPS.
- **Supabase dashboard:** email confirmation on, redirect URLs limited to your domain, leaked-password protection, session
  length, MFA if offered, backups tested.
- **Hosting:** HTTPS and redirects, `NEXT_PUBLIC_APP_URL`, Redis URL, secrets set and unique, number of proxies.
- **Payment gateway:** webhook secret matches, only the events used are enabled.
- **A qualified tester** should attempt a real penetration test against staging (race conditions in payments and rewards,
  Realtime channel authorisation, session handling across devices); this audit did not.

## 7. Remaining risks and limits

- Session cookie readable by scripts (F13); mitigated by the CSP, not removed. No second factor.
- `style-src 'unsafe-inline'`.
- PDFs unscanned unless a scanner is connected; PDFs render inline from the storage origin.
- Rate limits are weak against distributed attackers and per-process without Redis.
- A revoked session stays valid for up to an hour for reads (documented in `getAuthUser`); sensitive actions use the strict check.
- Fixed-window limiter allows bursts at window edges.
- Email addresses are visible to staff with `users.view`.

## 8. Follow-up 2026-10-22: settings area

Reorganised for phones and hardened (`docs` of the change are in the commit):
- `/settings` is now a menu (one row per area, grouped), each area is its own page with a back link, and desktop gets a sticky
  sidebar. The horizontally scrolling tab strip, which cut off "Notifications", is gone.
- Long pages (profile, privacy, security) are folded cards; a card opens by itself when a checklist link points at it or when
  a field inside has an error (and focus moves to that field). Unsaved edits trigger a browser warning on close/reload.
- Things a member could break, now prevented in the app and in the database (migration 0050, local only until applied):
  more than 30 achievements or 20 experiences; tag items over 40 characters or blank; social links other than LinkedIn/X or
  non-http(s); choosing profile visibility "My college" without a college (and removing the last college afterwards, which
  now falls back to "Connections only"); switching off the in-app "Moderation & account" notices. Privacy and profile-list
  saves are rate limited. "Only me" now explains what it does, and the delete-account card says nothing is deleted by opening it.
- Tests: `tests/integration/settings-guardrails.test.js` (9), `tests/e2e/settings.spec.js` (7, at 360 px). Test users now get
  the two signup consents by default (`createUser(..., { consent: false })` for the privacy-gate tests).
- Not changed: the blue-tick page and the notification list layout (already single-column).
