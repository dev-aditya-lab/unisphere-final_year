# Publishing UniSphere to the Google Play Store and the Apple App Store

UniSphere is a Progressive Web App (PWA): members can already **install it from the browser** on Android, iOS
(Add to Home Screen), Windows, macOS and ChromeOS, and get push notifications. This guide covers the *optional*
step of also listing it in the app stores. Everything here that can be done in code is done; what remains needs
developer accounts, signing keys and store review, which only the team (not the codebase) can do.

> **Status:** the web app, manifest, icons, service worker, push, the Capacitor Android app, store listing text and screenshots are ready.
> Submission, review, approval and release are **not done**. They need your Google Play and Apple developer accounts.

## A private app: say so plainly

UniSphere is a **private community app** (open to join, members-only to view), not a public social network. State this in both
store listings and in the review notes: it needs a login, anyone can create an account, and the content is never public. Reviewers
will need a **demo account** (see "Review notes" in `store/listing.md`). Google Play's *App access* form asks for
exactly this: choose "all or some functionality is restricted" and supply the demo credentials.

## What you need before you start

| Item | Where it comes from |
| --- | --- |
| A production URL with HTTPS (for example `https://unisphere.example`) | Your hosting (see `docs/DEPLOYMENT.md`) |
| Google Play developer account (one-time registration fee, about US$25) | play.google.com/console |
| Apple Developer Program membership (yearly fee, about US$99) | developer.apple.com — only for iOS |
| A public support email address | Set it in **Admin → Settings → Public support email** and use the same one in both stores |
| Privacy policy URL | `https://<your-domain>/privacy` (already in the app; edit text in Admin → Settings) |
| Account-deletion URL | `https://<your-domain>/settings/security` (in-app) and the contact form `/contact` for people who cannot log in |
| Screenshots and feature graphic | `store/screenshots/` (regenerate with `npm run screenshots`) |
| Listing text | `store/listing.md` |

## Android: the Capacitor app (recommended)

`android/` is a native shell built with Capacitor (package `unisphere.devaditya.dev`). It loads the live site, so website updates
still reach everyone instantly, and adds native push notifications (FCM), the back button, links that open in the app, downloads, a
splash screen and an offline screen. Google Play treats an app that is only a webview of a website as spam, so these native features
are what make the listing safe. **Everything about building, Firebase, signing, release and testing is in
[ANDROID_APP.md](ANDROID_APP.md).**

Two points specific to Play:

- **The blue tick is not sold in the app.** Play requires Play Billing for digital goods sold inside an app and forbids linking to
  another payment method, so the app shows status only (no price, checkout or "buy on the website" wording). The web is unchanged.
  Choose "all or some functionality is restricted" in *App access* and supply the demo account as below.
- **Data safety**: add *Device or other IDs* to the table below (the FCM token: collected only if the member turns notifications on,
  used for app functionality, not shared, deleted on sign-out or account deletion).

## Android: Trusted Web Activity (alternative, no native features)

A Trusted Web Activity (TWA) is a thin Android app that opens the site full-screen, with no browser bar. Updates
to the website reach everyone instantly; the Play listing only changes when you want it to. It has no push notifications
of its own and Google may see it as a bare website wrapper, so prefer the Capacitor app above. It uses the **same package ID**, so
publish only one of the two, and `ANDROID_PACKAGE_NAME` / `ANDROID_SHA256_CERT_FINGERPRINTS` serve whichever you publish.

1. **Pick a package name** you will never change, for example `com.example.unisphere` (reverse of a domain you control).
2. **Install Bubblewrap**: `npm i -g @bubblewrap/cli` (needs JDK 17 and the Android SDK; Bubblewrap offers to download them).
3. **Generate the project** in a separate folder (not inside this repo):
   ```
   bubblewrap init --manifest https://<your-domain>/manifest.webmanifest
   ```
   Accept the values read from the manifest (name, colours, icons, shortcuts). Use the package name from step 1.
   Choose to create a new signing key and **back it up somewhere safe**, because losing it makes updates impossible
   (unless you enrol in Play App Signing, which is recommended and below).
