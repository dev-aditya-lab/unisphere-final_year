# Admin console: audit, what changed, and what is left to decide

## Security model (unchanged, verified)

Authorisation lives in the database. Every admin read and write is a `SECURITY DEFINER` function that re-checks
`has_permission(<permission>, <the record's college>)` for the signed-in caller, so a forged request from a non-staff
account fails there whatever the UI or the Server Action does. Pages and actions add a second check, never the only one.
`_assert_can_act_on` stops staff acting on themselves, and stops anyone below a global administrator acting on an
administrator. The audit log is append-only (triggers refuse update, delete and truncate for every role, the service role
included) and is written inside the same transaction as the change it describes.

| Role | Highlights |
| --- | --- |
| Global admin | everything, platform-wide; the only role with `users.export` and `roles.manage` |
| College admin | their college: members, moderation, profile correction, sign-out, analytics, audit |
| Moderator | reports, appeals, remove/restore content, warn, restrict, internal notes |
| Verification staff / Support agent | one queue each; no member data |

## Inventory of the audit

24 admin pages, two API routes (audit and analytics CSV), 20 admin components, one service file and one action file were
inventoried. **No UI was removed**: every page is linked from the navigation, every component and every exported service
function is used, no page contains placeholder or fabricated data, and every dashboard figure is a database aggregate
(`admin_overview`, `admin_timeseries`, `admin_ai_overview`) with a stated meaning. "Do not remove working functionality
because it is infrequently used" applied to all of it.

| Removed | Why |
| --- | --- |
| `@aws-sdk/lib-storage` (dependency) | not imported anywhere (uploads use `@aws-sdk/client-s3` only) |
| `date-fns` as a direct dependency | not imported by the app; `react-day-picker` still installs its own copy |
| The 3-argument `moderate_user` and the 6-argument `admin_list_users` | replaced by versions with optional parameters (same names, defaults keep old callers working) |
| `profiles.restricted_until` was an unused column | now used for timed restrictions |

Two **security defects were found and fixed** (migration 31):

1. `write_audit_log` was executable by every signed-in member: anyone could add entries to the audit log under any
   actor's id. Now service role only.
2. `_accept_connection` was executable by every signed-in member: anyone could create a mutual connection (and follows)
   with any other member, skipping requests, blocks and "who can message me". Now internal only.

Also fixed: admin tables made the whole page scroll sideways on a phone (hidden text in the last column escaped the
scroll container), plus two overflowing forms (`/admin/roster`, `/admin/releases`).

## What was added

* **Member directory**: search by name, username, email or user ID; filter by status, staff role and registration
  period; sort by joined date, last sign-in or name; server-side pagination (25 per page, hard cap 100); shows the
  restriction expiry and last sign-in. Wildcard characters are matched literally.
* **Member page**: restriction expiry, recent public/college posts (never private), internal notes (staff only, hidden from
  the member by the existing select policy), links to the audit history.
* **Timed restriction and suspension** (1 to 365 days, or until reinstated). Ended automatically by the worker tick
  (`expire_restrictions`), which tells the member and records the reinstatement.
* **Correct profile** (name, username, headline, bio): reason required, bypasses the 14-day username cooldown, keeps the old
  username as a redirect, records the changed field names (not the text) in the audit log, adds an internal note.
* **Sign out everywhere**: deletes the member's sessions, so no new access token can be issued.
* **Send recovery email**: the normal reset email through the existing auth-email service; the staff member never sees the link.
* **Export member data** (global admin only): profile, counts, post list, moderation history, roles; never messages or credentials.
  The export function writes its own audit entry, so an export without a record is impossible.
* **Refused privileged calls are audited** (`denied.<operation>`, with only the refusal code and the target).
* **Dashboard**: recent administrative actions and a 7-day AI summary, each shown only to staff who may see that data.

New permissions: `users.edit`, `users.sessions` (global admin, college admin), `users.export` (global admin). Internal notes
use the existing `moderation.warn`.

## Behaviour worth knowing

* **Suspending does not sign the member out**, by design: a suspended member must be able to read the decision and
  appeal it. The database refuses their writes on every request whatever their session says (tested with a still-valid
  session). "Sign out everywhere" is a separate action for compromised accounts. An access token already issued stays
  valid for up to an hour after sessions are revoked; Supabase offers no immediate revocation of an issued JWT, and
  the status check above is what blocks a restricted account in the meantime.
* **Open registration**: members who have not chosen a college have no college scope, so only a global administrator can
  see or act on them. A college is never inferred from what a member selected; `verification_status` is the only claim of
  affiliation and comes from the existing verification flow.

## Not implemented, and why (owner decisions)

* **Separate restrictions for posting, commenting and messaging.** Restriction today is one account state enforced in RLS on
  every table. Splitting it means a capabilities column and a change to the policies of every write path; it should be
  decided before it is built (do you need "can comment but not message"?).
* **Admin-initiated account deletion.** Today a member requests deletion and staff approve it (14-day grace, then erasure
  of data and stored files). A staff-initiated path needs a retention decision (what is kept as evidence, for how long).
* **Message review workflow.** There is none, deliberately: staff cannot read messages. Reports about messages need a
  policy (who may read which messages, with what disclosure) before any tooling.
* **Estimated AI cost.** Tokens are measured; no price table is stored, so no cost figure is shown.
* **Dashboard "total registered accounts"** counts onboarded members; accounts that never finished onboarding are not
  in any admin number. Add a separate figure if you want it.
