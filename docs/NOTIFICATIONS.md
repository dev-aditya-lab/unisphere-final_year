# Notifications

How a member is told about something, how they choose what reaches them, how an administrator reaches people, and the checklist every
new feature follows. (Android specifics: [ANDROID_APP.md](ANDROID_APP.md). Messaging internals: [MESSAGING.md](MESSAGING.md).)

## The model

Everything that notifies calls one database function, `public.notify(user, type, actor, entity_type, entity_id, data, dedupe)`
([migration 0010](../supabase/migrations/20260105000010_notifications_messaging.sql), rewritten in
[0063](../supabase/migrations/20260155000063_notification_controls_and_broadcast.sql)). It decides, in one place:

1. **Nobody is told about their own action**, or by someone they blocked or who blocked them.
2. **Only accounts in good standing** (active or restricted) are told.
3. **The member's three switches for the notification's category** (Settings > Notifications):

   | Switch | Means | Default |
   |---|---|---|
   | **In app** | the bell (and the Notifications page) | on |
   | **Push** | a notification on the phone (Android app) or in the browser | on |
   | **Email** | a digest email | off, except projects, mentorship, moderation and events |

   Push needs In app: a notification that is not in the bell is not pushed either. *Moderation & account* cannot leave the bell.
   *Offers & invitations* are the bell only: never pushed, never emailed (and Settings shows "None").
4. A notification whose Push is off is stored already marked as pushed, so the worker never sends it.

## How it reaches the phone

```
 something happens ──► notify() ──► row in `notifications` (pushed_at = null)
                                         │
              ┌──────────────────────────┴───────────────────────────┐
   a direct message                                      everything else
   lib/services/message-push.js                          the push loop (lib/push-loop.js, every PUSH_LOOP_SECONDS = 15 s)
   pushes at once, per message                           and /api/cron/tick (uptime monitor, ~5 min) claim the row
              │                                                      │
              └────────────►  lib/services/push.js  ◄───────────────┘
                              Web Push (browsers) + FCM (Android app), on the channel of the category
```

* **Messages are instant and per message.** `sendMessage()` schedules `pushNewMessage()` with Next's `after()`, so the sender never waits.
  The database decides who is told (`message_push_targets`: not the sender, not muted, not blocked, Messages **In app** and **Push** on,
  at least one device). Each push is tagged `message:<conversationId>`, so a burst replaces itself on the phone, and carries the
  sender's name and "Sent you a message" / "N new messages". **Never the text.** The push goes on the *Messages* channel
  (importance 4: it slides in over the screen); the bell keeps one entry per conversation until it is read.
* **The safety net.** The bell's row for a message is marked pushed for everyone the instant push reached. For anyone it did not
  reach (Google was busy, the migration was not applied) the worker picks the row up after 15 seconds.
* **Everything else** waits at most `PUSH_LOOP_SECONDS` (default 15; `0` turns the loop off). The loop runs inside the production server
  (`instrumentation.js`); `/api/cron/tick` does the same work and the two never send the same row twice (`for update skip locked`).
* **In the open app / browser** a push for the page you are looking at is not shown again (`lib/native/foreground.js`, `public/sw.js`).
* **Lock-screen text is a sentence only** ([`describeNotification`](../lib/notification-text.js)): no message text, snippet or reason.

## Admin > Broadcast

Staff with `announcements.manage` (global admin, college admin) open **Admin > Broadcast**, choose an audience, write a title and a
message, optionally a page to open, and decide whether to push as well as put it in the bell.

* **Audience parts add up** (a member in any of them is included), then *account type* narrows the result:
  everyone · colleges · communities (by address) · named people (usernames) · students / alumni / faculty / staff.
* **Reach is enforced by the database** (`send_broadcast`, `broadcast_preview`): global staff may reach anyone; college staff only members
  of their own colleges, even if they ask for "everyone". The count under the audience is computed for the signed-in administrator.
* Only **active, onboarded** accounts are included. At most 50,000 people per broadcast. Rate limit: 10 sends per hour per administrator.
* The member's own switches for **Official announcements** apply (In app off and Email off = not delivered; Push off = bell only).
* The link must be a page on this site (`/events`), never another address. A confirmation step shows the number before anything is sent.
* Every send is recorded in `admin_broadcasts` and the audit log (`broadcast.sent`). It cannot be unsent.

## What notifies today

