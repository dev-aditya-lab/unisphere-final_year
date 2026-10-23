# Community spaces (v2.3.0): channels, roles, moderation and attachments

How communities work after the 2.3.0 release, what the audit found, what was changed, what was verified, and what is still open.
Written against the code in this repository; nothing here describes a feature that is not built.

Migrations: `0054` (structure, messages, files), `0055` (invitations, moderation, appeals, admin views), `0056` (release note, a draft),
`0057` (`report_community`). All are re-runnable (`create or replace`, `drop ... if exists`). Local tests: `npm run test:rls`
(`tests/integration/community-workspace.test.js`, 49 tests), `npm run test:unit`, and `tests/e2e/community-workspace.spec.js`.

## 1. Audit: what was there, and what was wrong

| # | Finding (confirmed in code or in a running database) | Fixed by |
| --- | --- | --- |
| D1 | **Any community administrator could write `avatar_key` / `cover_key` with any string** (column grant, no check that the file was theirs, an image, or the right shape). There was also no screen to upload a community picture at all. | Direct update revoked; `set_community_branding()` checks owner, purpose, status and proportions. Upload UI with crop. |
| D5 | **`community_members_select` showed every row to every member, including banned and pending people.** Any member could list who was banned. | New policy: members see active members and their own row; staff see all. |
| D4 | Owners could not leave and there was **no way to hand a community over** ("hand it over first" had no flow). | `transfer_community_ownership()` with typed confirmation, one owner always. |
| D3 | Member management wrote no audit trail. | `community_audit_log` (append-only), written by every management function. |
| A1 | **Deleting a direct message left its attachment readable and stored.** The sender's update cleared the snapshot, but `message_attachments` stayed, so the conversation could still open the file at `/api/files/<id>`, and nothing ever removed the object. | `can_read_message_file` requires `status = 'sent'`; a trigger detaches files and marks them (`files.orphaned_at`); the sweep removes the stored object. Test: "fixes the direct-message defect". |
| A2 | `orphan_files()` never swept `community_image` uploads (a replaced or abandoned icon stayed in storage forever). | Added; replaced pictures are marked when replaced. |
| A3 | Attachments could be opened but not downloaded: `presignDownload` always answered `inline`, and a document had no menu at all. | `/api/files/<id>?download=1` → `attachment` disposition with a safe name; one shared `AttachmentView` (View, Download, Copy link) for direct and channel messages. |
| A4 | **A resized community picture could stay blank**: with `NEXT_PUBLIC_MEDIA_RESIZE=cloudflare` and Image Transformations switched off (the media domain answers 404 for `/cdn-cgi/image/...`), the fallback to the original never ran when the page came from the server, because the 404 arrives before React is attached. Found when the reported "logo and banner not showing" was reproduced in a browser. | `components/media-image.jsx` now checks images that finished loading with no size. Verified with a build that has resizing on and 404 for resized URLs. |
| M1 | Direct messages rendered plain text with links only (no Markdown) and had no formatting help or preview. | `ChatMarkdown` (same safe renderer as posts) for direct and channel messages; preview and help in both composers. |
| N1 | No notification category or deep link for community activity. | `communities` category, six new types, safe links, mute per channel and community. |

Not defects (checked): realtime subscriptions in the existing direct-message client are cleaned up correctly; the `messages_conv_idx` index serves the page queries.

## 2. Structure

```
Community  (communities: icon, banner, rules, topics, settings)
 ├─ Category  (community_categories: position, archive)
 │   └─ Channel  (community_channels: type, topic, rules, min_view_role, min_post_role, slow mode, attachments on/off)
 │        └─ Message  (channel_messages: replies, mentions, pins, edits; attachments in channel_message_files)
 ├─ Members (community_members: role, status, muted_until, rules_ack_at)
 ├─ Invitations, reports, moderation actions, appeals, audit log
 └─ Per-member read positions (channel_reads) and notification choices (community_notify_prefs)
```

Channel types: discussion, announcements, questions and answers, resources, project, staff. Archiving a channel or category hides it from members
and keeps its history; staff can restore it. Ordering uses Up/Down buttons and a "Move to" menu (no drag and drop: they work with keyboard, screen
reader and touch).

