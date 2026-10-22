# Retention, erasure, backups and restores

No universal retention period is asserted here. Numbers below are configuration in `system_settings` (`privacy_retention`, editable by privacy officers in **Admin → Privacy → Privacy settings**) and are placeholders until a lawyer reviews them.

## Erasing an account

Member asks (`/delete-account`: password, typing DELETE, optional "also erase the text of my sent messages") → a service-role function creates `account_deletion_requests` (pending, 14 days) and a `privacy_requests` row (kind erasure, in progress). The member can cancel until the worker claims it.

The worker (`/api/cron/tick`) claims due requests with `claim_due_deletions` (retries with a growing delay, gives up visibly after 20 attempts) and runs `executeAccountDeletion`:

1. `begin_account_erasure`: opens the ledger entry, records the choice about messages, and works out what must be kept.
2. Remove every stored object the member owns (R2 public and private) in pages. A failure stops here, is recorded as a staff-only note, and the whole thing is retried.
3. `erase_user_data`: blank the member's sent messages if chosen, delete embeddings and queued embedding jobs for their content, delete their `files` rows.
4. Delete the sign-in account; the database cascade removes the profile and everything it owns (posts, comments, projects, connections, notifications, Orbits, referral codes and referrals they sent, reminder choices, consents, push registrations...).
5. `complete_account_erasure`: ledger → completed; the member's request becomes `completed`, or `partially_completed` listing what was kept; audit entry (opaque id only).
6. Refresh cached pages; email the member once (address used once, not kept).

If the process dies after step 4, `reconcile_erasure_requests()` (part of the retention job) closes the paperwork.

### What is kept after erasure, why, and for how long

| Record | Why | How it ends |
|---|---|---|
| Blue tick order/payment (amount, date, payer username as it was) | Accounting and tax law | The law's period (not set by this app; owner to confirm). No automatic purge yet |
| Reports about the account, with the content they quoted | Community safety / moderation evidence | Cleared `closed_report_days` after the report closes, once the account is gone |
| Messages already delivered, unless the member chose to erase them | The recipients' conversation; sender link removed | Stays with the recipients |
| Referral record when the *invited* person erases their account (`referrals`, no identity) | The inviter's reward count and leaderboard position must not change because a friend left | The link to the invited account is cleared; the sign-up network hash is deleted at once by the next worker run; the row stays while the inviter exists and goes with the inviter's own erasure |
| Audit log entries | Review of staff decisions; opaque id only, no content | Kept |
| Erasure ledger (opaque id, times, choice) | So a restored backup cannot resurrect the account | `erasure_ledger_days` after completion |
| Consent history rows | Evidence of processing before erasure; member link cleared, no identity | Kept (anonymous) |
| Closed privacy requests | Accountability | Text and contact details cleared `closed_request_days` after closing; reference, kind, status, dates stay |

Not erasable by UniSphere: backups and logs held by Supabase, Cloudflare, Resend, Redis, the hosting platform; text already sent to an AI provider. Public images may stay in browser/CDN caches for the cache lifetime (about an hour, up to a day while revalidating).

## Retention job

`run_privacy_retention()` runs from the worker at most every 6 hours (or **Run retention now**): anonymises old closed requests, deletes resolved/spam contact messages and AI usage logs after their windows, deletes completed ledger entries after their window, drops sign-up network hashes older than 90 days and old refused-invite counters (`referral_maintenance()`, also run by the worker tick), clears quoted content from old closed reports about erased accounts, reconciles half-finished erasures.

Rules 6(1)(e) and 8(3) will ask for logs and personal data to be kept at least one year for the Seventh Schedule purposes. The defaults (365 days) reflect that floor for logs; whether this conflicts with erasing personal data on request is a question for a lawyer.

## Backups and restores (preventing resurrection)

1. Backups are managed by Supabase. Write the real backup retention window here: **\_\_ days** (owner to fill).
2. Regularly run `npm run privacy:export-ledger` and store the file **outside** the database (offline copy or a separate private bucket). It is a list of opaque ids; treat it as personal data and delete copies older than your backup window.
3. To restore: put the app in maintenance mode, restore the database, then run `npm run privacy:replay-erasures -- <ledger file>` (needs the app running with `CRON_SECRET`); then reopen. Each id whose account exists again is erased exactly like a normal erasure; ids not present are skipped. It is safe to run twice.
4. Entries erased after the last export are not in the file: export often.

## Rehearsal

Create a test account, upload an image, delete the account, wait out (or backdate) the 14 days, run the worker once, and check: the account is gone, the object is gone from R2, the request shows completed or partially completed, the ledger has the id.
