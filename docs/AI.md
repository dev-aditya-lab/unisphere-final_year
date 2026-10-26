# AI features

AI in UniSphere is an **assistant, never an author or a judge**. Nothing it produces is published, sent or decided
without a person pressing the button. Every AI feature has a non-AI fallback, and each can be switched off.

## What it does

| Feature | Where | What the AI does | Without AI |
| --- | --- | --- | --- |
| Idea discovery | Composer, idea pages | Extracts the concepts in your text and explains *why* related posts and projects match | Keyword and full-text matches, still listed |
| Originality check | Ideas | Compares with existing ideas and says how close they are, with links | Shows the related list only |
| Improvements | Ideas | Suggests ways to sharpen or extend an idea | Hidden |
| Writing assistant | Composer | Clearer wording, titles, tags, category, project structure, sharper questions | Hidden |
| Discussion summary | Posts with 3+ comments | One short summary of the thread | Hidden |
| Teammate explanations | Projects | A sentence on why each suggested person could fit, using only their listed skills and interests | Skills overlap shown without the sentence |
| Report triage (staff) | Admin → Reports | Suggests a category and severity to a moderator. A human decides | No suggestion |

Matching itself is done with SQL (full-text, skill overlap, optional vector similarity). The AI only *explains* results.

## Privacy rules (enforced in code)

1. **Opt-out per member**: Settings → Privacy → "AI assist" → "Allow AI assist". When off, nothing the member writes goes to a provider.
2. **Visibility**: private, connections-only and community posts are never sent. College-visible text is sent only if an
   administrator allows it (`ai_share_college_content`). Text visible to "all members" is eligible. UniSphere has no
   content that is public to the internet.
3. **No storage of content**: the `ai_usage_logs` table keeps task name, provider, model, timing, token counts and
   outcome. Prompts and replies are not stored.
4. **Untrusted text is fenced**: user content is wrapped in tagged blocks and the model is told it is data, not
   instructions; replies are parsed as JSON and validated with a schema, with one repair attempt, then a clean failure.
5. **Moderation use is advisory** and is skipped for non-public content.
6. **Budget**: per-member daily limit (`ai_daily_limit_per_user`, default 30) and a short-window rate limit.

## Configuration

| Setting | Where | Notes |
| --- | --- | --- |
| `AI_ENABLED` | env | Master switch for the whole server |
| `GROQ_API_KEY` | env | The provider (via LangChain `ChatGroq`, JSON-object responses) |
| `GROQ_MODEL_FAST` / `GROQ_MODEL_SMART` / `GROQ_MODEL_SAFETY` | env | Models per tier: fast for tags/titles/classification, smart for reasoning, safety for triage |
| `NVIDIA_AI_API_KEY`, `NVIDIA_AI_MODEL`, `NVIDIA_AI_BASE_URL` | env | NVIDIA's hosted API, used only by the admin "Draft with AI" for Daily Challenge questions (task `draft_daily_question`, 60 s timeout, `reasoning_effort: low`). It never falls back to Groq and Groq tasks never use it |
| `auto_question_draft`, `auto_question_publish` | Admin → Orbits | Switches for the automatic Daily Challenge draft (16:00 IST) and publish (02:00 IST), see `docs/ORBITS.md` |
| `AI_FALLBACK_BASE_URL`, `_API_KEY`, `_MODEL` | env | Optional second provider (any OpenAI-compatible API) tried if Groq fails |
| `AI_DAILY_LIMIT_PER_USER`, `AI_REQUEST_TIMEOUT_MS` | env | Guardrails |
| Feature flags `ai_features`, `ai_idea_discovery`, `ai_post_assistant`, `ai_matching`, `ai_moderation_assist` | Admin → Settings | Switch features off at runtime |
| `ai_daily_limit_per_user`, `ai_share_college_content` | Admin → Settings | Budget and the college-content rule |
| `EMBEDDING_PROVIDER`, `EMBEDDING_*` | env | Optional vectors for semantic search (768 dimensions). `nvidia` + `nvidia/nemotron-3.5-embed-1b` uses NVIDIA's hosted model with `NVIDIA_AI_API_KEY`; its 2048 values are cut to the first 768 and re-normalised |

**Changing the embedding model.** Vectors from different models are not comparable (the nemotron 8B and 1B models score
about 0 against each other on identical text), so there is deliberately no automatic cross-model fallback: one index, one
model. If the configured model is unreachable, searches use keyword matching and new content waits in the job queue with
back-off. The hosted 8B model (`nvidia/nemotron-3.5-embed-8b`, 4096 values) timed out on every try on 2026-10-26, which is
why the 1B is the default. To switch model on purpose, change `EMBEDDING_MODEL`; each tick
of the worker then re-embeds up to 50 rows still stored by the old model (`requeueStaleEmbeddings`), and until a row is
re-embedded it is simply not matched semantically.

Model catalogues change. **Admin → AI status** lists the models your key can actually use right now and marks the
configured ones as active or missing: check it after changing keys or models, and whenever AI features start failing.

## Reliability

Requests have a timeout, bounded retries (permanent errors such as an invalid key are never retried), a Redis cache for
repeatable tasks, and a fallback provider. An AI failure never blocks posting or navigation: the feature reports
"not available right now" and the page keeps working. Embedding generation runs in the worker from a durable job queue
with de-duplication and back-off, so a provider outage only delays semantic search.

## What it does not do

- It does not rank the feed, write posts or comments for people, decide moderation outcomes, or read private messages.
- It does not train on member content; providers receive the request text only for that request.
- It does not guarantee originality: the check says how similar *existing UniSphere content* is, nothing more.
