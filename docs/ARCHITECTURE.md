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

## Route groups

| Group | Purpose | Shell |
| --- | --- | --- |
| `(marketing)` | Landing, about, features, legal, contact: the only pages a logged-out visitor can see | Public header and footer |
| `(auth)` | Login, register, password reset, email verification | Split layout |
| `(onboarding)` | First-run profile steps | Focused flow |
| `(app)` | Feed, explore, search, projects, messages, notifications, settings, feedback | Member shell (sidebar, bell, install banner) |
| `(content)` | Member content pages: posts, ideas, profiles, projects, events, communities, opportunities, roadmap, changelog. Login required | Member shell, or the verification screen for unverified accounts |
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
| 0013 | Ramgarh Engineering College, student-ID list, claiming and management |
| 0014 | Web Push subscriptions and claiming |
| 0015 | Feedback, voting, roadmap, releases |
| 0016 | Real release history seed |
| 0017 | Closed community: college-email verification removed, anonymous access closed, members-only gate, functions closed by default |

Design rules: RLS on everything; column-level `UPDATE` grants protect trust fields; counters and notifications are
trigger-maintained; recursion in policies is avoided with definer helper functions; soft deletes keep audit history.

## Permissions model

`user_roles(user_id, role, college_id)`: `college_id` null means platform-wide. `role_permissions` maps role to
permission strings (`reports.resolve`, `users.suspend`, `roster.manage`, …). `has_permission(p, college)` is true when
the caller holds a role with `p` that is platform-wide or scoped to that same college. A college admin therefore can
never act outside their college, and the same function backs RLS policies, RPCs and the UI's menu.

## Frontend conventions

- JavaScript only, no TypeScript. Server Components by default; `"use client"` only for interactivity.
- Design tokens (CSS variables) in `app/globals.css`; flat, border-led surfaces; light and dark themes; reduced motion respected.
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
| Unit (`tests/unit`) | Validators, time-zone maths, AI runner with fake providers, push batching, student-ID normalisation | ~100 |
| Integration (`tests/integration`) | RLS and the permission model against a real database with real JWTs: who can read/write what, scoped to college | ~170 |
| End to end (`tests/e2e`) | Whole flows in a browser: auth, posting, projects, messaging, admin, student-ID, PWA, security headers, SEO, accessibility | ~55 |

## Extending safely

1. New table → migration with RLS enabled, explicit grants, indexes, and a test in `tests/integration`.
2. New privileged action → `SECURITY DEFINER` function with `set search_path = ''`, a `has_permission` check, an audit
   log entry, and (if members are affected) a `notify()` call.
3. New page → it is members-only by default (`lib/routes.js` protects every path that is not on its short public list). Only add a page to that list, the sitemap and `robots.js` if it merely explains the product.
4. New third-party origin → it must be added to the CSP deliberately in `lib/security/csp.js` and justified in review.
