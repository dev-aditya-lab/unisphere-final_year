# Monetag (advertising network)

Added at the owner's request. It sits alongside the AdSense settings, which are unchanged (`docs/ADSENSE.md`).

## What is installed

| Piece | Where | What it does |
| --- | --- | --- |
| Verification tag | `MONETAG_VERIFICATION` in `lib/constants.js`, emitted by `app/(marketing)/layout.js` | `<meta name="monetag" ...>` on public pages. Proves ownership; loads nothing. |
| Page tag | `lib/monetag.js`, `components/ads/monetag-tag.jsx` | Loads `https://quge5.com/88/tag.min.js` (zone `296070`) after the page is idle. |
| CSP | `lib/security/csp.js`, `proxy.js` | Admits `https://quge5.com` on the tag's pages only. |
| Policies | `lib/content/legal.js` | Privacy, cookies, terms and FAQ describe the tag while it is enabled. |

## Where it runs

- Only on `/`, `/about`, `/features` and `/faq` (`AD_PATHS` in `lib/routes.js`). Not on policy pages, the contact
  form, sign-in or register pages, or anywhere inside the app. The Content-Security-Policy admits the network's
  origin on those paths only, so the browser refuses the tag elsewhere.
- Only for visitors who are not signed in. A member is never given the tag.
- If an anonymous visitor moves between public pages without a full reload, a script that has loaded stays loaded.

## Turning it off

Set `NEXT_PUBLIC_MONETAG_ENABLED=false` and rebuild. The tag, the CSP entry and the policy wording all go away
together. The verification meta tag stays (it is inert).

## Things you need to know

1. **A browser keeps one push subscription per site.** If your Monetag zone is a *Push* zone, the tag asks visitors for
   notification permission and subscribes them on the same service worker registration as UniSphere's own member
   notifications (`/sw.js`). Two safeguards are in place:
   - UniSphere's worker shows a push only if UniSphere's server marked it (`from: "unisphere"`), and opens only its
     own notifications on click, so an advertiser's message is never shown under UniSphere's name, icon or link.
   - When a member turns on notifications in Settings, a subscription made by another sender is replaced with one
     made with UniSphere's key (`components/settings/app-settings.jsx`).
2. **Push ads will not display from this worker.** Monetag's push delivery needs its own code in a service worker
   at `/sw.js`. That file is deliberately **not** merged here: it would run third-party code with visibility of
   every same-origin request, including members' private pages. A visitor who allows notifications therefore
   receives nothing from Monetag (the browser may show its generic "site updated in the background" notice). If you
   want push ads, either use a different zone type that needs no service worker (In-Page Push, Interstitial,
   Vignette, OnClick), or decide separately to accept that trade-off.
3. **Content-Security-Policy.** Only the tag's own origin is allowed. Ad networks usually load images, frames and
   scripts from many other domains; anything blocked appears as a CSP violation in the browser console on those
   four pages. Review it there rather than widening the policy blindly.
4. **Google AdSense policies.** Pop-ups, pop-unders and some push/interstitial formats are not allowed on pages
   that show AdSense. While `NEXT_PUBLIC_ADS_ENABLED` is off this does not apply. Check Monetag's formats against
   Google's publisher policies before turning AdSense ads on.
5. **Policy accuracy.** The privacy and cookie pages describe what the tag *may* do. If you change the zone type,
   update the wording in `NETWORK_ADS` (`lib/content/legal.js`).

## Verification performed

- The tag appears only on the four pages, only for signed-out visitors, once, after idle.
- The CSP on those pages contains the origin; on every other page, including the app, it does not.
- The service worker ignores unmarked pushes and unmarked notification clicks (`tests/unit/ad-network.test.js`).
