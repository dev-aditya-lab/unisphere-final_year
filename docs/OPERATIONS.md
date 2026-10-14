# Operating UniSphere

What to watch, what to back up, and what to do when something breaks.

## The worker

`scripts/worker.mjs` calls `POST /api/cron/tick` every `WORKER_INTERVAL_SEC` (default 30). Each tick, in order:

| Step | What it does | If it stops |
| --- | --- | --- |
| Embeddings | Generates vectors for new posts/profiles (only if an embeddings provider is configured) | Semantic search gets stale; keyword search is unaffected |
| Notification emails | Sends queued emails, combining several into one digest | Emails are late (they are retried up to 3 times) |
| Push notifications | Sends Web Push for new unread notifications | Push is late; the bell and inbox are unaffected |
| Maintenance | Event reminders (24h and 1h), orphan-file cleanup, **scheduled account erasure** | Reminders are missed; deletions are late but never lost |

It is safe to run more than one worker or to overlap ticks: every step claims work with `FOR UPDATE SKIP LOCKED`.
A tick that fails one step still runs the others, and returns what happened as JSON.

Monitoring: UptimeRobot alerts you if `/api/health?deep=1` fails or if `/api/cron/tick` has not returned 200
for 10 minutes. The worker logs one line per tick (emails sent/failed, push sent).

## Health and monitoring

| Signal | Where |
| --- | --- |
| Liveness | `GET /api/health` (no dependencies; use for the container health check) |
| Readiness | `GET /api/health?deep=1` (checks the database; 503 if down). Use for uptime monitoring |
| AI health, models, errors, jobs | `/admin/ai` |
| Moderation backlog | Admin sidebar counters (reports, appeals, verification, deletions, feedback) |
| Who did what | `/admin/audit` (append-only; CSV export) |
| Errors | Your host's logs (Vercel/Render dashboard, or `pm2 logs`). Server errors are logged without secrets |

Recommended: an uptime monitor on `/api/health?deep=1`, log shipping from the containers, and Supabase's built-in
database and auth dashboards.

## Backups and recovery

| Data | Where | How to protect |
| --- | --- | --- |
| Everything relational (members, posts, audit log, student-ID hashes) | Supabase Postgres | Enable daily backups and point-in-time recovery. Take a manual dump before every release that includes a migration |
| Uploaded files | R2 | Enable R2 object versioning, or replicate the private bucket to a second bucket |
| Secrets | Your password manager | `APP_SECRET`, `SUPABASE_SECRET_KEY`, `CRON_SECRET`, VAPID private key, R2 keys, Resend key |
| Redis | Not backed up | It only holds rate-limit counters and caches |

Practise a restore into a scratch Supabase project once, and write down how long it took.

**`APP_SECRET` matters most.** Student IDs are stored as HMACs keyed with it. If it is lost or changed, existing
verified members stay verified, but nobody new can claim an ID until the list is re-imported with the new secret, and
the re-imported entries would also let an already-claimed ID be claimed a second time. Treat it as irreplaceable.

## Rotating secrets

| Secret | Rotate by | Impact |
| --- | --- | --- |
| `CRON_SECRET` | Change in app and worker env; restart both | None |
| `SUPABASE_SECRET_KEY` | Create a new key in Supabase, deploy, then revoke the old one | None if done in that order |
| `RESEND_API_KEY` | Create a new key, update app **and** Supabase SMTP settings | Auth mail fails until both are updated |
| R2 keys | Create a new token, deploy, revoke the old | None |
| VAPID keys | **Avoid.** Rotating drops every push subscription; members must turn push on again | Push stops until re-enabled |
| `APP_SECRET` | **Do not rotate** unless you accept re-importing the student-ID list | See above |

## Runbooks

**Emails are not arriving.** `/admin/audit` and the worker log show `failed` counts. Check `/api/health?deep=1` for
`email: configured`, then Resend's dashboard (domain verified? key valid? sandbox sender?). Failed rows keep their error
text in `notifications.email_error`. Auth mail (sign-up, reset) is sent by Supabase, so check its SMTP settings too.

**Someone cannot verify with their student ID.** Admin → Student IDs: search the last three characters. Not on the list
→ import/correct it, or ask them to use *Manual review*. "Already linked to another account" → someone claimed it:
use **Release**, then let the rightful owner claim it. Five wrong attempts lock the account's student-ID entry for 24 hours.

**A member is harassing others.** Reports → open the report → decide (warn / remove content / restrict / suspend). All of
it is audit-logged, the member is notified with the reason, and they can appeal once; a different moderator decides.

**The site is under load or abuse.** Turn on maintenance mode in Admin → Settings (admins keep access). Tighten
`rate_limits` there. Block a source at your proxy or Cloudflare. Registration can be closed with "Open registration".

**A bad release.** Redeploy the previous image. Because migrations are additive the old version works against the new
schema. If a migration must be undone, write a new forward migration; do not edit applied ones.

**Disk, memory.** The app keeps no files on disk (`read_only` container) and one Node process uses a few hundred MB.
Redis is capped at 128 MB with an LRU policy.

## Data requests

- **Export**: members can download their own data (Settings → Security). Staff cannot read private messages.
- **Deletion**: members request it in Settings → Security; it is executed after 14 days by the worker (or immediately by
  an admin in Admin → Account deletion). Files in R2 are deleted first, then the account. Messages a member sent remain
  in other people's conversations with the sender shown as removed; reports keep their snapshots for safety records.
- **Legal holds**: the audit log is append-only by design (database trigger), even for administrators.

## Routine

| When | Task |
| --- | --- |
| Daily | Glance at the admin counters; clear reports and appeals |
| Weekly | Check `/admin/ai` errors, review feedback triage, confirm backups ran |
| Each semester | Import the new batch's student IDs; revoke IDs of students who left; review staff roles |
| Each release | `npm test` and `npm run test:e2e` green, back up, apply migrations, deploy, publish release notes |
| Yearly | Rotate non-critical secrets, renew the domain and Apple/Google developer memberships |
