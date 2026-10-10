# UniSphere — implementation checklist

Legend: ✅ done and verified · 🟡 partly done · ⬜ not started

## Phase 1 — Foundation ✅
- ✅ Repository inspected (empty) → Next.js 16 App Router, JavaScript only, Tailwind v4, shadcn/ui (JS)
- ✅ Design system: tokens (light/dark), Manrope/Inter/Geist Mono, flat border-led components, real logo
- ✅ Environment validation (`lib/env.js`), documented `.env.example`
- ✅ Supabase: migrations 0001–0005, RLS on every table, explicit least-privilege grants, seed data (dev only)
- ✅ Auth: register, login, logout, email verification, password reset, change password, sessions
- ✅ Protected routes (proxy + server checks + RLS), maintenance mode, safe redirects
- ✅ Profiles: onboarding, edit, privacy, achievements, experience, completion checklist, image upload (R2)
- ✅ College verification: email-domain code, invite codes, manual review (review RPC; admin UI in Phase 5)
- ✅ RBAC primitives: roles, permission matrix, scope-aware checks, audit log (append-only)
- ✅ Landing page, about, features, guidelines, privacy, terms, contact, 404/error/maintenance pages
- ✅ Tests: 59 unit · 31 RLS/RBAC integration · 13 Playwright e2e

## Phase 2 — Core product ✅
- ✅ Posts, categories, visibility, attachments, hashtags, mentions
- ✅ Reactions, comments & replies, bookmarks, reposts
- ✅ Feed (filters, cursor pagination), post pages, search, explore
- ✅ Public profiles (`/u/[username]`), connections, follows, blocking, reporting

## Phase 3 — Differentiating features ✅
- ✅ AI service layer (LangChain + Groq), usage logging, limits, per-member opt-out
- ✅ Idea discovery, originality assistant, post assistant, semantic search (optional embeddings)
- ✅ Projects, join requests, invitations, teammate matching, alumni discovery & mentoring

## Phase 4 — Communication ✅
- ✅ Notifications, preferences · Messaging (Realtime) · Email queue/worker (Resend verified with a real send)
- ✅ Events (timezone-safe, RSVP, waitlist, ICS), communities, announcements, opportunities

## Phase 5 — Administration ✅
- ✅ Separate admin console (`/admin`), permission-gated navigation with live queue counts
- ✅ RBAC UI: staff & roles (grant/revoke, scoped), college-scoped permissions enforced in the database
- ✅ Members: search, detail, warn / restrict / suspend / reinstate, protected-account rules
- ✅ Verification review (with document access), member is notified of the decision
- ✅ Moderation: report queue (severity, assignment, notes), content removal, AI triage suggestion (privacy-gated, never automatic)
- ✅ Appeals (submit while suspended, different reviewer decides), moderation history, notifications to members and reporters
- ✅ Posts / communities / events oversight; announcements publishing; support inbox; colleges & domains
- ✅ Account deletion: 14-day grace, staff approve/reject, worker erases (files + auth user)
- ✅ Analytics (date range, college scope, charts, CSV), audit log viewer (filters, CSV), AI status (live Groq models), settings & feature flags
- ✅ Member data export (`/api/account/export`), `npm run create-admin`
- ✅ Tests at this point: 85 unit · 130 RLS/RBAC/admin integration · 38 Playwright e2e

## RGEC specifics ✅
- ✅ Ramgarh Engineering College is the platform's college (RGEC, Ramgarh, Jharkhand); credits for the four-person team on About, footer and `humans.txt`
- ✅ Student-ID verification: private per-college list imported by staff, IDs stored only as keyed hashes, one account per ID, lockout after repeated misses, release/revoke/restore, audit-logged
- ✅ Publishing requires a verified student ID in production (the dev seed switches it off); manual review remains the fallback

