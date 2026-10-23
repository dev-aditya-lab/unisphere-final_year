# Messaging: local-first architecture, measurements and operations

Messaging used to be a server-rendered page that re-rendered itself on every event. It is now a small client
application that keeps conversations on the device, sends from a durable outbox and asks the server for small,
targeted answers. This document records what was wrong, what changed, what was measured, and how to run and
operate it.

## 1. What was wrong (audit, measured)

Measured with `scripts/perf/messaging-bench.mjs` against a production build and the local Supabase stack, two real
browsers, a 120-message conversation. Baseline = the code at commit `1835c5e`.

| Finding | Evidence |
| --- | --- |
| **Every incoming message re-rendered the whole page on the server, seven times.** The inbox channel listened to every `messages` insert and called `router.refresh()`; the open thread called `router.refresh()` and re-downloaded its first page 700 ms after each message; marking read refreshed again. | 7 RSC renders and 2 server actions per incoming message, **about 44 database statements per message** for the recipient. |
| **Opening a conversation waited for the server every time.** Links used `prefetch={false}` and the page ran four reads and a three-query page of messages. | 125 ms to show a conversation already seen, on a database with no latency. |
| **Typing re-rendered every message.** The draft lived in the same component as the list, so each keystroke re-rendered every bubble (and parsed its links). | 210 to 255 input events over the 16 ms frame budget for 66 characters, p95 32 to 40 ms. |
| **A new message threw you to the bottom.** `scrollIntoView` ran whenever `messages.length` changed, including when older history was loaded or while reading. | After a message arrived while reading history, scroll position jumped 2,301 px. Loading earlier messages moved the message being read by 2,151 px. |
| **Server Actions queue.** Next.js runs a tab's Server Actions one at a time. A read receipt or a page load waited in front of the member's own send. | Visible in the action counts above; sends shared a queue with loads. |
| **The send path crossed four systems.** Redis rate limit (a 250 to 330 ms round trip to the configured instance, see PERFORMANCE.md), insert, attachments insert, then two reads to rebuild the message. | 6 to 8 statements and a Redis call per send. |
| **Attachments were fetched in a second step.** The recipient got the row, then re-downloaded the thread to learn about files. | The 700 ms refetch above. |
| **Nothing survived a reload or a dead network.** An unsent message was removed from the screen and put back in the box on failure; a reload lost it. | By construction. |
| No off-main-thread image work; no way to cancel an upload; the editor modal was forced for every photo. | Code review. |

Not a problem (checked): the `messages_conv_idx (conversation_id, created_at desc, id desc)` index serves every
page query; `unread_message_counts` is index-only per conversation. Realtime channels were cleaned up correctly.

## 2. What changed

### Server

- **Migration `20260123000029_messaging_local_first.sql`** (additive, no table dropped):
  - `inbox_conversations()`: the whole inbox in one statement (was five reads). `SECURITY INVOKER`, so profile and
    conversation visibility stay under the caller's row level security.
  - `conversation_header(p_conv)`: the other person, both read positions, mute and whether the caller may still send.
    Returns no row for a non-member.
  - `send_message(conversation, body, files[], client_op_id)`: one atomic, idempotent, rate-limited send.
    Authorisation (`can_send_in_conversation`), the 30 per minute limit (an indexed count, no Redis), file ownership
    and readiness, the 4000-character limit and the attachment snapshot are all checked inside the function.
  - `conversation_messages(...)`: pages in both directions by `(created_at, id)` cursor.
  - `messages.attachments jsonb`: a snapshot of the files on the row, so a realtime INSERT carries the complete
    message. `message_attachments` remains the authority for who may open a file. Existing rows are backfilled.
  - `messages_sender_recent_idx (sender_id, created_at desc)` for the send limit.
  - `realtime.messages` policies so `typing:<conversation id>` is a **private** channel only its two members can
    join or hear.
- **Route handlers** `GET /api/messages/inbox`, `GET|POST /api/messages/:id`, `POST /api/messages/:id/read`
  replace the send, load and read Server Actions (which serialise). They require a session, same-origin for
  writes, the `messaging` flag, and answer `Cache-Control: private, no-store`. A conversation you are not in
  answers 404, identical to one that does not exist.
