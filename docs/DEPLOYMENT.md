# Deploying UniSphere

UniSphere is a normal Next.js app plus a database, so it runs in three common ways. Pick one:

| | **A. Vercel** | **B. Render free plan** | **C. Your own VPS** |
| --- | --- | --- | --- |
| Cost | Free (Hobby) | Free | A small paid server (about 1 vCPU / 1 to 2 GB RAM is enough) |
| Setup effort | Easiest | Easy | Most work, most control |
| Always on | Yes | **Sleeps after ~15 min idle** (a scheduled ping keeps it awake) | Yes |
| Background jobs (email, push, reminders) | Scheduled calls (GitHub Actions every 5 min) | Scheduled calls (GitHub Actions every 5 min) | A real worker container (every 30 s) |
| Best for | Launch and normal use | Trying it out, a demo | Long-term, full control |

All three need the same four outside services. They have free tiers that are enough for a college community:

| Service | What it does | Free-tier notes (check current limits) |
| --- | --- | --- |
| **Supabase** (cloud) | Database, sign-in, live updates | A free project works. **Free projects pause after about a week without activity**; opening the dashboard (or any traffic) wakes it |
| **Cloudflare R2** | Uploaded images and files | A generous free allowance; no bandwidth fees |
| **Resend** | Email (sign-up, password reset, notifications) | A small free monthly allowance; you must verify your own sending domain |
| **Upstash Redis** (optional) | Shared rate limiting | Free tier; without it limits are per server instance and weaker |

Optional: **Groq** (AI features, free tier) and **VAPID keys** (push notifications, free, you generate them).

> **Reminder: this is a closed network.** Nothing but the home, about, features, guidelines, contact, privacy and terms
> pages is visible without signing in, and (in production) nobody sees anything until they verify with their student ID.
> That is built in; you do not need to configure it. See [ADMIN_GUIDE.md](ADMIN_GUIDE.md).

---

## Step 0: Common setup (do this once, whichever host you choose)

### 0.1 Decide the address
Pick the final public URL, for example `https://unisphere.onrender.com`, `https://unisphere.vercel.app` or
`https://unisphere.<your-domain>`. It is used in links, emails and the app manifest. **Changing it later means rebuilding.**

### 0.2 Create the Supabase project
1. supabase.com → New project. Choose the region nearest to you (Mumbai/Singapore). Save the **database password**.
2. Project Settings → API: copy **Project URL**, the **publishable (anon) key** and the **secret (service_role) key**.
3. Apply the database schema (from your computer, inside the repository):
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push            # applies every file in supabase/migrations in order
   ```
   Do **not** run `supabase/seed.sql`; it is development-only demo data.
4. Authentication → **URL Configuration**: *Site URL* = your public URL; add `https://<your-domain>/auth/confirm` and
   `https://<your-domain>/auth/callback` to *Redirect URLs*.
