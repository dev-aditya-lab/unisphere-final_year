# Deploying UniSphere

UniSphere is a normal Next.js app plus a database, so it runs in three common ways. Pick one:

| | **A. Vercel** | **B. Render free plan** | **C. Your own VPS** |
| --- | --- | --- | --- |
| Cost | Free (Hobby) | Free | A small paid server (about 1 vCPU / 1 to 2 GB RAM is enough) |
| Setup effort | Easiest | Easy | Most work, most control |
| Always on | Yes | **Sleeps after ~15 min idle** (a scheduled ping keeps it awake) | Yes |
| Background jobs (email, push, reminders) | UptimeRobot calls the job endpoint every 5 min | UptimeRobot calls the job endpoint every 5 min | A worker process (`npm run worker`, every 30 s) |
| Best for | Launch and normal use | Trying it out, a demo | Long-term, full control |

All three need the same four outside services. They have free tiers that are enough for a college community:

| Service | What it does | Free-tier notes (check current limits) |
| --- | --- | --- |
| **Supabase** (cloud) | Database, sign-in, live updates | A free project works. **Free projects pause after about a week without activity**; opening the dashboard (or any traffic) wakes it |
| **Cloudflare R2** | Uploaded images and files | A generous free allowance; no bandwidth fees |
| **Resend** | Email (sign-up, password reset, notifications) | A small free monthly allowance; you must verify your own sending domain |
| **Upstash Redis** (optional) | Shared rate limiting | Free tier; without it limits are per server instance and weaker |

Optional: **Groq** (AI features, free tier) and **VAPID keys** (push notifications, free, you generate them).