- The services fall back to the previous code paths when the migration has not been applied, so a deploy may go
  out before its migration.

### Client (`lib/chat`, `components/messages`)

```
 React (useSyncExternalStore)
        │ selectors: inbox, one thread, connection
 ┌──────▼─────────────── ChatEngine (one per account) ───────────────────────┐
 │ memory: inbox, threads, outbox        IndexedDB (Dexie), one DB per account│
 │ ingest(): the one door for a message  conversations · messages · threads   │
 │ outbox flush (Web Lock, backoff)      outbox · drafts · meta               │
 └───────▲──────────────▲─────────────────────▲──────────────────────────────┘
         │ fetch        │ Supabase Realtime    │ BroadcastChannel (other tabs)
   /api/messages/*   one account channel      + Service Worker Background Sync
```

- **Open from the device.** A thread renders from IndexedDB at once, then one request returns the header and the
  newest page. If the cache ends before that page begins, the gap is filled by cursor; if too far behind, only the
  page is kept. Older history loads from the device first, then the network.
- **Optimistic send.** The message is validated, given a client UUID, placed in the in-memory outbox (on screen in
  the same task), written to IndexedDB, then sent. The same UUID is the server's idempotency key
  (`messages_client_op_idx` unique per sender), so any number of retries, tabs or the service worker can send it
  and one row exists. The React key is the client id, so the bubble does not remount when confirmed.
- **States shown:** Sending (clock), Sent (check), Seen (double check, only from the other person's own
  `last_read_at`), Failed (retry / discard). "Delivered" is never shown: it cannot be verified.
- **Retries:** network, 5xx and 429 retry with exponential backoff and jitter (1 s to 30 s), at most 6 attempts,
  then the message waits as Failed for the member. Being offline does not use attempts. 4xx refusals stop at once.
  A 401 pauses the outbox and shows "log in again"; nothing is lost.
- **Reconciliation:** acknowledgement, realtime event and catch-up pages all go through `ingest()`; a message is
  stored once by id, a deletion is never undone by a stale copy, and unread counts increment only on first sight.
- **One realtime channel per account** (`messages` insert/update and `conversation_members` update, filtered per
  subscriber by RLS) plus a private typing channel for the open conversation. Opening and closing conversations
  creates no subscription churn. After a disconnect, a reconnect revalidates the inbox and open thread by cursor.
- **Multiple tabs:** a Web Lock lets one tab flush the outbox; other tabs mirror IndexedDB through a
  BroadcastChannel. Duplicates are harmless because of the idempotency key.
- **Scrolling:** follows new messages only when within 96 px of the bottom (or the message is yours), otherwise a
  "N new messages" button; prepending history preserves the reading position exactly; position per conversation
  is restored on return; a ResizeObserver keeps you pinned when an image finishes loading.
- **Composer:** its own state (typing never re-renders the list), auto-growing, Enter sends on a computer and
  adds a line on a touch device (the Send button sends), draft saved per conversation, safe-area aware, keyboard
  inset aware.
- **Attachments:** photos are resized (long edge 2048 px) and re-encoded in a Web Worker (JPEG and WebP at 0.82,
  PNG only resized), only when it saves at least 10 %; otherwise the original is sent. "Original quality" skips
  it. EXIF (location, camera) is dropped by re-encoding. Preview, progress, cancel, retry; the crop and rotate
  editor remains available per photo. The server still validates type, size and magic bytes.
- **Navigation:** switching conversations uses `history.pushState` (Next.js integrates it with `usePathname`),
  so it is instant; a direct link or reload is rendered by the server (membership check, 404 for outsiders) and
  seeds the same engine.

### What was deliberately not built

- **Redis.** Evaluated and **not added**; the send path no longer touches it. Typing indicators are broadcasts
  (ephemeral by nature, no store needed). The 30 per minute limit is one indexed count in the same transaction.
  Redis stays where it is (settings cache, rate limits elsewhere).
