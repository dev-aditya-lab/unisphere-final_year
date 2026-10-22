# Refer & Earn

Migrations: `supabase/migrations/20260143000051_referrals.sql` and `20260144000052_referral_code_format.sql` (upgrades a database that ran the first 0051, which used 10-character codes) (apply it before deploying the app code; the Refer & Earn pages show an
error panel, not made-up numbers, if it is missing). Version 2.1.0. Tests: `tests/integration/referrals.test.js` (51),
`tests/unit/referrals-core.test.js`, `tests/unit/referrals-prompt-policy.test.js`, `tests/e2e/referrals.spec.js`.

## The rule

**100 Orbits, once, for each invited person who becomes an active member.** The amount is a constant inside the database function that
pays it (`_referral_credit`), not a setting and not something a request can carry.

A referral is *qualified* when the database has verified all of this (`_referral_evaluate`, nowhere else):

1. the invited account was attributed to exactly one inviter when it was created (`referrals.referred_id` is unique);
2. the referral is still inside its window (`qualify_by`, `qualify_days` after sign-up, default 30);
3. the invited account's **email address is confirmed**, the account is **active** and has **finished onboarding**;
4. it has **recognised Orbits activity on `activation_days` different days** (default 2, IST days): the Daily Orbit Bonus, a Daily
   Challenge answer, an eligible post or a helpful answer, read from the ledger;
5. the inviter's account is in good standing and the program is on.

The Refer & Earn page, the FAQ and the terms state this rule from the same settings; they cannot promise more than the database enforces.
No college, no ID, no date of birth, no identity check is required.

## State machine (`referrals.status`)

```
registered ──▶ pending_qualification ──▶ rewarded ──▶ reversed
     │                   │                  ▲
     │                   └──▶ flagged ──────┘ admin approves        flagged ──▶ rejected (admin)
     └────────────────────────────────▶ expired (window ended, also swept by the worker)
```

*Pending signup* (a link was opened) lives only in a cookie and never in the database, and never pays. *Qualified* is the instant of the
transition to `rewarded`: the ledger entry and the status change are one transaction under a row lock, so there is no half-qualified state.

## Attribution