## Phase 7 — Manifestation (PWA) ✅ (store submission needs your accounts)
- ✅ Web app manifest, generated icons (any + maskable + badge), shortcuts
- ✅ Service worker: static-asset caching, friendly offline screen, update prompt. Signed-in pages are deliberately never cached
- ✅ Install prompt (Chromium banner + iOS Add to Home Screen steps) and install controls in Settings
- ✅ Web Push: VAPID, per-device opt-in, worker delivery honouring notification preferences, no message text on lock screens, dead-device cleanup
- ✅ Store kit: `docs/APP_STORES.md` (TWA for Google Play, honest iOS guidance, UGC compliance map), `store/listing.md`, screenshots + feature graphic (`npm run screenshots`), Digital Asset Links route
- ⬜ App Store / Play Store submission, review, approval and release: needs a Google Play developer account (and Apple Developer membership for iOS), a signing key and the store review process. These can only be done by the team; the kit above is ready

## Phase 8 — Post-launch ✅
- ✅ In-app bug reports (severity, area, automatic page / app version / browser context), general feedback, feature requests with voting
- ✅ Product-team triage (status, public reply, duplicate merge with vote transfer, shipped-in link); the member is notified
- ✅ Public roadmap (`/roadmap`), changelog (`/changelog`) with RSS, release editor in the admin console, real release history seeded
- ✅ Tests: 13 integration + 4 e2e for this phase

## Phase 6 — Production readiness ✅
- ✅ SEO: `sitemap.xml` (public content only, session-less), `robots.txt`, `llms.txt`, dynamic Open Graph images for posts, ideas, projects, events, profiles and communities (generic card for anything private), canonical URLs, JSON-LD (Organization with the team, WebSite, FAQ, DiscussionForumPosting, Event, Person)
- ✅ Security: per-request nonce CSP with `strict-dynamic` and no third-party origins, HSTS, `nosniff`, frame/COOP/referrer/permissions policies; verified by a browser test that loads public, member and admin pages and fails on any CSP violation (this caught and fixed signed file images, which redirect to R2)
- ✅ Accessibility: axe (WCAG 2.1 A/AA) over public, member and admin pages in CI-style e2e; fixed real contrast failures in status badges; Lighthouse accessibility 100
- ✅ Performance (measured with Lighthouse on a production build, mobile profile): real-throttled LCP 0.3 to 0.6 s, CLS 0, performance 84 to 86; hero content no longer waits for JavaScript. Honest note: Lighthouse's *simulated* mobile model reports 65 to 75 (LCP about 4.5 s), and total blocking time is about 550 ms at 4x CPU slowdown. That is mostly React hydration; further gains would need splitting providers per route group
- ✅ Docker: multi-stage image (non-root, read-only root filesystem, health check) and a worker image, `docker-compose.yml` with Redis; image built and smoke-tested (health, deep health, headers)
- ✅ Docs: README, SETUP, DEPLOYMENT, OPERATIONS, ADMIN_GUIDE, SECURITY, ARCHITECTURE, EMAIL, AI, APP_STORES
- ✅ Health endpoint `/api/health` (liveness) and `?deep=1` (database)
- ✅ Full test pass: lint clean, 245 unit and integration tests, Playwright e2e across every phase, production build passes

## External setup still required
- **Deploy**: choose a host and domain, then follow `docs/DEPLOYMENT.md`. Nothing is deployed yet.
- **Supabase (hosted)**: create the project, `supabase db push`, set Site URL and redirect URLs, custom SMTP (Resend) and the templates in `supabase/templates/`.
- **`APP_SECRET`** and **`CRON_SECRET`**: generate and store safely. `APP_SECRET` keys the student-ID hashes: never rotate it casually.
- **Student-ID list**: RGEC must supply the valid IDs; a verification staff member imports them (Admin → Student IDs).
- **Resend**: verify the sender domain (SPF, DKIM, DMARC). Locally mail goes to Mailpit.
- **Cloudflare R2**: private bucket in use; optionally create a public bucket and set `CLOUDFLARE_R2_PUBLIC_BUCKET_NAME`, `CLOUDFLARE_R2_PUBLIC_URL`, `NEXT_PUBLIC_MEDIA_URL`.
- **VAPID keys** for push in production (generate once and keep), and run the worker.
- **Branches/departments**: migration 0013 seeds CSE, EE, ME and CE for RGEC as a starting point. Please check them against the college's real list.
- **Support email**: set it in Admin → Settings before store submission and public launch.
- **Stores**: Google Play and Apple developer accounts, signing keys, review (see `docs/APP_STORES.md`).
- **Content**: the college should review the built-in privacy policy, terms and guidelines text.