> **Reminder: open to join, private to view.** Nothing but the home, about, features, guidelines, contact, privacy and
> terms pages is visible without signing in; anyone can register. That is built in; you do not need to configure it.
> See [ADMIN_GUIDE.md](ADMIN_GUIDE.md).

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
openssl rand -hex 32     # use as APP_SECRET
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
| `TRUSTED_PROXY_HOPS` | recommended | How many reverse proxies append to `X-Forwarded-For` (default `1`: Vercel, Render, Caddy/Nginx; `2` with Cloudflare in front). Per-IP rate limits depend on it: see [SECURITY.md](SECURITY.md#rate-limiting) |
| `UPLOAD_SCAN_URL`, `UPLOAD_SCAN_TOKEN` | optional | A malware-scanning service for PDF uploads. Without it PDFs are validated but not scanned |
| `REDIS_URL` | optional | Upstash `rediss://default:<password>@<host>:6379` |
| `GROQ_API_KEY` (+ `AI_ENABLED=true`) | optional | AI features |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | optional | Push. Public key is **build-time** |
| `FIREBASE_SERVICE_ACCOUNT` | optional | Push to the Android app. JSON or its base64 (`docs/ANDROID_APP.md`). Secret |
| `PUSH_LOOP_SECONDS` | optional | How often the running server sends pending push notifications itself. Default 15; `0` turns it off (the `/api/cron/tick` call still does it, every ~5 minutes). See `docs/NOTIFICATIONS.md` |
| `ANDROID_PACKAGE_NAME`, `ANDROID_SHA256_CERT_FINGERPRINTS` | optional | Makes links open in the Android app (`/.well-known/assetlinks.json`) |
| `NEXT_PUBLIC_MEDIA_URL`, `CLOUDFLARE_R2_PUBLIC_BUCKET_NAME`, `CLOUDFLARE_R2_PUBLIC_URL` | optional | Direct delivery of avatars from a public bucket. Set all three or none. Cache and Cloudflare settings: `docs/MEDIA_CACHING.md` |
| `NEXT_PUBLIC_MEDIA_RESIZE` | optional | `cloudflare` serves avatars and covers at the size they are shown (needs Cloudflare Image Transformations on the media domain) |

"Build-time" values are compiled into the browser code: set them **before** the first build and rebuild if you change them.

### 0.7 First administrator
After the first deployment (so the app can reach the database), on your own computer with the same values in `.env.local`:
```bash
npm run create-admin -- you@example.com "Your Name"
```
This creates a confirmed global administrator and writes the password into `.env.local` as a comment. Copy it to a
password manager and delete the comment. Then sign in and open `/admin`: appoint a second administrator, set the
and support email in Settings.

---

## A. Deploy on Vercel

1. Push the repository to GitHub.
2. vercel.com → **Add New → Project** → import the repository. Framework is detected as Next.js; keep defaults.
3. Add the environment variables from 0.6 (Production). The `NEXT_PUBLIC_*` ones must be present **before** the build.
4. Deploy. The included `vercel.json` registers a daily safety-net call to the job endpoint.
5. **Background jobs.** Vercel serverless functions cannot run a worker, so set up the UptimeRobot monitor in
   [Background jobs with UptimeRobot](#background-jobs-with-uptimerobot) below. Vercel's own cron also calls the endpoint
   once a day with `Authorization: Bearer $CRON_SECRET`, which it accepts.
6. Add your domain in Vercel (optional) and update `NEXT_PUBLIC_APP_URL` + Supabase *Site URL* if it changes (then redeploy).

Limits to know: the Hobby plan is for non-commercial use (a college project qualifies, but read their terms); function
time is capped (the job endpoint is written to finish in under a minute); Vercel cron on Hobby runs at most daily, which
is why UptimeRobot does the frequent calls.

## B. Deploy on Render (free plan)

1. Push the repository to GitHub.
2. Render dashboard → **New → Blueprint** → select the repository. It reads `render.yaml` and creates the web service on the
   **free** plan. Fill in the environment variables it asks for (section 0.6).
3. Wait for the first build. If it fails with an out-of-memory error (the free instance is small), use the prebuilt image
   route below instead.
4. **Keep it awake and run background jobs.** The free instance sleeps after about 15 minutes idle (the next visitor waits
   up to a minute). The UptimeRobot monitor in
   [Background jobs with UptimeRobot](#background-jobs-with-uptimerobot) pings the app and runs the jobs every 5
   minutes, so it rarely sleeps.
5. Set `NEXT_PUBLIC_APP_URL` to the `https://<name>.onrender.com` address (or your custom domain) **before** building.

**If the free build runs out of memory:** the free instance is small. Deploy to Vercel (option A) instead, or build once
on a larger Render plan and scale back down.

Free-plan realities: it is fine for trying UniSphere out and for a small community, but expect a cold start after idle
time, and no persistent disk (UniSphere does not need one). For a live launch consider option A or C.

## C. Deploy on a VPS

Works on any Ubuntu/Debian server from DigitalOcean, Hetzner, AWS Lightsail, Oracle, a college server, etc.

1. **Point a domain** at the server: create an `A` record (for example `unisphere.your-domain.com` → the server's IP).
2. **Install** Node.js 22+, Git and a reverse proxy (Caddy gives automatic HTTPS):
   ```bash
   git clone <your-repo-url> unisphere && cd unisphere
   cp .env.example .env.production.local     # fill it in (section 0.6); NEXT_PUBLIC_APP_URL=https://<your-domain>
   npm ci && npm run build
   ```
3. **Run it** under a process manager so it restarts on failure and on reboot, for example pm2:
   ```bash
   npm i -g pm2
   pm2 start npm --name unisphere -- start
   pm2 start npm --name unisphere-worker -- run worker     # background jobs every 30 s (or use UptimeRobot instead)
   pm2 save && pm2 startup
   ```
4. **HTTPS**: put Caddy or Nginx in front, proxying your domain to `localhost:3000`. Caddy needs only:
   ```
   unisphere.your-domain.com {
     reverse_proxy localhost:3000
   }
   ```
5. **Update later**: `git pull && npm ci && npm run build && pm2 restart all`. Run `npx supabase db push` first if the
   release added a migration.
6. **Backups**: enable Supabase backups, and see [OPERATIONS.md](OPERATIONS.md).

If you would rather not run a worker process, use the UptimeRobot monitor below instead; do not run both.

## Background jobs with UptimeRobot

UniSphere does its background work (notification emails, push, event reminders, AI embeddings, cleanup) when
`/api/cron/tick` is called. [UptimeRobot](https://uptimerobot.com)'s free plan calls a URL every 5 minutes, which is
enough, and it also alerts you when the site is down and keeps a free Render instance from sleeping.

1. Make a long random value for `CRON_SECRET` (for example `openssl rand -base64 32`) and set it in your host's
   environment variables. Redeploy.
2. In UptimeRobot create **two** monitors (type *HTTP(s)*):

   | Monitor | URL | Interval | Purpose |
   | --- | --- | --- | --- |
   | UniSphere jobs | `https://<your-domain>/api/cron/tick?secret=<CRON_SECRET>` | 5 minutes | Runs background work, keeps Render awake |
   | UniSphere health | `https://<your-domain>/api/health?deep=1` | 5 minutes | Tells you if the site or database is down |

3. Check the first run: in UptimeRobot open the jobs monitor's response; it should be `{"ok":true,...}`. A `401` means
   the secret in the URL does not match `CRON_SECRET`.

Notes:
- The free plan cannot send custom headers, which is why the endpoint also accepts `?secret=`. The value is in the URL,
  so treat it like a password: use a long random secret, do not paste the URL anywhere public, and rotate
  `CRON_SECRET` (and the monitor URL) if it leaks.
- The endpoint is safe to call often: it only processes what is waiting, and refuses everything without the secret.
- If UptimeRobot is paused, jobs simply wait; nothing is lost. Vercel's daily cron (if you use Vercel) is a safety net.

---

## Go-live checklist

- [ ] `https://<your-domain>/api/health?deep=1` returns `{"status":"ok", ...}`
- [ ] A signed-out visitor sees only the home/about/legal pages; `/feed` and `/u/anyone` send them to the login page
- [ ] Sign-up email arrives (check spam); the link signs you in; a password-reset email works
- [ ] A new account with no college can sign up, finish onboarding and post
- [ ] Upload an avatar and a post image; they display after a refresh
- [ ] The UptimeRobot jobs monitor returns `{"ok":true,...}`; send a test push (Settings → Notifications) and check Admin → AI status for job counts
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
| Notifications and emails are delayed | The job endpoint is not being called: check the UptimeRobot jobs monitor (a `401` means a wrong secret) or `pm2 logs unisphere-worker` |
| Free Render site is slow on first visit | It was asleep; the scheduled ping reduces this but cannot remove it |
| Supabase calls fail after a quiet week | The free project paused; open the Supabase dashboard and click *Restore* |

## Updating and rolling back

Migrations are forward-only and additive, so deploying the previous version of the code against a newer schema keeps
working in nearly every case. To roll back, redeploy the previous commit (Vercel: *Promote* an older deployment; Render:
*Rollback*; VPS: `git checkout <old-tag>` and rebuild). If a release ever includes a destructive migration it says so at
the top of its file.
