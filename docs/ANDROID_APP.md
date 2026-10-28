# The Android app (Capacitor)

The Android app is a native shell around the live site, built with [Capacitor](https://capacitorjs.com). It adds what a website cannot do by itself: **push notifications through Firebase Cloud Messaging (FCM)**, the phone's back button, links that open in the app, file downloads, a splash screen and an offline screen.

Package ID: `unisphere.devaditya.dev` (permanent once uploaded to Google Play). Everything lives in `android/`, `native-shell/`, `capacitor.config.ts` and `components/native/`.

## How it works

UniSphere is server-rendered (server actions, cookie sessions, a request proxy), so it cannot be bundled into the app as static files. `capacitor.config.ts` sets `server.url` to the site (`https://unispheres.in`, or `CAPACITOR_SERVER_URL`), and the app loads it. Capacitor's docs call `server.url` "not intended for production": the concerns are store review (mostly Apple) and cold starts. For Google Play the answer to the first is real native features (below), and to the second is the loading view and offline screen.

- **The site recognises the app** by a token in its user agent, `UniSphereApp/<version> (Android)` (`lib/native-app.js`). It is a presentation hint only (any client can send any user agent), never used for security. The app skips the landing page (`proxy.js`) and never shows the blue tick purchase.
- **Plugins are loaded only inside the app.** `window.Capacitor` is put on the page by the shell; the website imports nothing from Capacitor until `isNativeApp()` is true (`lib/native/client.js`), so browser visitors download none of it.
- **Anything off the site's host opens in the browser** (Capacitor's `allowNavigation`).

### What the native side adds (`android/app/src/main/java/unisphere/devaditya/dev/`)

| Behaviour | Where | Why |
|---|---|---|
| Splash held until the first page paints (at most 2.5 s), then a "Waking up UniSphere…" view | `MainActivity` | A sleeping host can take about a minute; a blank screen looks broken |
| Offline page on network failure only | `AppWebViewClient`, `native-shell/offline.html` | Not `server.errorPath`: that also fires on HTTP errors and would replace the app's own 404, 403 and maintenance pages |
| Downloads (data export, attachments, `.ics`) | `AppDownloadListener` | A WebView with no download listener silently ignores them. The cookie is sent only to the app's own host |
| Recreate the WebView if its renderer dies | `MainActivity` | Otherwise Android kills the whole app |
| `CookieManager.flush()` on pause | `MainActivity` | Cookies reach disk lazily; without it a sign-in can be lost when the system closes the app |
| Back button, App Links, status-bar style | `components/native/native-bridge.jsx` | Closes sheets and dialogs first; minimises on top-level screens; theme-aware icons |
| Light haptics on bottom tabs | `lib/native/haptics.js` | Native feel; does nothing on the web |

## Push notifications (FCM)

Web Push (browsers, installed web app) and FCM (this app) are separate: Android WebView does not support the Web Push API.

1. **Table**: `push_devices` (migration `0061`): one row per phone, a unique `token`, RLS so a member sees only their own rows, and the `token` column is never granted to the client. `claim_push_notifications` now claims for members with either kind of device.
2. **Registering**: the pop-up below, or Settings → Notifications → Android permission (13+) → FCM token → `POST /api/push/native` (`app/api/push/native/route.js`: same-origin check, session, rate limit 30/hour).
   - **The pop-up** (`components/native/push-prompt.jsx`, SVG bell illustration, a bottom sheet on phones) appears about 4 seconds after a signed-in member first opens the app, waiting until no other dialog is open and nobody is typing. When it comes again is decided by `lib/native/push-nudge.js`: after 3, then 7, then 14 days, at most four times, never after "Don't ask me again", and never after the member switched notifications off in Settings (that is a decision).
   - **Two kinds**: *ask* (leads to Android's permission box) and *settings* (Android only shows that box twice; after that the pop-up shows three steps and **Open settings** goes straight to the app's notification page through `capacitor-native-settings`). When the member comes back, the app finishes turning notifications on by itself.
   - Android 12 and older never show a permission box (notifications are on by default), so *Turn on* simply registers the token.
