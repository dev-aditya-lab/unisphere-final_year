# Architecture

## The shape of it

```
Browser (PWA) ──HTTPS──▶ Next.js app (standalone Node server)
   │  ▲                     │  Server Components + Server Actions + route handlers
   │  │ Web Push            │
   │  └──────────────┐      ├──▶ Supabase  Postgres (RLS, RPC) · Auth · Realtime
   │                 │      ├──▶ Redis     rate limits, caches, AI throttle (optional)
   └─ Realtime WS ───┼──────├──▶ R2        private + public buckets (optional)
                     │      ├──▶ Resend    app email (Supabase Auth mail also uses it)
                     │      └──▶ Groq / embeddings provider (optional)
Worker ──POST /api/cron/tick──▶ same app: emails · push · reminders · embeddings · deletions
```

The app is **stateless**. All durable state is in Postgres (and files in R2). That is what makes it safe to run several
copies, restart at will and keep the worker as a thin loop with no business logic of its own.

## Request flow

1. `proxy.js` runs on every page and API request: creates the CSP nonce, refreshes the Supabase session cookies, serves
   the maintenance page, redirects anonymous visitors from protected routes. This is convenience, never the only check.
2. A Server Component or route handler asks `lib/auth/session.js` who the member is (`requireProfile`, `requirePermission`).
3. Reads go through `lib/services/*` using the **member's own Supabase client**, so RLS decides what comes back.
4. Writes are Server Actions (`lib/actions/*`): validate with Zod → call a service → return `{ ok, error, fieldErrors }`.
5. Privileged writes call **`SECURITY DEFINER` RPCs** that check `has_permission(permission, college_id)` themselves.
6. Side effects (notifications, audit log, counters) happen in the database in the same transaction (`notify()`,
   `write_audit_log()`, triggers), so they cannot be skipped or half-applied.

## Sessions (why members stay signed in)

A returning member must not be logged out by a refresh, a browser restart or relaunching the installed app.

- The session is Supabase Auth's cookie (`@supabase/ssr`), **persistent** (400-day `maxAge`; the real lifetime is
  governed by Supabase's refresh-token rules), `SameSite=Lax`, `Secure` on HTTPS, never in `localStorage`.
  `lib/supabase/cookie-options.js` holds the one set of options shared by the browser client, the server client
  and the proxy, so they can never fork the cookie.
- Refresh tokens **rotate on use**. `proxy.js` refreshes via `updateSession()` and writes the refreshed cookies onto
  *every* response it returns (pass-through, redirect, rewrite, maintenance). A refreshed token that never reaches
  the browser is what causes "random" logouts; `tests/e2e/session.spec.js` asserts it on a redirect.
- The headers forwarded to the app are built **after** the refresh so server components see the new cookies.
- An unreachable auth server is not a logout: the proxy does not redirect, `getAuthUser()` falls back to the
  verified JWT claims, and otherwise throws `AuthUnavailableError` so the error screen offers "Try again".
- Logging out ends the session on **this device only** (`scope: "local"`). "Sign out other sessions" in
  Settings → Security is the explicit way to end the rest. The service worker is told to drop user caches.
- Onboarding completion is a database fact (`profiles.onboarded_at`), not client state.

## Route groups

| Group | Purpose | Shell |
| --- | --- | --- |
| `(marketing)` | Landing, about, features, legal, contact: the only pages a logged-out visitor can see | Public header and footer |
| `(auth)` | Login, register, password reset, email verification | Split layout |
| `(onboarding)` | First-run profile steps | Focused flow |
| `(member)` | One layout shared by `(app)` and `(content)`: the member shell (sidebar, bell, install banner). Requires a signed-in, onboarded account (others are sent to onboarding or the suspended page). It is shared so the shell stays mounted when a member moves between the two groups | Member shell |
| `(member)/(app)` | Feed, explore, search, projects, messages, notifications, settings, feedback | Inherits the member shell |
| `(member)/(content)` | Member content pages: posts, ideas, profiles, projects, events, communities, opportunities, roadmap, changelog. Login required. Has a `loading.js` skeleton, so a missing record answers 200 with the not-found page instead of a 404 status | Inherits the member shell |
| `(admin)/admin` | The admin console | Separate admin shell; staff only |
| `app/api/*` | `cron/tick`, `upload`, `files/[id]`, `media/*`, `push/subscribe`, `account/export`, `admin/*` (CSV), `health` | n/a |

## Database

Migrations in `supabase/migrations` are the single source of truth (forward-only). In order:

