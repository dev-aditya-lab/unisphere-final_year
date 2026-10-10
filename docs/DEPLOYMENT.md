# Deploying UniSphere

This is the path from "works on my laptop" to "RGEC students can use it". Do the steps in order; each ends with a
check that tells you it worked.

## What you are deploying

| Piece | Runs where | Notes |
| --- | --- | --- |
| **Web app** (Next.js, standalone output) | Docker container / any Node 22 host | Stateless: scale by running more copies |
| **Worker** | A second container (or any scheduler hitting one URL) | Sends emails and push, reminders, scheduled deletions, embeddings |
| **Supabase** | Supabase cloud project, or your own | Postgres + Auth + Realtime. The database is the source of truth |
| **Redis** | Container or Upstash | Rate limits and caches only. Losing it loses nothing important |
| **Cloudflare R2** | Cloudflare | Private bucket (attachments, ID documents) and an optional public bucket (avatars) |
| **Resend** | Resend | Transactional email (app mail and Supabase Auth mail) |
| **Groq** (+ optional embeddings provider) | Their API | AI features. Optional |

## 0. Decide the address

Pick the public HTTPS URL, for example `https://unisphere.<your-domain>`. It goes into `NEXT_PUBLIC_APP_URL`, Supabase
Auth's *Site URL*, the sitemap, emails and the Android asset links. **Changing it later means rebuilding the image.**

## 1. Supabase project

1. Create a project (or self-host). Note the **Project URL**, the **publishable key** and the **secret key**.
2. Apply the schema. With the CLI linked to the project:
   ```bash
   npx supabase link --project-ref <ref>
   npx supabase db push          # applies supabase/migrations in order
   ```
   Do **not** run `supabase/seed.sql` in production: it is development data only.
3. In **Authentication → URL configuration**: Site URL = your public URL; add
   `https://<your-domain>/auth/callback` and `https://<your-domain>/auth/confirm` to the redirect list.
4. In **Authentication → Providers → Email**: keep "Confirm email" **on**; set a sensible minimum password length (8+).
5. In **Authentication → SMTP**: use Resend (`smtp.resend.com`, port 465, user `resend`, password = your API key, sender
   on your verified domain). Paste the three templates from `supabase/templates/` into **Authentication → Email
   Templates** (confirm signup, reset password, change email); they use `{{ .SiteURL }}` for the logo.
6. In **Authentication → Rate limits** leave the defaults; the app has its own limits too.
7. Turn on **Point-in-time recovery** or scheduled backups for the database (see OPERATIONS.md).

Check: `select count(*) from public.colleges where slug = 'ramgarh-engineering-college';` returns 1.

## 2. Storage (Cloudflare R2)

1. Create two buckets: `unisphere-private` and, optionally, `unisphere-public` (enable public access or attach a custom
   domain such as `media.<your-domain>`).
2. Create an R2 API token with *Object Read & Write* on both buckets.
3. Set `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`,
   `CLOUDFLARE_R2_BUCKET_NAME`, and for the public bucket `CLOUDFLARE_R2_PUBLIC_BUCKET_NAME`,
   `CLOUDFLARE_R2_PUBLIC_URL` and `NEXT_PUBLIC_MEDIA_URL` (the last is a **build** value).

Without the public bucket everything still works: avatars are served from the private bucket through the app.

## 3. Email (Resend)

Verify your sending domain in Resend (add the SPF and DKIM DNS records), then set `RESEND_API_KEY` and
`EMAIL_FROM="UniSphere <no-reply@your-domain>"`. Details and troubleshooting in [EMAIL.md](EMAIL.md).

## 4. Secrets and configuration

Create `.env.docker` from `.env.example` and fill in the production values. Generate the secrets:

```bash
openssl rand -hex 32     # CRON_SECRET
openssl rand -hex 32     # APP_SECRET   (REQUIRED in production)
npx web-push generate-vapid-keys        # NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
```

| Must set | Why |
| --- | --- |
| `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Compiled into the browser bundle (**build arguments**) |
| `SUPABASE_SECRET_KEY` | Server only. Bypasses RLS: treat like a root password |
| `APP_SECRET` | Keys the student-ID hashes and one-time codes. **Back it up and never rotate casually**: changing it invalidates the imported student-ID list (you would have to re-import it) |
| `CRON_SECRET` | Authenticates the worker to `/api/cron/tick` |
| `RESEND_API_KEY`, `EMAIL_FROM` | Email |
| R2 variables | File uploads |

Optional: `REDIS_URL` (compose sets it for you), `GROQ_API_KEY`, embeddings, VAPID keys, Android variables.

## 5. Build and run

```bash
docker compose --env-file .env.docker up -d --build
docker compose ps                       # app should become "healthy"
curl -s https://<your-domain>/api/health            # {"status":"ok","version":"x.y.z"}
curl -s "https://<your-domain>/api/health?deep=1"   # also checks the database
```

Put a TLS-terminating reverse proxy in front (Caddy, Nginx, Traefik, a cloud load balancer, or Cloudflare). The app sets
HSTS in production, so serve it **only** over HTTPS. Forward the original `Host` and `X-Forwarded-*` headers.

Other hosts: any platform that runs a Node 22 container works. If you deploy without Docker, run
`npm ci && npm run build && npm start`, and run `npm run worker` (or a scheduler calling
`POST /api/cron/tick` with `Authorization: Bearer $CRON_SECRET` every 30 to 60 seconds) beside it.

## 6. First administrator

On a machine with the production env values (never commit them):

```bash
npm run create-admin -- you@rgec.example "Your Name"
```

The script writes the password to `.env.local` as a comment: copy it to your password manager and delete it from the
file. Log in, open `/admin`, then immediately:

1. **Staff & roles**: appoint a second global admin (so you are never the only one), and college admins/moderators.
2. **Settings**: set the public support email, review "Require college verification to publish" (on by default).
3. **Student IDs**: import the college's list (see [ADMIN_GUIDE.md](ADMIN_GUIDE.md)).

## 7. Go-live checklist

- [ ] `/api/health?deep=1` is `ok` over HTTPS and the HTTP URL redirects to HTTPS
- [ ] Sign-up email arrives (check spam), the link logs you in, a password-reset email works
- [ ] Upload an avatar and a post image; they display after a refresh
- [ ] A student ID from the list verifies; the same ID cannot be claimed by a second account
- [ ] Worker is running: Admin → AI status shows jobs moving, a test push arrives (Settings → Notifications)
- [ ] `https://<your-domain>/robots.txt`, `/sitemap.xml`, `/llms.txt`, `/manifest.webmanifest` load
- [ ] Response headers include `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`
- [ ] Backups verified: you have restored one into a scratch project at least once
- [ ] `APP_SECRET`, `SUPABASE_SECRET_KEY` and `CRON_SECRET` are stored in a password manager and are not in git
- [ ] At least two people can sign in as global admin
- [ ] Privacy policy, terms and guidelines text reviewed by the college (editable in Admin → Settings)

## Updating

1. `git pull`, then `npx supabase db push` for any new migrations (they are forward-only and idempotent where possible).
2. `docker compose --env-file .env.docker up -d --build`.
3. Check `/api/health?deep=1`, then publish release notes in Admin → Releases.

Roll back by redeploying the previous image tag. Migrations are additive, so the previous version keeps working with the
newer schema in nearly every case; if a release ever includes a destructive migration it says so at the top of its file.
