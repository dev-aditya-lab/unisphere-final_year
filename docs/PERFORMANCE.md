# Performance and interaction report

What was slow, the evidence, what changed, and how it was verified. Numbers come from a production build
(`next build` + `next start`) on a developer machine against the local Supabase stack, measured with Playwright
(Web Vitals observers, resource timing) and Postgres `EXPLAIN ANALYZE`. The dataset is small (247 profiles,
91 posts, 890 notifications), so the database figures understate how the original code would behave at scale; the
shape of the cost (linear in table size) is what matters.

## Findings, in priority order

### 1. Every signed-in request waited on Redis, serially (confirmed)

- **Evidence.** The configured Redis answers in 250 to 330 ms from the measuring machine. Each signed-in page read
  the feature flags through Redis (`getFlags()` in the app layout) before any database read, and the rate limiter
  issued `INCR`, `EXPIRE`, `TTL` as three sequential commands. Server response time was 250 to 330 ms for every
  page regardless of its content (database calls were 4 ms each); `/search` took 660 ms.
- **Fix.** `lib/settings.js`: an in-process copy (10 s, stale-while-revalidate, concurrent readers share one load,
  cleared immediately on the instance where an administrator saves). Off outside production so a developer or an
  end-to-end test sees a flag change at once. `lib/rate-limit.js`: one atomic Lua call (`INCR` + `EXPIRE` + `TTL`)
  instead of two or three round trips.
- **Verified.** Server response time per page 250–330 ms → 25–70 ms; `/search` 660 → 360 ms (one Redis round trip
  remains by design). `tests/unit/settings-cache.test.js`, `tests/unit/rate-limit.test.js`.

### 2. Row-level security helper chain was O(table) per query (confirmed)

- **Evidence.** `select count(*) from profiles where username like 'zzzz%'` (matches nothing) took 81 ms; 4,940
  evaluations of `can_view_profile` took 1,977 ms (0.4 ms a row) against 17 ms for the same logic written flat.
  Each call fanned out into 4 to 6 nested `SECURITY DEFINER` functions that each carry `SET search_path`.
- **Fix.** Migration `20260119000024`: the `can_view_{profile,post,project,event,opportunity,community}` wrappers
  keep their signatures and semantics but inline the subqueries. Proven equal to the originals for 215 users over
  about 85,000 evaluations before applying (`tests/integration/idempotency-and-visibility.test.js` keeps the check).
- **Verified.** `search_people` 145 → 48 ms, `search_posts` 113 → 29 ms, `related_people` 91 → 27 ms.

### 3. Feed and search RPCs used generic plans (confirmed)

- **Evidence.** `feed_posts('college', …)` read 3,233 buffers (88 ms); the same query inline read 66 buffers. A
  `language sql` function with `set search_path` is planned once for any argument values, so `case p_scope` and
  `p_category is null or …` could not use `posts_college_idx` or stop at the `LIMIT`.
- **Fix.** Migration `20260119000025`: `feed_posts`, `search_people`, `search_posts`, `related_people`,
  `related_posts` are plpgsql with `plan_cache_mode = force_custom_plan` (same query text; `feed_posts` branches
  with `IF`). Compared row for row with the previous definitions.
- **Verified.** `feed_posts` college 90 → 6 ms, public 102 → 17 ms, following 95 → 24 ms; `search_people` 22 ms,
  `search_posts` 15 ms (both measured after migration 25, cumulative with item 2).

### 4. Speculative prefetch did database work for pages nobody opened (confirmed)

- **Evidence.** Loading `/feed` produced 55 RSC prefetch requests and 56 backend calls (the page itself needs 9).
  Dynamic routes without a `loading.js` are rendered in full to answer a prefetch; eight profile pages, post
  pages and list pages were being rendered per page view.
- **Fix.** `prefetch={false}` on 45 links to detail pages (profiles, posts, projects, events, …) and on the six
  navigation destinations that cannot have a `loading.js` (a descendant calls `notFound()` and e2e tests assert the
  404 status): `shouldPrefetch()` in `lib/nav.js`. Those links show a pending dot (`NavPending`) while they load.