| Feature | Who is told | Category (switch) | Channel |
|---|---|---|---|
| Direct messages | the other member(s) of the conversation, **every message** | Messages | **Messages** (pops up) |
| Posts and ideas | author: reaction, comment, reply, mention, repost; the mentioned | Reactions, comments & mentions | Replies and connections |
| Following | the person followed | Reactions, comments & mentions | Replies and connections |
| Connections | the other person: request, acceptance | Connections | Replies and connections |
| Projects | owner: join request, invitation answer; member: invitation, decision | Projects | Replies and connections |
| Mentorship (alumni) | mentor: request; student: answer | Mentorship | Replies and connections |
| Events | going members: reminders, updates | Events | Events and account |
| Communities and channels | mentions, replies, channel announcements, invitations, join requests/decisions, role changes | Communities | Replies and connections |
| Community moderation | member: warning, timeout, removal, ban, appeal outcome; moderators: report, appeal | Moderation & account | Events and account |
| Platform moderation | author: content removed; member: warning, restriction, suspension, reinstatement, appeal outcome; reporter: outcome | Moderation & account | Events and account |
| Blue tick | member: payment received, ID approved / needs another look, refunded, tick granted / removed | Moderation & account | Events and account |
| Privacy | requester: request update; everyone affected: data-breach notice | Moderation & account | Events and account |
| Refer & Earn | referrer: reward earned / reversed | Orbits & referral rewards | Events and account |
| Refer & Earn invitation | everyone, once, if staff switch it on | Offers & invitations | bell only |
| Feedback and roadmap | the author: status changes | Reactions, comments & mentions* | Replies and connections |
| Official announcements | everyone in a college (Admin > Announcements) | Official announcements | Events and account |
| **Academy** | student: enrolment, payment receipt or failure, refund update, live-class reminder (24 h, 1 h), deadline reminder, mentor feedback, course completion, certificate issued/corrected/revoked, course announcement | Academy | Events and account |
| **Broadcast** | whoever staff choose | Official announcements | Events and account |

\* Feedback status changes use the type `feedback_update`, which falls in *Reactions, comments & mentions*.

**Deliberately not notified** (and why): Orbits awards and badges (too frequent; shown on the Orbits page), plain messages in a community
channel (a busy channel would never stop; mentions, replies and announcements do notify, and a channel can be muted), RSVPs to an event (the host
sees them on the event page), new opportunities and new posts from people you follow (that is the feed), staff queues (the admin console
shows the waiting counts in its sidebar), sign-in and password alerts (handled by the email provider).

## A new feature? Do this

1. **Decide who is told, when, and what is *not* worth an interruption.** Prefer one clear event over a stream.
2. **Emit it with `public.notify()`** from the SQL function (or `admin.rpc("notify", …)` from the server). Never `insert into notifications`
   by hand: that skips the blocks and the member's three switches.
3. **Type and category.** Name the type so `notification_category()` puts it in the right category (`event_…`, `project_…`, `community_…`,
   `moderation_…`). If it is a new *kind* of thing, add a category: the check constraint on `notification_preferences`, `notification_category()`,
   `NOTIFICATION_CATEGORIES` and `notificationCategory()` in `lib/notification-text.js`, and a channel in `lib/push-channels.js`.
4. **Text and link.** Add a `case` to `describeNotification()` in `lib/notification-text.js`: one sentence for the lock screen, a `detail` that
   is shown only inside the app, and a page on this site. Never put what a member wrote into the sentence.
5. **Dedupe** with `p_dedupe` when the same event can fire repeatedly (a key per entity, e.g. `'bt:paid:' || order_id`).
6. **Tests.** `tests/unit/notification-coverage.test.js` finds every emitted type by reading the code and fails if one has no text, no
   category switch or no channel. Add an integration test that the event creates the row for the right person and not for the wrong one
   (`tests/integration/blue-tick-notifications.test.js` is a compact example).
7. **Tell the people who run it.** If staff should be able to reach people about the feature, say so in `docs/ADMIN.md`; update the table above.
8. **Messaging is special.** Anything that changes how messages are sent must keep them pushed at once, per message, tagged per conversation,
   with the sender's name only. `tests/unit/message-push.test.js` and `tests/e2e/notifications.spec.js` cover it.

## Rolling it out (2.7.0)

1. Apply migrations `0063` (Push switch, `notify()`, broadcasts, message push targets) and `0064` (blue tick notifications, the 2.7.0 release-note draft):
   `supabase db push --linked`, then `supabase migration list --linked` to confirm.
2. Deploy. **Either order is safe**: with the code first, the Push switch is simply not stored yet, Broadcast cannot send, messages are still pushed
   (by the push loop within seconds instead of instantly), and nothing errors for members; with the migrations first, the old code ignores the new column.
3. Publish the 2.7.0 release note in Admin → Releases. No new Android build is needed: the app loads the live site.
4. Check on a real phone: Admin → Broadcast to your own username (push on), then send yourself a message from a second account with the app closed.
   If a message does not arrive, ANDROID_APP.md ("A notification did not appear") lists what to check in order.

## Running the tests

```
npm run test:unit                      # coverage guard, message push, loop, broadcast validation, preferences
npm run test:rls                       # the database: switches, broadcast reach and permissions, who a message push goes to, blue tick
# end to end (production build on the local stack; see "Testing without a phone" in ANDROID_APP.md):
PUSH_LOOP_SECONDS=5 npx next start -p 3100
E2E_BASE_URL=http://localhost:3100 npx playwright test tests/e2e/notifications.spec.js
```

The push tests use made-up device tokens: Google refuses them and the server deletes a device Google refuses, so a device that disappears
within seconds is proof the server tried to send. They skip without `FIREBASE_SERVICE_ACCOUNT`. A real phone is the last check:
send a broadcast to your own username from Admin > Broadcast, then message yourself from another account.