Existing communities received two starter channels (`announcements`, `general`) in migration 0054. No data was removed.

## 3. Roles and permissions

`community_role_permissions` holds one row per (role, permission) and is read by `community_can()`. The owner holds every permission explicitly.
`lib/community/rules.js` mirrors the table for the interface (hiding buttons, explaining roles); a database test proves the two agree.

| Role | Adds |
| --- | --- |
| member | read channels, send, attach, edit and delete own, report |
| moderator | remove and pin messages, time out and warn, review reports, approve join requests, manage invitations, staff channels |
| admin | manage channels, branding and settings, ban, appoint moderators, audit log, decide appeals |
| owner | appoint admins, transfer, delete. Always exactly one. |

Rules enforced in SQL: nobody acts on a person of equal or higher rank; nobody changes their own role; only the owner makes or removes admins; the owner
role changes only through transfer (typed confirmation, the old owner becomes an admin); an appeal cannot be decided by the person who made the
decision; a moderator cannot see a report about someone who outranks them; reports about the owner go straight to the platform team. Custom roles are
not offered on purpose (more roles, more ways to escalate); the four roles are presets.

Visibility follows `can_view_channel()`: member rank at least the channel's `min_view_role`, and archived channels only for staff. A channel you cannot
read is not in lists, search, notifications, unread counts or realtime, and its address answers "not found", the same as one that does not exist.

## 4. Messages

- **Writes** go through `send_channel_message` (one atomic, idempotent function: permission, slow mode, rate limit (20 a minute per author), reply check,
  file ownership, mention parsing, notifications). `clientOpId` is the idempotency key; six concurrent identical sends store one row.
- **Reads** are cursor pages (`channel_messages_page`, by `(created_at, id)` in both directions), 40 by default, 100 at most. Search is
  `search_channel_messages` under the caller's row level security.
- **Realtime**: one subscription per open community (`WorkspaceProvider`) carries message, channel and category changes; row level security filters each
  event. The open channel and the sidebar's unread counts share it. After a reconnect, a wake-up or the tab returning, the client asks for what it missed by
  cursor, then refreshes the newest page to pick up edits, deletions and pins. It never reloads the history.