3. **Sending** (full picture and the new-feature checklist: [NOTIFICATIONS.md](NOTIFICATIONS.md)): a **direct message is pushed the moment it is sent**, one push per message (`lib/services/message-push.js`, tagged `message:<conversationId>` so a burst collects into one notification). Everything else is pushed by the server's own loop every `PUSH_LOOP_SECONDS` (default 15, `instrumentation.js`) and by the worker (`/api/cron/tick`); both push each new unread in-app notification, so the bell's preferences and blocks apply, and so does the member's **Push** switch for that category. `lib/services/push.js` sends to Web Push and FCM; `lib/services/fcm.js` calls the FCM HTTP v1 API with `google-auth-library` (the large Firebase Admin SDK is not needed). `lib/push-fcm.js` builds the message and reads Google's answers.
4. **Message shape**: a *notification* message, which Android shows even when the app is closed. Lock-screen text never includes message bodies. `data.url` is opened on tap through `safeNext`, so only a path on this site opens.
5. **Channels** (`lib/push-channels.js`): *Messages* (high priority), *Replies and connections*, *Events and account*. Android lists them in the phone's own settings, so a member can silence one kind.
6. **Token hygiene**: removed on sign-out, on switching off, when Google answers `UNREGISTERED`, after five real failures, after 90 days without the app opening, and on erasure (cascade). A wrong project or key (`404/401/403`) never deletes tokens.

### Firebase setup (once, by the owner)

