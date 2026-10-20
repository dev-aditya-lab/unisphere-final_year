# Discovery: composer suggestions, the "For you" feed, and where AI is (and is not) used

This describes what is built, why it is shaped this way, and what evidence would justify more infrastructure. Migration:
`supabase/migrations/20260123000030_discovery_feed.sql` (apply it before or after deploying; the app falls back cleanly
if it is missing).

## 1. `@` and `#` suggestions

| Piece | Where |
| --- | --- |
| What word is being typed at the caret | `lib/text-triggers.js` (same boundaries as the server parser in `lib/text.js`) |
| The textarea (composer **and** comments/replies) | `components/posts/suggest-textarea.jsx` |
| People | `suggestMentionsAction` -> `mention_suggestions()` (runs as the caller, so profile RLS and blocks apply) |
| Tags | `suggestHashtagsAction` -> `suggest_hashtags()` (prefix search, **public posts only**, max 10 rows, `text_pattern_ops` index) |

Why it did not work before: the original composer had no suggestion code at all (a hint line only), and the one
existing people search (`search_people`) needed two or more characters, ranked by full-text and was not wired to the composer or comments (only the
project invite picker used it). Hashtags had no search endpoint; only the 8 trending tags were readable.

Behaviour: the trigger is recomputed from the caret on every change, selection move and paste, so it works mid-sentence,
after backspacing back to the `@`, with emoji and multi-line text, and while an IME is composing it stays quiet.
Requests are debounced (150 ms), answered per query, cached for 60 s per textarea, and an answer to an older query is
dropped (`latest` counter). Arrow keys move, Enter/Tab insert (existing matches come before the "new tag" entry), Escape
closes only the list. The list is inline under the field, so it cannot leave the screen behind a mobile keyboard.
Selecting inserts `@username ` / `#tag `, takes over one following space, and puts the caret right after it.

Server side: mentions are never trusted from the client. `syncTagsAndMentions` re-reads the saved text, keeps only active
accounts that really appear in it (never the author, at most 10), and on an edit writes only the difference, so someone
already mentioned is not notified again. `notify()` already drops blocked pairs and honours notification preferences;
migration 30 extends the audience check in `trg_notify_mention` to comments. Tags are lower-cased once (`extractHashtags`).
`/explore?tag=` now uses `posts_by_hashtag()` (newest first, bounded) instead of "the first 200 links in no order".

## 2. The "For you" feed

Default tab for everyone; it needs no college, interests or history. No model is called.

```
feed_candidates(90, asOf)  ┐
viewer_affinity(60 days)   ├─ in parallel ─> rankCandidates() (lib/feed/rank.js) ─> page of 15
follows (<= 500)           ┘
```

* **Eligibility** is decided in the database: `feed_candidates` reads `post_feed` (RLS) and drops private posts,
  community posts and posts the member marked "not relevant". Ranking can reorder but never reveal.
* **Score** = stated interests (whole-word and `#tag` match) + followed author + what the member liked, saved or commented
  on (category, author, tags; aggregated in SQL, saturating) + freshness (36 h half-life) + substance and discussion
  (log-scaled, comments count double, likes are one input) + a small exploration bonus once there is a pattern to differ
  from + collaboration (projects, opportunities) - dismissed topics/authors - own posts.
* **Diversity**: a greedy pass lowers a post for each earlier pick by the same author, category (after one free repeat)
  and college.
* **Why**: each placement carries the strongest *personal* reason ("Matches your interest in robotics", "From someone you
  follow", ...), or none. These are rule-based and are not labelled AI.
* **Paging**: the first request ranks a window of 90 posts as of `asOf`; later pages re-rank the same window and slice;
  when the window is used up the feed continues newest-first. Cost per page is constant: 3 bounded queries.
* **Controls**: "Tune your feed" (interests, optional), "Show less like this" (private, undoable), and
  Settings -> Privacy -> "Personalise my feed" (off = no interests, follows or activity are used).
* **Fallback**: if the ranking functions are missing or fail, the plain newest-first feed is served.

## 3. AI: what it does here

Already in the repository and kept (Groq through LangChain `ChatGroq`, optional OpenAI-compatible fallback, bounded retries,
zod-validated JSON, per-user throttle and daily budget, usage logging without prompt text): writing assist (clarity,
title, tags, project structure, question sharpening), related-work search, teammate explanations, discussion summaries.

Added: `summarize_post` (on demand, posts of 600+ characters, public or college posts only; labelled "AI summary").
Changes to the runner: cache keys now include the model id; a process-local cache is used when Redis is absent; identical
concurrent requests share one model call. Output is capped at 450 tokens; a post edit changes the prompt text, hence the
cache key, so a stale summary cannot be shown.

Not added, deliberately: LangGraph, vector database changes, a second paid provider, AI in ranking. LangChain stays because
`ChatGroq` is already integrated and tested; replacing it would be churn without a benefit.

## 4. Caching and storage

| What | Where | Limits |
| --- | --- | --- |
| Feed pages scrolled through | IndexedDB `unisphere-feed` (`lib/client/feed-cache.js`) | 75 posts/entry, 8 entries/account, 10 min; used only if the server's first page still starts with the same post; wiped on log out; reactions/bookmarks/deletes update the copy |
| Drafts | localStorage (existing) | text only, 7 days, wiped on log out |
| AI results | Redis if configured, else process memory | key = hash(model, prompt incl. content); 200 entries |
| Settings/flags | existing layered cache | unchanged |

Nothing private is shared across accounts: the feed cache is keyed by user id, and AI cache keys are content hashes of
text the requester was already allowed to send.

## 5. When to add more

| Component | Add it when (measure first) |
| --- | --- |
| Redis for rate limits/caches | more than one app instance, or `ai_usage_logs.cache_hit` shows repeated identical work that the process cache misses |
| Materialised per-user feed / background ranking | `feed_candidates` + `viewer_affinity` p95 above ~150 ms at your real post volume (`EXPLAIN (ANALYZE, BUFFERS)`), or the 90-post window no longer covers a day of posts |
| pgvector ranking | related-work search (already semantic) shows users cannot find relevant posts with tags and interests |
| Trigram index on `profiles.full_name` word starts | `mention_suggestions` slows past ~50 ms with many thousands of profiles (the existing trigram indexes cover prefix/substring today) |
| A queue for AI | model calls routinely exceed the request timeout or provider quota is hit under normal load |

## 6. Measurements (local, one machine, 230 posts / 439 profiles, one run each; not a load test)

`EXPLAIN (ANALYZE, BUFFERS)` as a signed-in member: `feed_posts('college', 16)` 38 ms / 6,242 buffers;
`feed_candidates(90)` 27 ms / 4,023; `viewer_affinity` 5.6 ms / 541; `mention_suggestions('adm')` 19 ms / 2,262 against
`search_people` 27 ms / 2,578; `suggest_hashtags('ro')` 1.3 ms / 155.
Page load through a production build (12 loads each, same member): median 1.19-1.27 s for `?scope=college` vs
1.46-1.48 s for For you to network idle (65 vs 69 requests), i.e. ranking a 90-post window and showing 15 richer cards
costs roughly a quarter of a second more locally. Ranking 150 posts in JavaScript is asserted under 100 ms in a unit test.
No claim is made about concurrent users: no load test was run.
