# Email

UniSphere sends two kinds of email, through the same provider (Resend) but by two different paths. Knowing which is
which makes problems easy to find.

| Kind | Examples | Sent by | Configured in |
| --- | --- | --- | --- |
| **Authentication** | Confirm your email, reset password, change email | **Supabase Auth** | Supabase → Authentication → SMTP and Email Templates (locally: `supabase/config.toml`) |
| **Application** | Notification emails and digests, contact-form copies | **The app** (`lib/email`) | `RESEND_API_KEY`, `EMAIL_FROM` in the app environment |

Both need the **same verified sending domain** and, in practice, the same Resend API key.

## Set up Resend

1. Create a Resend account and add your domain (for example `mail.rgec.example` or the main domain).
2. Add the DNS records Resend shows: **SPF**, **DKIM**, and (recommended) a **DMARC** record such as
   `v=DMARC1; p=none; rua=mailto:postmaster@your-domain`.
3. Wait until the domain shows *Verified*. Until then Resend only delivers to your own address.
4. Create an API key with *Sending access*.
5. App: `RESEND_API_KEY=re_...` and `EMAIL_FROM="UniSphere <no-reply@your-domain>"`; optionally `EMAIL_REPLY_TO`.
6. Supabase (hosted): Authentication → SMTP: host `smtp.resend.com`, port `465`, username `resend`, password = the API
   key, sender = the same `no-reply@your-domain` address. Paste the templates from `supabase/templates/`.
   Local CLI: `supabase/.env` holds `RESEND_API_KEY` and `config.toml` reads it with `env(RESEND_API_KEY)`.

## How notification email behaves

- Each notification has a category; members choose **in-app** and **email** per category (Settings → Notifications).
  Email defaults to *off* for chatty categories (reactions, comments, messages) and *on* for the ones that matter
  (projects, mentorship, moderation, events).
- Emails are queued, then sent by the worker at least 90 seconds later, so several notifications for one person are
  **combined into one email** instead of one per event. Each send has an idempotency key, so a retry never double-sends.
- A failed send is retried up to three times; the last error is stored on the notification row.
- Email is skipped for members who are blocked, restricted, or who turned the category off.

## Development

With no `RESEND_API_KEY`, or with `EMAIL_DEV_MAILPIT=true`, app mail goes to the local **Mailpit** inbox at
http://127.0.0.1:55324 (SMTP 55325) and Supabase Auth mail goes there too (when the SMTP block in `config.toml` is not
pointing at Resend). Use Resend's test addresses to exercise the real API safely: `delivered@resend.dev`,
`bounced@resend.dev`, or `delivered+anything@resend.dev`.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Sign-up email never arrives (hosted Supabase) | SMTP settings saved? Sender on a verified domain? Resend → Logs shows the attempt? Check spam |
| Sign-up email goes to Mailpit instead of Resend (local) | `supabase/.env` has the key and the stack was restarted (`supabase stop && supabase start`) |
| App emails not sent, `email: not configured` in `/api/health?deep=1` | `RESEND_API_KEY` missing in the *app* environment (the worker does not send email itself; the app does) |
| "The sender domain is not verified" | DNS records not propagated, or `EMAIL_FROM` uses a different domain from the verified one |
| Emails arrive but links point to `localhost` | `NEXT_PUBLIC_APP_URL` (app) and Site URL (Supabase) are not set to the public URL, then rebuild/redeploy |
| Members complain they get too many | They can change categories in Settings → Notifications; digest delay can be raised in `claim_notification_emails` |
| Emails land in spam | Add DMARC, keep `From` consistent, avoid link shorteners, warm up gradually for a new domain |