1. [Firebase console](https://console.firebase.google.com) → create a project (Analytics is not needed) → add an **Android app** with package `unisphere.devaditya.dev`.
2. Download **`google-services.json`** into `android/app/`. It is git-ignored. Without it the app still builds and runs; push simply isn't wired.
3. Project settings → **Service accounts** → *Generate new private key*. Put the JSON (or `base64 -w0 key.json`) in the server environment as **`FIREBASE_SERVICE_ACCOUNT`** (a secret; see `.env.example`). Redeploy.
4. Check **Admin → Settings** (or `getIntegrations().fcm`) reports Android push as ready, then use *Send a test* in the app.

### Privacy

Google (FCM) is a processor: listed in `lib/privacy/processors.js` (shown in the privacy notice when the key is set), `docs/DPDP_PROCESSORS.md` and `docs/DPDP_RETENTION.md`. Privacy notice version `2026-10-27.2` (no new consent). In Play Console's **Data safety** form add *Device or other IDs* (the FCM token: collected, optional, used for app functionality, not shared) next to what `docs/APP_STORES.md` already lists.

## The blue tick in the app

Google Play requires Play Billing for digital goods and features sold inside an app, and forbids steering people to another payment method (linking to a payment page, or telling them to buy elsewhere). So in the app (recognised by the user agent): the blue tick page shows status only (no price, no checkout, no link and no "buy on the website" wording), the pricing page omits the price and payment steps, `startBlueTickPurchaseAction` and `/api/payments/checkout` refuse, and the web is unchanged. People who want it can still buy it on the website, outside the app. If you later want in-app purchase, that means Play Billing or the user choice billing program for India (Play Console enrolment); it is a separate project.

## Build

Needs JDK 21 (Android Studio's bundled one works), the Android SDK (platform 36) and Gradle 8.14+ (the wrapper downloads it).

```
npm run native:icons        # only when the logo changes: launcher, splash and notification icons from public/unisphereLogo.png
npm run native:sync         # after changing capacitor.config.ts or the version: copies config and plugins into android/
cd android
./gradlew assembleDebug     # app/build/outputs/apk/debug/app-debug.apk  (install with adb install -r)
```

- **Version**: `versionName` is `package.json`'s version; `versionCode` is `major×10000 + minor×100 + patch` (2.6.0 → 20600). Bump the version, then `npm run native:sync` (the user-agent token is written at sync time).
- **Target another site** (staging): `CAPACITOR_SERVER_URL=https://staging.example npm run native:sync`. Plain `http://` (a LAN dev server) also needs `android:usesCleartextTraffic="true"` temporarily; never ship that.
- **Debug the WebView**: `CAPACITOR_DEBUG=true npm run native:sync`, then `chrome://inspect`.

### Signing and release

1. Create an **upload key** and keep it (and its password) outside the repo. Copy `android/keystore.properties.example`-style values into `android/keystore.properties` (git-ignored): `storeFile`, `storePassword`, `keyAlias`, `keyPassword`.
2. `./gradlew bundleRelease` → `app/build/outputs/bundle/release/app-release.aab`. Upload it to Play Console, enrol in **Play App Signing**.
3. **App Links**: Play Console → Setup → App signing → copy the **SHA-256 of the app signing key** into `ANDROID_SHA256_CERT_FINGERPRINTS` (and set `ANDROID_PACKAGE_NAME=unisphere.devaditya.dev`), redeploy, and check `https://<site>/.well-known/assetlinks.json`. Until then links open in the browser. For a debug build, add the debug keystore's SHA-256 as well.
4. This package ID is the same one the old Bubblewrap TWA in `playstore/` used. Publish **one** of them under it, not both. Remove the TWA once this app is live.
5. Minifying (R8) is off on purpose (`android/app/build.gradle`): the app is a thin shell, R8 saves little, and Capacitor finds plugins by reflection. Turn it on only after testing a release build on a device.

## Smoothness: what to keep an eye on

- **Hosting.** The biggest effect on how the app *feels* is the server. Render's free plan sleeps after ~15 minutes and takes about a minute to wake; the app shows its loading view, but a paid instance (or the UptimeRobot ping in `docs/DEPLOYMENT.md`) is what actually removes the wait.
- **Repeat launches** are fast because the service worker keeps static assets (`public/sw.js`) and Chromium's disk cache persists across launches. Do not put `Cache-Control: no-store` on static files or images.
- **Safe areas and the keyboard** are handled by Capacitor 8's `SystemBars` plugin (`insetsHandling: css`) together with the page's `viewport-fit=cover` and `env(safe-area-inset-*)`: on WebView 140+ the page receives the insets natively; on older ones Capacitor pads the window instead and zeroes `env()`, so nothing is counted twice.
- Keep `overscroll-behavior`, `touch-action: manipulation` and the tap-highlight reset in `app/globals.css`: they are why taps and scrolling already feel native.

## A notification did not appear: where to look

Work down this list; each step rules out one place.

0. **Checked on a real phone (realme, Android 16, 2026-10-28) with `adb`**: the whole chain works. A push on the *Messages* channel (importance high) pops up over the screen; one on *Events and account* or *Replies and connections* (importance default) only shows in the status bar and the shade, with a sound, and no pop-up. That is Android's design, not a fault: *Send a test* therefore uses the Messages channel so it looks like a real message. To see what the phone did: \`adb shell dumpsys notification | grep "pkg=unisphere"\` lists the posted notifications with their channel and importance, and \`adb logcat | grep -E "FirebaseMessaging|HeadsUp"\` shows the arrival and the pop-up.
1. **Was the app open?** Android shows no system notification while the app is on screen (the plugin does so only if \`presentationOptions\` asks, and \`capacitor.config.ts\` leaves it empty on purpose). The app shows its own banner instead (\`components/native/native-push.jsx\`). To see a real system notification, leave the app first: *Send a test* waits 8 seconds so there is time to press Home.
2. **Did Google accept it?** In the database, \`push_devices.last_success_at\` moves on every accepted send, \`failure_count\` stays 0, and Admin → Settings → Push notifications counts the phones. If a send is refused, the server log says why (\`[push] FCM failed: <status> <message>\`). The Firebase console *Messaging → Reports* page stays empty for messages sent through the API; it is not a delivery log.
3. **Messages specifically** (since 2.7.0 they are pushed at once, not by the worker): a push is made for every message from *another* member, unless that conversation is **muted**, either of you has **blocked** the other, or the member switched **Messages** off for *In app* or *Push* in Settings → Notifications (push follows the bell). The database decides this in \`message_push_targets\`; if it returns nobody, nothing is sent. If the instant push could not reach the phone (Google busy), the worker sends the bell's notification 15 seconds later. The **bell** still holds one entry per conversation until it is read, which is separate from the push. The server log shows \`[message-push] …\` when something goes wrong, and \`[push] FCM failed: …\` when Google refuses.
4. **The phone itself**: Settings → Apps → UniSphere → Notifications must be on, and so must the channel (Messages, Replies and connections, Events and account); Do Not Disturb off; battery set to *Unrestricted*. On Xiaomi, Oppo, Vivo, Realme and OnePlus phones also allow *Autostart*, and note that an app that was force-stopped receives nothing until it is opened again.

## Testing without a phone

Most of the app can be tested on a computer, and was: a real browser against the real site and the local database, with only the phone faked.

```
npx supabase db reset --local        # local Docker database, every migration from scratch (Docker Desktop must be running)
# export the LOCAL Supabase keys (npx supabase status -o env) plus REDIS_URL="" and blank CLOUDFLARE_* values, then:
NEXT_PUBLIC_APP_URL=http://localhost:3100 NEXT_DIST_DIR=.next-e2e npx next build
NEXT_PUBLIC_APP_URL=http://localhost:3100 NEXT_DIST_DIR=.next-e2e npx next start -p 3100
E2E_BASE_URL=http://localhost:3100 npx playwright test tests/e2e/android-app.spec.js
npx vitest run --project integration tests/integration/push-devices.test.js
```

- `tests/e2e/notifications.spec.js` (10 tests: the Push switch, Admin → Broadcast, a message reaching a device within seconds, muted and switched-off conversations staying silent, the server's own push loop) uses made-up device tokens: Google refuses them and the server deletes a refused device, so a device that disappears is proof the server tried to send. See [NOTIFICATIONS.md](NOTIFICATIONS.md).
- `tests/e2e/android-app.spec.js` (24 tests: landing skip, Settings, the pop-up in light and dark, permission flows, notification tap, back button, deep links, sign-out, blue tick hidden) uses `tests/helpers/fake-android.js`. It injects **Capacitor's own `native-bridge.js`** (the script the app injects) and fakes only the Java side, so plugin calls take the same path as on a phone. Set `E2E_FCM_TOKEN` to a real phone's token to also send a real notification through Google.
- `tests/unit/native-push-plugin.test.js` and `native-push-flow.test.js` guard the push flow, including the bug below. `tests/integration/push-devices.test.js` covers the table: who can see a phone, that the token column never reaches a client, what `claim_push_notifications` picks, erasure.
- Still needs a real phone: the Android permission box and notification settings (the fake answers as Android is documented to), the system notification itself, downloads, the splash and loading view, the keyboard and safe areas, App Links verification.

### Two traps this found (worth knowing)

1. **Never return or await a Capacitor plugin.** A plugin is a Proxy that answers every property, `then` included, so `async () => (await import("@capacitor/…")).Plugin` makes JavaScript call the plugin's `then` natively and the call never finishes (Settings stayed on "Checking…"). Pass a plugin inside an object, as `lib/native/push.js` does.
2. **FCM data keys must not be reserved words**: `from`, `message_type`, or anything starting with `google` or `gcm`. Google rejects the whole message (`Invalid data payload key: from`), so every notification failed while the token and key were fine. The app now uses `origin`; `tests/unit/push-fcm.test.js` checks the keys. Only a real call to Google can tell, so after changing the message shape, send one real test.

## Device test checklist (not automated)

Run on at least one Android 7–9 phone, one Android 13+ phone, and an emulator with a current and an old WebView:

- [ ] First start: splash → feed (signed in) or login; no white flash in dark mode.
- [ ] Airplane mode on start → offline screen → turn it off → recovers by itself.
- [ ] Sign in, swipe the app away, reopen: still signed in.
- [ ] Back button: closes a sheet; goes back a page; on Feed minimises.
- [ ] First signed-in start: about 4 seconds later the "Don't miss what matters" pop-up slides up (light and dark). It waits if the welcome pop-up is open. *Not now* closes it; it does not come back for 3 days.
- [ ] Pop-up → *Turn on notifications* → Android permission box (13+) → *Allow* → success message. Repeat with *Don't allow* twice, then reopen the app after 3 days (or clear `unisphere:native-push-nudge`): the "Notifications are off" version appears, *Open settings* opens UniSphere's notification page, and after switching them on and coming back the app turns them on by itself.
- [ ] *Don't ask me again* and *Turn off* in Settings both stop the pop-up for good.
- [ ] Settings → Notifications → Turn on → permission prompt (Android 13+) → *Send a test* arrives with the app open, in the background and swiped away; tap opens the right page; message text is not on the lock screen.
- [ ] Sign out, then check the phone no longer receives that member's notifications; sign in as someone else on the same phone.
- [ ] Open a post link from another app / an email: opens in the app on that page; a sign-in or invite link works.
- [ ] Download the data export (Settings → Security) and an attachment.
- [ ] Message composer with the keyboard open (nothing hidden behind it); bottom bar and status bar clear of the notch and gesture bar; 3-button and gesture navigation.
- [ ] Image upload from gallery and "take photo".
- [ ] `/settings/blue-tick` and `/pricing` show no price and no purchase button or link.
- [ ] Install over an older version (versionCode must be higher) and keep the session.
