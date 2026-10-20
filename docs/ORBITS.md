# Orbits: rewards, challenge, streak, badges and leaderboards

Migration: `supabase/migrations/20260125000032_orbits.sql`. Apply it before deploying the app code (the Orbits pages show an
error panel, not fake numbers, if it is missing). Tests: `tests/integration/orbits.test.js` (41), `tests/unit/orbits-cards.test.js` (7),
`tests/e2e/orbits.spec.js` (10).

## How a reward happens

Every Orbit is a row in `orbit_ledger`: append-only (no update or delete for anyone, the service role included; an account
erasure removes a member's rows through the cascade), one unique `idempotency_key` per real event, written only by
SECURITY DEFINER functions after the event was validated in the same transaction. `orbit_balances` is a cached sum kept by a
trigger, cannot be negative, and cannot be written through the API. The browser never sends an amount.

| Event | Orbits (config key) | Limit | Validated by |
| --- | ---: | --- | --- |
| Daily Orbit Bonus | 5 (`checkin`) | once per member per day | row in `orbit_checkins` (primary key) |
| Daily Challenge participation | 5 (`challenge_participation`) | once per question | row in `orbit_answers` (primary key) |
| Correct answer bonus | +5 (`challenge_correct`) | once per question | the stored key, compared in the database |
| Eligible post | 10 (`post`) | first one each day | trigger on `posts`: published, original (not a repost), not private, at least `post_min_chars`, not a copy of the member's own post from the last 7 days |
| Helpful answer | 5 (`helpful_answer`) | `helpful_daily_cap` per day | trigger on `comment_reactions`: the author of a *Question* post liked the answer; own answers and bystander likes pay nothing |
| Streak milestone | `streak_bonus` JSON (3, 7, 14, 30, 60, 100, 365 days) | once per length per member | the streak counter |
| Badge | per badge `bonus` | once per badge | trigger-driven check of trusted records |

Not rewarded: likes given, follows, screen time, reposts, private posts, a second post the same day (it is still allowed, it just
earns nothing), a removed post (its reward is reversed by a compensating entry and the day's reward is not offered again).
Orbits are not purchasable, transferable or redeemable, and the UI says so. Values live in `orbit_config` and are edited in
Admin -> Orbits; every change is audited.

**Days** are Asia/Kolkata calendar days (`orbit_today()`; IST has no daylight saving, so there is no 23 or 25 hour day). There is no
per-member timezone setting in the product today; adding one would need a column and a decision about how streaks behave
when someone travels.

**Orbit Streak** counts days with a *contribution*: the Daily Challenge answered on its day, an eligible post, or a helpful answer. The
check-in does not count. A catch-up answer to an older question (offered only when no question is scheduled for today) pays Orbits
but is not a streak day. A broken streak resets the counter to 1 on the next contribution; Orbits are never removed for a missed day.
There are no freezes or recovery credits.

## Daily Challenge

`orbit_questions` has no grant for members: the answer key cannot be read through the API. `orbit_daily_question()` returns the
question and options only; `orbit_submit_answer()` records the answer and then returns the key and explanation. A page's HTML before
answering contains neither (tested). One live (scheduled or published) question per date; once anyone has answered, its wording and key
are frozen. Admins create, schedule, preview-by-editing, archive and see answer counts and correctness in Admin -> Orbits -> Daily
Challenge. **No questions are seeded**: content has to be written and verified by a person. The "started from an AI draft" box only
records provenance; there is no AI generation job in this feature.

## Leaderboards

Metric: Orbits earned in the period (weekly Monday to Sunday, monthly calendar month, both IST) or, for all time, the Orbit Balance.
Ties: earliest to reach the score, then user id. Scopes: global; college (the *self-reported* `profiles.college_id`, labelled as unverified);
connections (accepted connections plus yourself). Members who opted out, inactive accounts and profiles the viewer cannot see
(`can_view_profile`) are excluded. Weekly and monthly boards are labelled in progress. Rank movement compares with the standing at the end
of yesterday. Queries are database-side with pages of 20.

**Orbit Elite badges** come only from a *finalised season* (Admin -> Orbits -> Seasons): the real top 10 by Orbits earned between the season's
dates, globally, per college with at least `min_group_size` participants, and among each member's connections (group of at least
`min_group_size`). Each badge records scope, season, rank, score and rule version, and is awarded once. Finalising happens when an admin
presses the button, or automatically on the worker tick after the season's last day (`npm run worker` or any scheduler that calls
`/api/cron/tick`; without one, finalise by hand). A live position is never shown as a badge: an Orbit Card for a live rank says "3rd on the
college leaderboard, this week so far".

## Artwork

All images come from `public/icons/reward/` (unmodified). Mapping, after viewing each file: `orbit` the Orbit balance and card branding;
`calendar-check` daily bonus; `brain` challenge; `circle-check` / `circle-x` answer results; `flame`, `calendar-check`, `trending-up`, `trophy`, `orbit`
streak tiers; `graduation-cap`, `award`, `badge-check`, `user-graduation-cap`, `globe` badges; `1st` to `10th-award badge` the ranking
positions (the numeral is printed on each badge, so rank N uses the Nth file); `lock-keyhole` marks a locked badge (which is also dimmed and
labelled "Locked" in words). Files are used through `next/image` (served resized, transparency kept, `object-contain`); the
500x500 originals are 120 to 330 KB each and are not shipped as-is to small slots.

## Orbit Cards

Drawn in the browser with canvas from a spec built from real data (`lib/orbits/card-spec.js`, unit-tested): 1080x1920 or 1080x1080 PNG,
downloaded or passed to the device share sheet; nothing is posted. The card carries the member's name and a link to
`/u/<username>/orbits` only if they allow it (Settings -> Privacy -> Orbits). That page is for signed-in members, like the rest of UniSphere: there is no
anonymous public page, because the network is closed, so the link is not a public verification URL and there is no QR code.

## Privacy

Settings -> Privacy -> Orbits: show balance, show badges and streak, appear on leaderboards, allow cards with my name. Enforced in
`orbit_profile_summary`, which returns `null` for hidden parts, and in the leaderboard functions.

## Measurements (local, one run, 400 members and 30,000 ledger rows, rolled-back synthetic load)

Weekly global leaderboard page 49 ms; all-time 38 ms; connections monthly 21 ms; `orbit_my_rank` 43 ms. Cost grows with the number of
*participating members* (a per-member sum over an indexed `(day, user_id)` range). Add a cached or materialised leaderboard when p95 passes
about 150 ms on your real data. No concurrent-user load test was run.

## Not built, on purpose or for lack of an input

* AI question generation and a review queue (needs a provider decision and reviewers; the plain editor is complete).
* A per-member timezone, streak freezes, purchasable or transferable Orbits.
* Push or email notifications for badges and rank changes.
* Retention beyond "came back within 7 days": analytics consent and a cohort definition are not defined in the project.
* A scheduler: seasons finalise on the existing worker tick only if you run it.
