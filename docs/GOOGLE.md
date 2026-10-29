# Google: sign-in, Calendar and Meet

Two separate things use Google. Both work with a **free Gmail account** and cost nothing.

| What | Who it is for | How it works |
|---|---|---|
| **Continue with Google** (sign in / sign up) | Every member, optional | Supabase Auth's Google provider. The browser goes to Google, comes back to `/auth/callback` with a one-time code, the server exchanges it for a session (PKCE). |
| **Google Calendar + Meet for live classes** | The Academy owner connects one Google account | The server creates a Calendar event with a Meet link and invites the enrolled students; Google sends the invitations. |

Both use the **same Google OAuth client** (one `client_id` / `client_secret`). The values live in `.env.local` (never committed) and in your hosting environment.

## 1. Google Cloud Console

Open the project that owns the OAuth client, then **APIs & Services**.

1. **Library → Google Calendar API → Enable.** (Sign-in alone does not need it; live classes do.)
2. **OAuth consent screen**
   - User type **External**, app name `UniSphere`, support email, your domain `unispheres.in`.
   - Scopes: `openid`, `email`, `profile`, and `https://www.googleapis.com/auth/calendar.events`.
   - **Publishing status: set it to "In production".** While it is "Testing", Google expires refresh tokens after **7 days**, which breaks the Calendar connection every week. `calendar.events` is a *sensitive* scope: Google may ask for a short verification (a privacy policy URL and a demo video). Until it is verified the owner sees an "unverified app" warning once; that is fine for one owner account.
3. **Credentials → your OAuth client (Web application)**

**Authorized JavaScript origins**

```
https://unispheres.in
http://localhost:3000
```

**Authorized redirect URIs**

```
https://orubalhdtrbxkoxhsdkr.supabase.co/auth/v1/callback      ← sign in with Google (Supabase)
http://127.0.0.1:55321/auth/v1/callback                        ← sign in, local Supabase stack
https://unispheres.in/api/academy/google/callback              ← Calendar + Meet connection
http://localhost:3000/api/academy/google/callback              ← Calendar + Meet connection, local
```

## 2. Supabase dashboard (hosted project)

- **Authentication → Providers → Google:** enable it, paste the client ID and secret.
- **Authentication → URL Configuration:** Site URL `https://unispheres.in`; add to Redirect URLs:
  `https://unispheres.in/auth/callback` and `http://localhost:3000/auth/callback`.

## 3. Environment

```
NEXT_PUBLIC_GOOGLE_SIGNIN=true        # shows the "Continue with Google" button (build-time)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
# Optional: a second OAuth client only for Calendar. Falls back to the two above.
GOOGLE_CALENDAR_CLIENT_ID=
GOOGLE_CALENDAR_CLIENT_SECRET=
APP_SECRET=...                        # required in production; it seals the stored Google refresh token
```

`NEXT_PUBLIC_GOOGLE_SIGNIN` is read at build time: redeploy after changing it. The button is hidden inside the Android app (Google refuses sign-in in embedded browsers).

For the local Supabase stack, `supabase/config.toml` reads `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` from the environment; restart the stack (`supabase stop && supabase start`) after adding them.

## 4. Connect the Academy's Google account

Sign in as someone with `academy.settings.manage` (the owner), open **Admin → Academy → Settings**, press **Connect Google**, choose the Gmail account that should host the classes and tick the calendar permission. The page then says *Connected as you@gmail.com*.

Then, in **Admin → Academy → Live classes**, tick **Create a Google Meet and invite enrolled students by email** on a class. Within a minute:

- an event "Course: Class title" appears on that Gmail's calendar with a Meet link;
- every student with valid access to the course (and in the class's cohort, if it has one) gets Google's invitation by email;
- the Meet link is stored for the Academy and shown to those students from an hour before the class;
- students who enrol later are added automatically (the worker re-checks every few minutes); students who are refunded or lose access are removed.

**Who can join.** Invited students join the Meet directly. Anyone else who gets the link must ask, and you admit or refuse them from the Meet window. This is Google's behaviour for meetings made on a personal account; the Academy also sets *guests cannot invite others, change the event or see other guests*.

## 5. How it stays safe

- The Calendar permission requested is only **`calendar.events`**: it cannot read mail, Drive or contacts.
- The refresh token is encrypted (AES-256-GCM, key from `APP_SECRET`) **before** it reaches the database; the table has no API access at all, only the server's service role. Rotating `APP_SECRET` makes it unreadable: just reconnect.
- The connect flow uses a random `state` sealed into a 10-minute `HttpOnly` cookie bound to the signed-in person. A return from Google that does not match is refused. The callback re-checks the permission.
- Student email addresses leave the database only through one function that returns them for one class, only for students with valid access and a confirmed email, and are sent only to Google. Guests cannot see each other.
- A failure is shown on the class ("Google failed: …") with **Try Google again**; retries back off 2, 8, 18, 32 minutes and then stop. A revoked connection is reported as "needs reconnecting" instead of retrying forever.
- Events of deleted classes are removed from the calendar by the worker.

## 6. Limits (Google's, not ours)

| Limit | Value |
|---|---|
| Guests on one Calendar event | 200 (the Academy refuses more and says so; split by cohort) |
| Meet participants on a free Gmail | 100 |
| Group calls of 3+ people on a free Gmail | 60 minutes. A Google Workspace account has no such cap |
| Refresh token while the consent screen is in *Testing* | 7 days |

The Academy uses the background worker (`/api/cron/tick`), so something must call it (see `docs/DEPLOYMENT.md`). Saving a class also triggers one immediate attempt.

## 7. Tests

`tests/unit/academy-google.test.js` (event shape, token sealing, create / update / delete / failure paths with a fake Google), `tests/unit/academy-google-routes.test.js` (state and permission checks), `tests/unit/google-callback.test.js` (sign-in callback), and the database tests in `tests/integration/academy.test.js` (token table unreachable, attendee rules, queue, tombstones).