* Link: `https://<app>/register?ref=<CODE>` (the app's real sign-up route is `/register`). The code is the member's username plus a 4-character random suffix, e.g. `aditya-k7m2`: easy to say and remember because of the username, unguessable because of the suffix (31 unambiguous symbols, about 920,000 combinations per username, from `gen_random_uuid()`), so knowing a username is not enough to build a code or to probe for member names. Codes are lower case (any case is accepted), unique, stored in `referral_codes` and stable: a later username change does not break links already shared. Lookups of a code are rate limited.
* `proxy.js` remembers a well-formed `?ref=` for a signed-out visitor in a first-party, `HttpOnly`, `SameSite=Lax` cookie `us_ref`
  (`CODE.epochSeconds`, up to 90 days; the admin setting `attribution_days`, default 30, is what the server enforces). Last click wins.
  The register page also carries the code in the form, so it survives cookie blocking, redirects to /login and back, and the Android TWA
  (which opens the same URL).
* `registerAction` calls `referral_attribute` (service role only) right after the account is created, for a **brand-new** account
  (created within 2 hours). Self-referral, unknown code, bad format, an account that is not new, a second inviter, a disabled program and
  more than 50 attributions per inviter per day are all refused and counted (without personal data) in `referral_events` for abuse
  monitoring. Attribution **never blocks or changes sign-up**.
* The client is never trusted: the cookie and the form only *name* a code. Eligibility, the relationship and the reward are decided in SQL.

## Ledger and badge isolation

The reward is a row in `orbit_ledger` (`kind = 'referral'`, `source_type = 'referral'`, `source_id` = the referral id, idempotency key
`referral:<referred user id>`, unique). `referrals` keeps the referrer, the referred user, the event id, the amount, `qualified_at`, the
ledger id, the key, the status and the review/reversal audit fields.

`orbit_reward_sources` is the **explicit eligibility table** for activity-based milestones (`counts_for_badges`). `referral` and
`manual_adjustment` are `false`; every other kind is `true`; a kind that is not listed counts for nothing. Each ledger entry gets
`badge_amount` from it when written (a reversal follows the entry it reverses), and `orbit_balances.badge_earned_total` is the sum.

| Consumer | Reads | Referral Orbits |
| --- | --- | --- |
| Balance (lifetime), history | `amount` | counted |
| Weekly, monthly, all-time Orbits leaderboards, "earned today/this week" | `earned_amount`, `earned_total` | counted |
| Orbits-earned badges, badge progress (`_orbit_check_achievements`, `orbit_overview`) | `badge_earned_total` | **not counted** |
| Orbit Elite season badges (`_orbit_finalize`) | `badge_amount` | **not counted** |
| Streaks, Daily Challenge, contribution days | their own tables | untouched (no referral code path writes them) |
| "Unusual earning" review | excludes `referral` (own review queue) | not flagged |

## Referral leaderboard

`referral_leaderboard(period, limit, offset)` and `referral_my_rank(period)`: `weekly` (the same IST Monday to Sunday weeks as the Orbits
board) and `alltime`. Rank = number of `rewarded` (so non-reversed) referrals; ties go to whoever reached the count first, then the user
id. Computed in the database over an indexed aggregate, paged (maximum 50 per call). Members who opted out of leaderboards, and profiles the caller
cannot view, are left out. Rows contain rank, display name, username, avatar and the count, never an email, a code or
the identity of anyone invited. All-time is permanent unless an administrator reverses a reward.

## Abuse handling (proportionate, human-reviewed)

* **Cap**: more than `daily_referrer_cap` (10) rewards for one inviter in 24 hours: the extra referrals become `flagged` and wait in
  Admin → Refer & Earn → Held for review. Nobody is penalised automatically.
* **Signals** (recorded, never withhold a reward): `shared_network` when `ip_cluster_threshold` referrals of one inviter share a keyed
  hash of the sign-up address. Shared hostel/campus Wi-Fi is normal, so this only prompts a human to look. The hash is
  `HMAC-SHA256(APP_SECRET or SUPABASE_SECRET_KEY, ip)` truncated, never the address, and is deleted after 90 days (or at once if the
  invited account is erased) by `referral_maintenance`. No device fingerprinting.
* **Rate limits**: sign-up 8/hour/IP (existing), reminder events 30/10 min/member, admin actions 60/10 min, export 6/10 min.
* **Admin**: approve (pays once) or reject a held referral with a reason; **reverse** a rewarded one with a compensating ledger entry
  (`kind = 'reversal'`, capped at the balance so it never goes negative and never takes unrelated Orbits; the shortfall is recorded),
  once, with a reason, audited (`referrals.approve|reject|reversal|setting_changed|campaign_stopped|exported|viewed`).

## Reminder popup

Server-authoritative (`referral_prompt_state`), so the cooldown holds across devices, tabs, re-renders and route changes.
`referral_prompt_check` (one read per full page load, inside Suspense) says whether one is due: program and popup on, member opted in,
fewer than `popup_max_dismissals` dismissals, last shown more than `popup_frequency_days` ago, finished onboarding at least
`popup_min_account_days` ago, and has actually used Orbits. In the browser (`components/referrals/referral-prompt.jsx`) it then waits
25 s for a quiet moment (no other dialog, not typing, tab visible, route not messages/forms/settings/orbits/referrals, see
`lib/referrals/prompt-policy.js`) and asks the server to count the showing (`referral_prompt_record('shown')`); the cooldown only starts
if the server agrees one was due, so a second tab or device shows nothing. One attempt per browser session (`unisphere:refprompt-session`).
Radix Dialog gives focus trap, Escape and screen-reader labelling; animation stops for reduced motion. Close, "Maybe later" and Escape
count as one dismissal; "Don't show again" and the switch on the Refer & Earn page (and a server-side `opt_in` that resets the count) are
the member's own control. `NEXT_PUBLIC_REFERRAL_PROMPT_DELAY_MS` (build-time) shortens the delay for tests.

## Launch announcement

Off by default (`campaign_enabled = false`). When an administrator switches it on, the worker tick (`/api/cron/tick`, so `npm run worker`
or a scheduler must be running) calls `referral_campaign_deliver` in batches of 500: each active, onboarded member gets **one in-app
notification** (`referral_campaign`, category `promotions`) linking to `/referrals`. `referral_campaign_sends (campaign_key, user_id)` is
the once-only guard. It is created already marked as pushed and never emailed: **it is in-app only, no push is claimed**. Members who
switched off "Offers & invitations" or the reminders are recorded as skipped. Admin can stop it, optionally removing unread copies, and
edit the title/text/ID (a new ID is a new announcement). Transactional notices (`referral_reward`, `referral_reversed`) are a separate
category, `rewards`.

## Android TWA / PWA

No native change is needed: the page, share links (`wa.me`, `t.me`, X, LinkedIn, `mailto:`, `sms:`), the Web Share API (when present),
the SVG and the in-app announcement are all web. The invite link opens in the TWA because it is on the verified domain. Native sharing
of the PNG card needs `navigator.canShare({files})`, which current Chrome on Android provides; where it does not, the buttons fall back to
"Save card" and link sharing.

## Operations

* Apply the migration. It adds the reward-source table and backfills `badge_amount` / `badge_earned_total` with the same one-off pattern
  as 0034 (it briefly disables the ledger's no-update trigger inside the migration transaction).
* Run the worker (`npm run worker`) or a scheduler for `/api/cron/tick` to expire stale referrals and send the announcement.
* Set `APP_SECRET` (any long random string) so the sign-up network hash is keyed independently of the database key (falls back to
  `SUPABASE_SECRET_KEY`).
* Release `2.1.0` is seeded as an unpublished draft: publish it in Admin → Releases when this version is live.
* To launch the announcement: Admin → Refer & Earn → Program settings → "Launch announcement on".