- **Presence ("online").** No accurate, authorised signal exists in the product, and a fake dot is worse than none.
- **Virtualisation.** Measured: 400 messages rendered is 5,572 DOM nodes and 26 MB of JS heap; scrolling showed no
  long tasks. `content-visibility: auto` was tried and **removed**: its estimated row heights made the reading
  position drift on prepend. Revisit above about 1,000 loaded messages.
- **Edit, reactions, replies, link previews.** The product does not implement them; no placeholder controls.
- **Peer-to-peer or device-hosted delivery.** The database is the durable source of truth; realtime only
  accelerates it.

## 3. Measured results

Production build, local Supabase (about 0 ms network latency), Chromium, medians of 3 runs each, the same harness
and database (`node scripts/perf/compare.mjs`; raw runs in `scripts/perf/results/`). Baseline run 1 was taken
before two harness metrics were added; its other numbers match runs 2 and 3.

| Metric | Before | After |
| --- | ---: | ---: |
| Database statements per incoming message (recipient) | 44.4 | **4.8** |
| Server page renders per incoming message | 7 | **0** |
| Server Actions per incoming message | 2 | **0** |
| Database statements per send | 6 to 8 | **2** |
| Send: Enter to bubble on screen | 15.4 ms | **7.9 ms** |
| Send: Enter to confirmed | 67.3 ms | **52.8 ms** |
| Revisit a conversation by click | 124.7 ms | **74.3 ms** |
| Typing 66 chars: slow-event p95 | 32 ms | **16 ms** (one frame) |
| Typing: input events over 16 ms | 210 | **126** |
| New message while reading history keeps your place | no (jumped 2,301 px) | **yes** |
| Loading earlier messages keeps your place | no (moved 2,151 px) | **yes (0 px)** |
| Rows stored for one send (idempotency) | 1 | 1 |
| Cold open of a conversation, last message visible | 251.9 ms | 285.2 ms |
| JS transferred on that page (gzip) | 366 KB | 411 KB |
| Incoming: Bob insert to Alice bubble, p50 | 317 ms | 329 ms |
| Long tasks over 50 ms | 0 | 0 |

How to read this honestly:

- The local database answers in about 1 ms, so absolute times understate production. The structural numbers
  (statements, renders, actions) are what carry over: a remote database multiplies each of the 44 by its latency.
- **Cold open is not faster** (within the run-to-run spread of 230 to 490 ms), and the page carries about 45 KB
  more JavaScript (Dexie, the engine, the composer). The gain is on every open after the first, and on messages.
- **Incoming latency is dominated by Realtime**, not by this code: about 300 ms from insert to bubble in both.
- Redis latency was **not re-measured** (REDIS_URL is empty in the local run). It is removed from the send path;
  the previously recorded 250 to 330 ms round trip (docs/PERFORMANCE.md) no longer applies to a send.
- Storage: a 400-message conversation after paging back: 484 KB in IndexedDB (capped at 200 messages per
  conversation and 30 conversations), 26 MB JS heap.
- Not measured: attachment compression time on real photos (the rules are unit-tested; the worker has no
  headless benchmark yet), error and retry rates in production.

## 4. Privacy and cache layers

| Layer | What it may hold | Isolation |
| --- | --- | --- |
| React state / engine memory | the signed-in member's threads | Engine is per account; the server render creates a throw-away engine per request, so nothing is shared across requests. |
| IndexedDB | inbox rows, confirmed messages (bounded), outbox, drafts. **Never** tokens, passwords, file bytes or `canSend`. | One database per account, `unisphere-chat:<user id>`. Opening for user B deletes every other account's database. Log out calls `wipeChatData()` (also tells other tabs). |
| HTTP cache / CDN | nothing | All `/api/messages/*` answer `private, no-store` and the client fetches with `cache: "no-store"`. |
| Service worker | static assets only (unchanged); the outbox sync reads IndexedDB and POSTs with the member's cookies | Never caches a navigation or API response. A third party's push is still ignored. |
| Next.js server caches | none for messaging | Route handlers are `force-dynamic`; reads run under the caller's RLS. |
| Redis | not involved in messaging (see section 2) | n/a |