- **Verified.** `/feed` load: 56 → 12 backend calls, 55 → 25 prefetches; `/explore` 32 → 8 calls.

### 5. First-load JavaScript (confirmed, partly fixed)

- **Evidence.** About 400 KB gzipped on every signed-in page. An unused TanStack Query provider shipped to every
  page; Motion's full engine and the 66 KB Supabase browser client (needed only for live badges and chat) were in
  the first bundle.
- **Fix.** Removed the unused `@tanstack/react-query`; `LazyMotion` + `m` (engine loaded after hydration,
  `strict`); the Supabase client is imported on demand and the notification bell connects when the browser is
  idle; dialogs per post (quote, delete, report, edit) mount on first open; the image editor is `next/dynamic`.
- **Verified.** JS delivered by the `load` event on `/feed`: 401 → 330 KB gzipped, with 67 KB arriving after idle.
  Remaining weight is React, Next, Radix primitives and icons; a further cut needs per-route work not done here.

### 6. Interaction correctness (confirmed, fixed)

- Rapid like/unlike/like could finish out of order and leave the UI and server disagreeing (`useLatestWins`:
  one request at a time, the newest choice wins, rollback with Retry).
- Posts, comments and messages could be duplicated by a retry after a lost response (idempotency keys, migration
  `20260120000026`; the key is stored on the row, so retention is the row's lifetime).
- Post edits silently overwrote edits made elsewhere (compare-and-swap on the values the editor started from;
  the dialog offers "Load the latest version" or "Keep my changes").
- A new post waited for a full page refresh to appear (now at the top at once; the refresh only happens when no
  feed on the page can show it). Deleting a post no longer refreshes the whole page.
- Unsent post text was lost on reload or crash (drafts, local to the device, per account, one week, cleared on
  log out). Messages show as "Sending…" immediately and return to the box with their attachments if they fail.
- Hashtag and mention rows are derived data and are now written after the response (`after()`).

## Measured before and after (production build, local database)

| | Before | After |
| --- | --- | --- |
| Server response, signed-in pages | 250–330 ms | 25–70 ms |
| Largest Contentful Paint | 700–800 ms | 400–560 ms |
| `/feed` load, backend calls | 56 | 12 |
| `/feed` JS by `load` (gzip) | 401 KB | 330 KB (+67 KB lazy) |
| `feed_posts('college')` | 90 ms | 6 ms |
| `search_people('react')` | 145 ms | 22 ms |
| Cumulative layout shift | 0 | 0 |

Client-side navigations between app pages finished in 70 to 130 ms. Failure paths were exercised in a real
browser: a response lost after the server saved the post (one row, text kept, retry safe), a conflicting edit, three
rapid taps ending in the right state, and a message sent over a slow connection (14 scripted checks, all passing).

> Messaging was reworked afterwards (local-first client, atomic send, one realtime channel). Its audit, numbers
> and rollout are in [MESSAGING.md](./MESSAGING.md).

## Not done, deliberately

- **Virtualisation.** Lists are cursor-paginated with 15 items per page; measured scroll showed no long tasks.
- **Redis for derived data.** Nothing in the measured workload justified more Redis round trips; the change was to
  remove them from the critical path.
- **Optimistic profile or project edits.** They need authorization and validation answers; they use pending states.
- **A queue.** `after()` already runs the work that does not block a response; no job needs a separate worker.
- **Service worker.** It still caches static assets only and never private responses. (Messaging later added a
  Background Sync handler that delivers the chat outbox; see docs/MESSAGING.md.)

## Rollout notes

- Apply migrations `20260119000024`, `…25` and `…26` (`supabase db push`) before or with the app deploy. The app
  tolerates a database without `client_op_id` (writes retry without the key), but not without migrations 24 and 25
  for the speedups. Migrations 24 and 25 replace function bodies only; they can be re-applied safely.
- In production the settings window means a flag change reaches other instances within about 10 seconds.
- Response times above include a remote Redis (250–330 ms round trip). Hosting the app and Redis in the same
  region makes the remaining Redis calls (rate limits, one per guarded request) close to free.