5. Authentication → **Providers → Email**: keep *Confirm email* **on**.
6. Authentication → **SMTP Settings**: enable custom SMTP with Resend (`smtp.resend.com`, port `465`, user `resend`,
   password = your Resend API key, sender = `no-reply@your-domain`). Then **Email Templates**: paste the three files in
   `supabase/templates/`. (Without custom SMTP, Supabase's built-in email is heavily rate-limited and unsuitable.)

Check: SQL editor → `select name from public.colleges where slug = 'ramgarh-engineering-college';` returns the college.

### 0.3 Storage (Cloudflare R2)
Create bucket `unisphere-private` (and optionally `unisphere-public`), then an API token with *Object Read & Write*.
You will need: account id, access key id, secret access key, bucket name(s).

### 0.4 Email (Resend)
Add and verify your sending domain (SPF + DKIM DNS records), create an API key. Details: [EMAIL.md](EMAIL.md).
No domain yet? You can only send to your own address until you have one, so get one before launch.

### 0.5 Generate secrets
```bash
openssl rand -hex 32     # use as CRON_SECRET
openssl rand -hex 32     # use as APP_SECRET   (keep it forever: it keys the student-ID hashes)
npx web-push generate-vapid-keys      # NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY (optional, for push)
```
No `openssl`? Use any password manager's "generate 64 hex characters".

### 0.6 The environment variables
| Variable | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | yes | The public URL. **Build-time** |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | **Build-time** |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | **Build-time** |
| `SUPABASE_SECRET_KEY` | yes | Server only. Treat like a root password |
| `APP_SECRET` | yes | Never change it casually |
| `CRON_SECRET` | yes | Authenticates the background job caller |
| `RESEND_API_KEY`, `EMAIL_FROM` | yes in practice | e.g. `UniSphere <no-reply@your-domain>` |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`, `CLOUDFLARE_R2_BUCKET_NAME` | for uploads | |
| `REDIS_URL` | optional | Upstash `rediss://default:<password>@<host>:6379` |
| `GROQ_API_KEY` (+ `AI_ENABLED=true`) | optional | AI features |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | optional | Push. Public key is **build-time** |
| `NEXT_PUBLIC_MEDIA_URL`, `CLOUDFLARE_R2_PUBLIC_BUCKET_NAME`, `CLOUDFLARE_R2_PUBLIC_URL` | optional | Direct delivery of avatars from a public bucket |

"Build-time" values are compiled into the browser code: set them **before** the first build and rebuild if you change them.

### 0.7 First administrator
After the first deployment (so the app can reach the database), on your own computer with the same values in `.env.local`:
```bash
npm run create-admin -- you@example.com "Your Name"
```
This creates a confirmed global administrator and writes the password into `.env.local` as a comment. Copy it to a
password manager and delete the comment. Then sign in and open `/admin`: appoint a second administrator, set the
support email in Settings, and import the student-ID list (Admin → Student IDs).

---

## A. Deploy on Vercel

1. Push the repository to GitHub.
2. vercel.com → **Add New → Project** → import the repository. Framework is detected as Next.js; keep defaults.
3. Add the environment variables from 0.6 (Production). The `NEXT_PUBLIC_*` ones must be present **before** the build.
4. Deploy. The included `vercel.json` registers a daily safety-net call to the job endpoint.
5. **Background jobs.** Vercel serverless functions cannot run a worker. Use the included GitHub Actions workflow:
   - Repository → Settings → Secrets and variables → Actions → add **secret** `CRON_SECRET` (same value as in Vercel) and
     **variable** `APP_URL` (your public URL).
   - The workflow `.github/workflows/worker-tick.yml` then calls `/api/cron/tick` every 5 minutes.
   - Vercel's own cron also sends `Authorization: Bearer $CRON_SECRET` once a day, which the endpoint accepts.
6. Add your domain in Vercel (optional) and update `NEXT_PUBLIC_APP_URL` + Supabase *Site URL* if it changes (then redeploy).

Limits to know: the Hobby plan is for non-commercial use (a college project qualifies, but read their terms); function
time is capped (the job endpoint is written to finish in under a minute); Vercel cron on Hobby runs at most daily, which
is why GitHub Actions does the frequent calls.

## B. Deploy on Render (free plan)

1. Push the repository to GitHub.
2. Render dashboard → **New → Blueprint** → select the repository. It reads `render.yaml` and creates the web service on the
   **free** plan. Fill in the environment variables it asks for (section 0.6).
3. Wait for the first build. If it fails with an out-of-memory error (the free instance is small), use the prebuilt image
   route below instead.
4. **Keep it awake and run background jobs.** The free instance sleeps after about 15 minutes idle (the next visitor waits
   up to a minute). The same GitHub Actions workflow as above fixes both: add `CRON_SECRET` (secret) and `APP_URL`
   (variable), and it pings the app and runs jobs every 5 minutes. It then rarely sleeps.
5. Set `NEXT_PUBLIC_APP_URL` to the `https://<name>.onrender.com` address (or your custom domain) **before** building.

**If the free build runs out of memory:** let GitHub build the image instead.
- Repository → Settings → Secrets and variables → Actions → **Variables**: add `NEXT_PUBLIC_APP_URL`,
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (and optionally `NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
  `NEXT_PUBLIC_MEDIA_URL`).
- The workflow `.github/workflows/docker-image.yml` builds and publishes `ghcr.io/<owner>/<repo>:latest` on every push.
- On Render choose **New → Web Service → Deploy an existing image** and give it that image URL, plus the server-side
  variables. (Make the package public, or add registry credentials.)

Free-plan realities: it is fine for trying UniSphere out and for a small community, but expect a cold start after idle
time, and no persistent disk (UniSphere does not need one). For a live launch consider option A or C.

## C. Deploy on a VPS (Docker)

Works on any Ubuntu/Debian server from DigitalOcean, Hetzner, AWS Lightsail, Oracle, a college server, etc.

1. **Point a domain** at the server: create an `A` record (for example `unisphere.your-domain.com` → the server's IP).
2. **Prepare the server** (as root):
   ```bash
   git clone <your-repo-url> unisphere && cd unisphere
   bash deploy/vps-bootstrap.sh        # installs Docker, a firewall (22/80/443), automatic security updates
   ```
3. **Configure**: `cp .env.example .env.docker` and fill it in (section 0.6). Also add:
   ```
   DOMAIN=unisphere.your-domain.com
   NEXT_PUBLIC_APP_URL=https://unisphere.your-domain.com
   ```
4. **Start** (builds the image, then starts the app, worker, Redis and Caddy for automatic HTTPS):
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.vps.yml --env-file .env.docker up -d --build
   docker compose ps                   # everything should be "running" / "healthy"
   curl -s https://unisphere.your-domain.com/api/health
   ```
   The first HTTPS certificate takes a minute. The worker container runs the background jobs every 30 seconds, so you do
   **not** need GitHub Actions on a VPS.
5. **Update later**: `git pull && docker compose -f docker-compose.yml -f docker-compose.vps.yml --env-file .env.docker up -d --build`.
   Run `npx supabase db push` first if the release added a migration.
6. **Backups**: enable Supabase backups, and see [OPERATIONS.md](OPERATIONS.md).

No Docker? `npm ci && npm run build && npm start` works too; run `npm run worker` as a second process (for example with
`systemd` or `pm2`) and put Caddy or Nginx in front for HTTPS.

---

## Go-live checklist

- [ ] `https://<your-domain>/api/health?deep=1` returns `{"status":"ok", ...}`
- [ ] A signed-out visitor sees only the home/about/legal pages; `/feed` and `/u/anyone` send them to the login page
- [ ] Sign-up email arrives (check spam); the link signs you in; a password-reset email works
- [ ] A student ID from the imported list verifies; the same ID cannot be claimed by a second account
- [ ] An unverified account sees only the "Verify to enter UniSphere" screen
- [ ] Upload an avatar and a post image; they display after a refresh
- [ ] Background jobs run: send a test push (Settings → Notifications) and check Admin → AI status for job counts
- [ ] Response headers include `Content-Security-Policy` and `Strict-Transport-Security`
- [ ] At least two people can sign in as global admin; secrets are in a password manager, not in git
- [ ] Privacy policy, terms and guidelines text reviewed by the college (editable in Admin → Settings)
- [ ] Support email set in Admin → Settings

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Build fails: `Invalid environment configuration` | A required variable is missing; the message names it |
| Pages work but sign-in loops or "invalid redirect" | Supabase *Site URL* / redirect URLs do not match `NEXT_PUBLIC_APP_URL` |
| Everything redirects to the login page, even the home page | `NEXT_PUBLIC_*` values were wrong at build time; fix and rebuild |
| Sign-up email never arrives | Supabase SMTP not configured, or the sender domain is not verified in Resend |
| Images do not load for signed-in members | R2 variables missing, or `CLOUDFLARE_ACCOUNT_ID` wrong (the CSP allows only your own account's R2 host) |
| Notifications and emails are delayed | The worker/tick is not running: check GitHub Actions runs (A, B) or `docker compose logs worker` (C) |
| Free Render site is slow on first visit | It was asleep; the scheduled ping reduces this but cannot remove it |
| Supabase calls fail after a quiet week | The free project paused; open the Supabase dashboard and click *Restore* |

## Updating and rolling back

Migrations are forward-only and additive, so deploying the previous version of the code against a newer schema keeps
working in nearly every case. To roll back, redeploy the previous commit (Vercel: *Promote* an older deployment; Render:
*Rollback*; VPS: `git checkout <old-tag>` and rebuild). If a release ever includes a destructive migration it says so at
the top of its file.