Authorisation is re-asked, not remembered: whether you may still write is returned by the server each time a
thread opens and is not persisted. A refused send (blocked, consent changed) marks the thread read-only and the
message Failed. A session that ended pauses the outbox; messages stay queued and go out after login.

Honest limits:

- Message text lives in IndexedDB in clear text on the device, as it must to open offline. A shared device that
  is not logged out keeps that member's cache until the next account opens messaging or the member logs out.
- A session that ends without the Log out button (expiry, revoked elsewhere) does not wipe the cache by itself;
  it stays isolated by account and is removed when another account opens messaging.
- A message deleted by its sender on another device while this one was offline stays visible in the older part
  of the cache until that part is next fetched. The newest page is re-read on every open.
- Browsers do not guarantee background delivery. Background Sync (Chromium only) helps when the tab closes
  offline; elsewhere the message is sent the next time the app is open. Nothing claims otherwise.

## 5. Running, testing and rolling out

```bash
npm run test:unit                                  # model, engine (fake IndexedDB), compression rules
npm run test:rls                                   # includes tests/integration/messaging-local-first.test.js
npx playwright test tests/e2e/messaging-local-first.spec.js
node scripts/perf/messaging-bench.mjs              # numbers above (needs a running build and the local stack)
node scripts/perf/messaging-scroll-check.mjs       # reading position on prepend, must print OK
node scripts/perf/compare.mjs                      # before/after table from scripts/perf/results
```

The benchmark and scroll check refuse to run unless Supabase is on localhost: they create and delete users.

Rollout:

1. Apply `20260123000029_messaging_local_first` (`supabase db push`) **before or with** the deploy. It is additive;
   the app works without it (previous code paths) but without the speed-ups and typing channels, and a file sent
   to you appears live only as an empty bubble until the message is re-read (the attachment snapshot is part of
   the migration).
2. Deploy the app. Existing browsers pick up the new service worker (`v3`) through the existing update notice.
3. If rollback is needed, the app version before this change works against the migrated database (the column
   and functions are unused by it).

Test coverage (all executed): 22 engine tests (cached open, offline open, gap fill, optimistic send, event before
and after acknowledgement, duplicate events, bounded retry, permanent failure, offline pending, reload recovery,
account isolation, storage failure, eviction, drafts), 16 model/compression tests, 11 database tests (idempotency
including a 6-way race, RLS, forged sender, files, rate limit, paging, inbox, deletion, private typing channel),
13 browser tests (cached and offline open, offline send and reload, lost response, refusal, catch-up, connection
count, scroll behaviour, long message, upload cancel, two tabs, account switch, API refusals, mobile layout), plus
the existing messaging end-to-end tests.

## 6. Known remaining issues

- `tests/e2e/pwa.spec.js` "offline, a page that cannot load" assumes the dev server (no auto-registered worker)
  and fails against a production build, also with the previous service worker file.
- A conversation's older history beyond the 200 cached messages is always fetched from the network.
- Attachments need a connection to upload; only text can be written offline.
- Group conversations do not exist in the product; the engine and schema key on conversation ids and would not
  need to change for them, but the header and read receipts assume one other person.

## 7. Since 2.3.0: Markdown, attachments and channels

- Direct messages render Markdown with the same safe renderer as posts (`components/posts/chat-markdown.jsx`) and have a preview and formatting help.
- Direct-message attachments use the shared `AttachmentView` (View, Download, Copy link; bottom sheet on phones). `/api/files/<id>?download=1` serves a download.
- **Fixed:** deleting a direct message now makes its attachment unreadable and removes the stored file (it used to stay readable by the conversation, and in storage).
- Community channels are a separate table (`channel_messages`) and a separate, simpler client (`components/community/use-channel.js`), because their
  authorisation is role-based rather than two-party. They reuse the upload pipeline, the idempotency idea (`clientOpId`) and the realtime hook. See docs/COMMUNITIES.md.