- **Delivery states** shown are real: Sending, Failed (with the server's reason, Retry, Discard). Nothing says "delivered".
- **Not built**: typing indicators and online presence (no accurate, authorised signal; a fake dot is worse than none), offline queueing for channels
  (a failed send stays on screen with Retry; the direct-message client keeps its own outbox), edit history, reactions, threads beyond replies, voice and video.

## 5. Attachments

JPEG, PNG, WebP and PDF only (the server decides from the bytes; images are decoded and stripped of location data; PDFs go through the scanning service
if `UPLOAD_SCAN_URL` is set, otherwise they are **not scanned**). Up to five per message, progress, cancel, retry. Audio and video are **not** supported:
the upload path buffers the whole file in memory (12 MB cap), there is no transcoding and no content scanning for media, and a container check on its own
proves little. Adding them needs a streaming upload to storage first.

Every file is private. `/api/files/<id>` checks the member against `files` row level security (owner, or someone who can read the channel or conversation)
and redirects to a short-lived signed URL; `?download=1` is the same check with `Content-Disposition: attachment`. "Copy link" copies that address, which only
works for people who can already see the message. A file belongs to one message (unique index), so an upload cannot be replayed into another channel.
Deleting a message erases its text at once, detaches its files and marks them; `orphan_files()` returns them five minutes later and the worker removes the
objects. Unattached uploads are removed after 24 hours.

Action menus (`components/community/action-menu.jsx`): a menu beside the button on a computer (Radix: flips inside the window, arrow keys, typeahead,
Escape; right-click opens it too), a bottom sheet on a phone (no hover or right-click needed; a long press also opens it). Message actions: Reply,
Copy text, Copy link to message, Edit, Pin, Report, Delete (own), Remove (moderator). File actions: View, Download, Copy link.
"Save a message" (bookmark) is not offered: bookmarks exist for posts only.

## 6. Markdown

One renderer (`react-markdown` + `remark-gfm`, already a dependency) for posts, direct messages, channel messages, rules, descriptions, search results and
previews. React elements only, never `innerHTML`; raw HTML is shown as text; images are not rendered; links are http(s) and mailto only, checked on the
parsed address, with `rel="noopener noreferrer nofollow ugc"`; no tables or headings in chat. `isCheapToRender()` shows a message with more than 200 lines,
quotes nested six deep, lists nested six deep, more than 40 links or over 4,000 characters as plain text instead of parsing it. `ChatMarkdown` is memoised on the
text. AI output goes through the same renderer.

## 7. Invitations and membership

- Invite links: 96 random bits, only the SHA-256 is stored, shown once. Expiry (1 hour to 90 days), use limit, revoke, optional single named invitee (who is
  notified). Members may create links only if the owner allows it, capped at 7 days and 25 uses. A bad, expired, revoked, used-up, wrong-person or banned
  code all answer identically ("not valid any more"); lookups are rate limited per member (10 / 5 min) and per network address (30 / 5 min).
- Join policies: open, by request (staff approve or decline, with notifications), invite only. A banned person cannot rejoin even with an invite.
- No college check anywhere. Community discovery is by topic and name; members-only communities are never listed.
- Optional rules acceptance: when on, members can read but not post until they accept.
- Leaving removes the member's read positions and notification choices; their messages stay, attributed to them, unless they delete them or ask for their
  messages to be erased with the account (`erase_user_data`).

## 8. Moderation

Report a message or a member (once per target; ten per hour). The report keeps a copy of the reported message and the two before it. Moderators warn,
time out (1 hour to 28 days), remove, ban or write private notes; removing a message erases its text. Every decision has a reason, is shown to the person
(never a private note) and can be appealed for 30 days, once; a different admin decides, or the platform team for decisions by the owner. Upholding lifts
a timeout or a ban; a removed message is not restored (its text is gone by design). Reports can be escalated to the platform team and a whole community can
be reported to it (`report_community`). AI "second opinion" on a report is advisory and only for public communities.

Retention: a closed report's copy of the text is erased after `community_evidence_retention_days` (a system setting, **default 180, a placeholder the
owner must confirm**). The outcome, category and audit trail stay.

## 9. Notifications

Types: `channel_mention`, `channel_reply`, `channel_announcement`, `community_invite`, `community_join_request`, `community_join_decision`, `community_role`,
and moderation ones (`moderation_community_action`, `_report`, `_appeal`, `_appeal_decision`). Mentions notify people who are in the community and can read the
channel, up to ten per message; replies notify the author replied to; announcements are sent by the worker in batches (`process_channel_announcements`, at
most 5,000 recipients each, de-duplicated per message and person, so a retry never sends twice). No notification for ordinary messages. A mute on a channel or the
community always wins; otherwise a channel's level beats the community's. Blocks are honoured by `notify()`. Text never contains what was written; links are
built from a slug and two ids and refused if either is malformed. Push uses the existing worker and subscription store (stale devices are removed after repeated
failures). Push delivery depends on the device and browser and is not guaranteed. `@everyone` does not exist.

## 10. AI

On request only, never automatic, never for private communities, staff-only or restricted channels or direct messages; names are replaced by "Member 1, 2…";
the existing consent (`ai_assist`), daily budget, throttle, timeout, provider fallback, caching by prompt and de-duplication apply. Features: channel summary
(public communities, channels open to every member), description / rules / channel-description drafts from the organiser's own notes, an advisory second opinion
for a moderator. Not built (and why): FAQ answers over community resources and search assistance (no resource index; a vector store was not justified), suggested
replies (low value, high risk of impersonation).

## 11. Platform administration