4. **Build**: `bubblewrap build` produces `app-release-bundle.aab` (upload this) and an APK for testing on a phone.
5. **Create the app in Play Console**, enrol in **Play App Signing**, and upload the `.aab` to an internal or closed testing track first.
6. **Link the app to the website** (Digital Asset Links). In Play Console open *Setup → App signing* and copy the
   **SHA-256 certificate fingerprint** of the *app signing key*. Put these in the server environment and redeploy:
   ```
   ANDROID_PACKAGE_NAME=com.example.unisphere
   ANDROID_SHA256_CERT_FINGERPRINTS=AA:BB:...:FF
   ```
   Check `https://<your-domain>/.well-known/assetlinks.json` returns your package and fingerprint. If it is wrong the app
   still works but shows a browser address bar.
7. **Complete the store listing** from `store/listing.md`, upload screenshots, then fill in the forms below.
8. **Testing requirement.** Google currently requires newly created personal developer accounts to run a closed test with a
   minimum number of testers for a minimum period before they can apply for production access. Check the current rule in
   Play Console, and recruit testers from your own college or community early (a class group works well).
9. Roll out to production and monitor crashes and reviews in Play Console.

Alternative without a command line: **PWABuilder** (pwabuilder.com) generates the same Android package from the manifest URL.

### Play Console forms: honest answers for UniSphere

**Content rating** (questionnaire): the app contains user-generated content and lets users interact and share
information. It has reporting, blocking and moderation. No gambling, no real-money transactions, no location sharing.

**Data safety**

| Data | Collected | Why | Shared | Optional |
| --- | --- | --- | --- | --- |
| Name, email address | Yes | Account and sign-in | No | No |
| Profile details, photos, posts, messages | Yes (user-provided) | The product itself | Only with people the member allows | Yes |
| Push subscription (device endpoint) | Yes, if the member turns push on | Notifications | No | Yes |
| Device or other IDs (the app's FCM token, Android app only) | Yes, only if the member turns notifications on in the app | App functionality (notifications) | No (Google delivers it as our processor) | Yes |
| App activity (reports, votes, feedback) | Yes | Safety and product improvement | No | Yes |
| Advertising ID, precise location, contacts, analytics SDKs | **No** | | | |

Data is encrypted in transit (HTTPS). Members can delete their account in the app (Settings → Security) and download their
data. AI features are optional, send only content the member chooses to analyse (never private posts or messages), and
store no prompts. State this plainly in the listing and privacy policy.

**Target audience:** the platform is for college students, alumni and staff: not for children. Set the minimum age to the
one in the Terms of Service.

## iOS: be realistic

Apple does **not** accept a bare website or PWA wrapper. A native shell (for example **Capacitor**) must provide genuine
native value (App Review Guideline 4.2, "Minimum Functionality"), and a wrapper that only loads the website is a common reason
for rejection.

Recommended path:
1. **Ship the installed web app first.** iOS 16.4+ supports home-screen web apps with push notifications. UniSphere already
   shows "Share → Add to Home Screen" instructions, and push works once it is installed.
2. **If you still want the App Store**, wrap with Capacitor and add real native features (native push through APNs, share sheet,
   biometric unlock, camera for uploads), then submit through Xcode / App Store Connect (requires a Mac).

### Apple's rules for apps with user-generated content (Guideline 1.2): already covered

| Requirement | Where in UniSphere |
| --- | --- |
| Filter objectionable content | Rate limits, media checks, report queue, AI triage suggestions for moderators |
| A way to report content | Report button on posts, comments and profiles; reports go to the admin queue |
| Ability to block abusive users | Profile menu → Block; blocking ends conversations immediately |
| Timely responses to reports | `/admin/reports` queue with severity and counts; appeals with a different reviewer |
| Published contact information | `/contact` page and the public support email |
| In-app account deletion (Guideline 5.1.1(v)) | Settings → Security → Delete account (14-day grace, then erased) |
| Sign in with Apple | Not required: UniSphere uses its own email and password only, with no third-party social logins |

Provide App Review with a demo account: create one with `npm run seed:demo` on a staging database and give the reviewer
`demo.ananya@demo.unisphere.test`. Put the password in the *App Review Information* notes, not in this repo's docs.

## After launch

- Keep `store/listing.md` and the screenshots current (`npm run screenshots`) when the UI changes noticeably.
- Release notes: publish them in **Admin → Releases** first; copy the same text into the store's "What's new".
- Answer store reviews, and send the ones that need a fix to the public roadmap by replying inside Admin → Feedback.
