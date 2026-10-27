# Local setup

Everything runs on your own machine: Supabase (Postgres, Auth, Realtime, a mail catcher) in Docker, plus the Next.js dev
server. Redis, Cloudflare R2, Resend and Groq are optional while developing.

## 1. Prerequisites

| Tool | Version | Why |
| --- | --- | --- |
| Node.js | 22 or newer | Next.js 16, `process.loadEnvFile` in the helper scripts |
| Docker Desktop | current | Runs the local Supabase stack (and Redis, if you want it) |
| Supabase CLI | via `npx supabase` | Starts the stack and applies migrations |
| Git | any | |

## 2. Install and configure

```bash
npm install
cp .env.example .env.local
```

Start Supabase and copy its keys into `.env.local`:

```bash
npx supabase start            # first run downloads images (a few minutes)
npx supabase status -o env    # prints API_URL, PUBLISHABLE_KEY / SERVICE_ROLE_KEY etc.
```

| `.env.local` variable | Value for local development |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `http://127.0.0.1:55321` (the project uses non-default ports so it can coexist with other Supabase projects) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the publishable (anon) key from `supabase status` |
| `SUPABASE_SECRET_KEY` | the secret (service role) key. Server only, never exposed to the browser |
| `CRON_SECRET` | any long random string: `openssl rand -hex 32` |
| `APP_SECRET` | any long random string. If empty in development a value is derived from the Supabase key |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` |

Local ports: API **55321**, Postgres **55322**, Studio **55323**, Mailpit (caught email) **55324**, SMTP **55325**.

## 3. Database

```bash
npx supabase db reset         # recreates the database from supabase/migrations/*.sql, then runs seed.sql
```

`supabase/seed.sql` is development data only. It adds two demo colleges and switches off "verification required to
publish" so you and the tests can post immediately. The migrations themselves create **Ramgarh Engineering College**.

Never edit an applied migration: add a new numbered file instead.

## 4. First administrator and demo data

```bash
npm run create-admin -- you@example.com "Your Name"   # password is written to .env.local as a comment
npm run seed:demo                                     # optional, local database only
```

`create-admin` creates a confirmed account with the **global_admin** role. Log in and open `/admin`.
`seed:demo` refuses to run unless Supabase is on localhost; it creates four fictional students, posts, a project,
a club, an event and a conversation (password `Demo-Pass-2026!`, development only).

## 5. Run

```bash
npm run dev          # http://localhost:3000
npm run worker       # separate terminal; needs CRON_SECRET
```

Without the worker, notification emails, push notifications, event reminders, embedding jobs and scheduled account
deletions simply wait.

## 6. Optional integrations

| Feature | Variables | Without it |
| --- | --- | --- |
| **Redis** (rate limits, AI throttling, caches) | `REDIS_URL=redis://localhost:6379`. Keys are prefixed `unisphere:` so sharing an existing Redis is safe | Per-process in-memory limits |
| **File storage** (Cloudflare R2) | `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`, `CLOUDFLARE_R2_BUCKET_NAME` (+ the public bucket variables for CDN avatars). Run `npm run setup:storage` once to create buckets/CORS | Uploads are refused with a clear message |
| **Email** (Resend) | `RESEND_API_KEY`, `EMAIL_FROM` (a verified domain). See [EMAIL.md](EMAIL.md) | In development mail goes to Mailpit at http://127.0.0.1:55324; in production sends fail loudly |
| **AI** (NVIDIA, Daily Challenge drafts) | `NVIDIA_AI_API_KEY`, optional `NVIDIA_AI_MODEL` | "Draft with AI" is hidden in Admin -> Orbits -> Daily Challenge; questions are written by hand |
| **AI** (Groq) | `GROQ_API_KEY`, optional `GROQ_MODEL_*`. Check `/admin/ai` | AI buttons show a polite "not available" and every feature has a non-AI fallback |
| **Semantic search** | `EMBEDDING_PROVIDER` (`nvidia`, `openai-compatible` or `gemini`) + key/model/URL. NVIDIA: `nvidia` + `EMBEDDING_MODEL=nvidia/nemotron-3.5-embed-1b` (reuses `NVIDIA_AI_API_KEY`) | Keyword and concept search only |
| **Push notifications** | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. Generate with `npx web-push generate-vapid-keys` | The "Push notifications" control explains it is not set up |
| **Push to the Android app** | `FIREBASE_SERVICE_ACCOUNT` (a Firebase service account key; see [ANDROID_APP.md](ANDROID_APP.md)) | The app's notifications control says it is not set up. Web Push is independent of it |

Development-only helpers: `RATE_LIMIT_MULTIPLIER=50` (in `.env.development.local`) stops the test suites being
throttled; it is ignored in production. `NEXT_PUBLIC_PWA_DEV=true` registers the service worker in development.

## 7. Tests

```bash
npm run lint
npm test                 # unit + integration (needs `supabase start`)
npm run test:e2e         # Playwright; starts `npm run dev` itself (or reuses a running one)
```

- **Unit**: pure logic (validators, time zones, AI runner with fake providers, push batching).
- **Integration**: real Postgres with real signed-in JWTs, proving Row Level Security and the permission model.
- **E2E**: browser flows per phase. Some use the real Resend test inbox (`delivered+…@resend.dev`) when a key is set.

Tests create their own users and clean up after themselves; they never need manual data.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `fetch failed` / `ECONNREFUSED` from Supabase calls | Docker Desktop is not running, or `npx supabase start` has not finished. Check `docker ps` |
| "Invalid environment configuration" on start | A required variable is missing; the message names it |
| Login rate-limit errors during repeated testing | Wait five minutes, or set `RATE_LIMIT_MULTIPLIER` in `.env.development.local` |
| Emails never arrive locally | Look in Mailpit (port 55324); with `RESEND_API_KEY` set and `EMAIL_DEV_MAILPIT=false` they go to Resend instead |
| Realtime (live notifications/messages) silent | Check the browser is signed in; the app authenticates the socket before subscribing |
| Port 3000 busy | Another dev server is running. Stop it, or `npm run dev -- -p 3001` and update `NEXT_PUBLIC_APP_URL` |