`/admin/community-safety` (Review queues): communities (search, counts), escalated reports, escalated appeals, daily trends from real counts (messages,
reports, removals, timeouts and bans), storage and delivery health. `/admin/community-safety/<id>`: staff, channels with read/post levels, restricted
people, recent audit entries. Every list is a function that checks the staff permission itself (`communities.manage`, `reports.view`, `reports.resolve`,
`appeals.review`, `analytics.view`). Staff see how a community is set up and what was escalated to them (with the report's copy). They have no path to read a
private channel. Marking a community official is on the detail page.

## 12. Verification

| Check | Result |
| --- | --- |
| `npm run test:unit` | 710 passed (55 files before, 59 now) |
| `npm run test:rls` (integration, local database) | 525 tests; 522 passed. The 2 failures (`orbits` "does not celebrate old badges", `phase5` "shows reports only to staff of the report's own college") are the stale-leftover failures already recorded for this database, unrelated. `community-workspace.test.js`: 49/49 |
| `tests/e2e/community-workspace.spec.js` (production build, port 3100) | 13/13 after fixing three expectations in the spec (see git history of this file) |
| Existing `messaging-local-first.spec.js` | 4 fail (offline send, reading older messages, upload cancel, account switch) **identically on the untouched commit** `5de685b`: not caused by this work |
| `npm run lint` | 0 problems |
| `next build` | passes |
| `npm audit --omit=dev` | 0 vulnerabilities. **No dependency was added.** |
| Privacy self-audit (`privacy_security_audit`) | no new function callable by a signed-out visitor; no table without row level security |

Acceptance criteria 1 to 17 map to tests: 1-4, 6, 12, 13, 15 in `community-workspace.test.js`; 5, 7 (display), 9, 10 (live, once), 8 and 16 in the e2e
spec and unit tests (`community-markdown.test.js`, `community-routes.test.js`); 11 in the notification tests; 14 in `community-ai.js` rules plus the
integration tests that fix who can read what; 17 in the untouched direct-message, notification and profile tests. **Not tested**: real uploads (the local
stack has no object storage), real push delivery, the AI provider (no key locally), a large-scale load test.

## 13. Owner to-dos

1. **Hosted database**: 0054 and 0055 are applied. Apply `0056` (release note, draft) and **`0057` (`report_community`)**. The "Report community" button
   fails until 0057 is applied. Run `npm run db:push`-style with the CLI or paste the files in the SQL editor.
2. **Cloudflare**: the media Cache Rule and the WAF allow-list must include `/community_image/` (docs/MEDIA_CACHING.md). If `NEXT_PUBLIC_MEDIA_RESIZE=cloudflare`
   is set but Image Transformations is off, pictures still show (they fall back to the original) but each costs a wasted request: turn transformations on or unset the variable.
3. **Worker**: announcements and evidence retention run in `/api/cron/tick` (`communities` step). Without a running worker announcements are never sent and
   "Announcements waiting" on the health tab grows.
4. **Retention**: confirm `community_evidence_retention_days` (Admin → Settings) and publish it in the privacy notice. The legal pages describe the behaviour,
   not a number.
5. Publish release 2.3.0 in Admin → Releases. The privacy notice has a new version (`2026-10-23.1`, no new consent needed); a legal review is advised.
6. Optional: connect a PDF scanning service (`UPLOAD_SCAN_URL`) before promising anything about PDFs.

## 14. Remaining risks and limits

- Channel message text sits in PostgreSQL in clear text; staff with database access can read it. Not end-to-end encrypted, and not described as such.
- Public community icons and banners live in the public bucket under random keys: anyone who has the address can load them, even for a members-only community.
- `community_notify_prefs` and `channel_reads` grow with members x channels; the unread query is bounded (100 per channel) and indexed, but a community with
  thousands of active channels per member has not been measured.
- Announcements fan out in the worker to at most 5,000 members each; larger communities need paging (not built).
- The client keeps at most about 600 messages of a channel in memory and loads older ones on demand; very long sessions in a busy channel drop the oldest.
- Blocking another member does not hide their channel messages from you (it stops notifications and direct messages). Per-message hiding was not built.
- Deep links with `?m=<id>` scroll to a message only if it is in the newest page.
- Rate limits: sends (20 a minute per author, in the database), reports (10 an hour), invitation lookups, edits, deletes, pins, search (Redis or memory). Hosted
  behind several instances, the memory fallback is per instance.