| # | Adds |
| --- | --- |
| 0001 | Extensions, default privilege lockdown, helpers |
| 0002 | Colleges, departments, profiles, follows, connections, blocks |
| 0003 | RBAC (roles, permission matrix, scope-aware `has_permission`), append-only audit log |
| 0004 | Row Level Security for the foundation tables |
| 0005 | Files, college verification, settings and feature flags, contact messages, deletion requests |
| 0006 | Posts, comments, reactions, bookmarks, feed views, visibility function |
| 0007 | Connection/block/report RPCs, search, suggestions, trending tags |
| 0008 | AI usage log, durable job queue, embeddings, related-content functions |
| 0009 | Projects, roles, join requests, invitations, teammate matching, mentorship |
| 0010 | Notifications and preferences, email queue, direct messaging, realtime publication |
| 0011 | Communities, events (time zones, waitlist), announcements, opportunities |
| 0012 | Moderation actions, appeals, admin read models, deletion processing, analytics |
| 0013 | Ramgarh Engineering College (the student-ID list from this migration was removed again in 0040) |
| 0014 | Web Push subscriptions and claiming |
| 0015 | Feedback, voting, roadmap, releases |
| 0016 | Real release history seed |
| 0017 | Closed community: college-email verification removed, anonymous access closed, members-only gate, functions closed by default |
| 0018 | **Open registration**: optional self-described role, the verification gate removed (`can_use_network` = active account), community-grown college directory (normalised names, aliases, search, add-by-name with duplicate protection, reports, admin merge) |
| 0019 | "My college" visibility needs a college (database refuses it with `college_required`) |
| 0020 | New profiles are visible to signed-in members by default |
| 0021 | Analytics cope with members who have not stated a role |
| 0022 | Colleges that run a student-ID process are verified listings |
| 0023 | `auth_email_state`: lets the server send account emails itself (confirm / reset) instead of Supabase |
| 0036 | Daily Challenge automation: AI draft at 16:00 IST, publish at 02:00 IST |
| 0037 | Post pictures carry their pixel size (`post_feed.attachments`) |
| 0038 | Skills and interests catalogue, managed in Admin → Skills |
| 0039 | `profile_education`: several colleges per member with a role at each; member-added departments and courses |
| 0040 | College ID verification removed (functions and permissions; tables kept) |
| 0041 | Admin tools for departments and courses |

Design rules: RLS on everything; column-level `UPDATE` grants protect trust fields; counters and notifications are
trigger-maintained; recursion in policies is avoided with definer helper functions; soft deletes keep audit history.

## Permissions model

`user_roles(user_id, role, college_id)`: `college_id` null means platform-wide. `role_permissions` maps role to
permission strings (`reports.resolve`, `users.suspend`, `skills.manage`, …). `has_permission(p, college)` is true when
the caller holds a role with `p` that is platform-wide or scoped to that same college. A college admin therefore can
never act outside their college, and the same function backs RLS policies, RPCs and the UI's menu.

## Frontend conventions

- JavaScript only, no TypeScript. Server Components by default; `"use client"` only for interactivity.
- Design system ("campus zine": paper, ink, one coral): tokens in `app/globals.css`, primitives in `components/ui`,
  motion language in `lib/motion.js`; see `docs/DESIGN.md`. Light and dark are designed separately; reduced motion
  is respected. Never hard-code a colour: use the semantic tokens and the `tone-*` utilities.
- Forms: React Hook Form + Zod for rich forms, plain controlled forms for small ones; every error is shown next to the
  field and as an `aria-live` message.
- Accessibility: skip link, labelled controls, focus rings, semantic landmarks. `tests/e2e/phase6.spec.js` runs axe
  (WCAG 2.1 A/AA) on public, member and admin pages and fails on serious or critical issues.
- Charts are server-rendered SVG with a hidden data table for screen readers.

## Background work

| Work | Trigger | Where |
| --- | --- | --- |
| Email digests | Worker tick | `lib/services/notification-email.js`, `claim_notification_emails` |
| Push | Worker tick | `lib/services/push.js`, `claim_push_notifications` |
| Event reminders, orphan files, account erasure | Worker tick | `lib/services/maintenance.js` |
| Embeddings | Worker tick | `lib/ai/embeddings/jobs.js`, `claim_ai_jobs` |

All use `FOR UPDATE SKIP LOCKED` claims with attempt counters, so ticks may overlap or crash without duplicating or
losing work.

## Testing strategy

| Level | What it proves | Count (at last run) |
| --- | --- | --- |
| Unit (`tests/unit`) | Validators, time-zone maths, AI runner with fake providers, push batching, image frames | ~100 |
| Integration (`tests/integration`) | RLS and the permission model against a real database with real JWTs: who can read/write what, scoped to college | ~170 |
| End to end (`tests/e2e`) | Whole flows in a browser: auth, posting, projects, messaging, admin, PWA, security headers, SEO, accessibility | ~55 |

## Extending safely

1. New table → migration with RLS enabled, explicit grants, indexes, and a test in `tests/integration`.
2. New privileged action → `SECURITY DEFINER` function with `set search_path = ''`, a `has_permission` check, an audit
   log entry, and (if members are affected) a `notify()` call.
3. New page → it is members-only by default (`lib/routes.js` protects every path that is not on its short public list). Only add a page to that list, the sitemap and `robots.js` if it merely explains the product.
4. New third-party origin → it must be added to the CSP deliberately in `lib/security/csp.js` and justified in review.

## Image editing before upload

Every place a member picks an image (profile photo and cover, post attachments, message attachments, the
verification document) opens the image editor first. It runs entirely in the browser, so the server still
validates the bytes it receives exactly as before (`lib/storage/policy.js`, `lib/storage/uploads.js`).

- `components/images/use-image-editor.jsx`: `const { editImages, imageEditor } = useImageEditor()`; `editImages(files,
  options)` resolves with the files to upload. PDFs and other non-images pass straight through.
- `components/images/image-editor.jsx`: crop (drag, handles, keyboard), aspect presets or a locked ratio, rotate,
  flip, brightness/contrast/saturation, output size presets, format and quality, with the exact resulting
  dimensions and file size shown and checked against the upload limit. "Use original" skips editing.
- `lib/images/geometry.js` (pure maths, unit-tested) and `lib/images/process.js` (canvas decode, preview, export).
- Re-encoding through a canvas drops EXIF metadata (camera, GPS) from what is uploaded.
- Avatars use a locked 1:1 round crop and covers a locked 3:1 crop, matching how they are displayed.
