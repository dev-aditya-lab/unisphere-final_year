# Google AdSense, ads.txt and consent

This describes what the code does, what it deliberately does not do, and the steps that only the site owner can
take in a real AdSense account. Nothing here is, or implies, approval from Google.

## Read this first: the public site is small by design

UniSphere is a closed network. A logged-out visitor, and therefore Google's crawler, can read only the home,
about, features, guidelines, contact, privacy, terms and cookies pages (`app/sitemap.js` lists exactly these).
Posts, profiles, projects, events and the college directory are never public, and that is a product promise
(`app/llms.txt/route.js`, `lib/routes.js`, `lib/content/legal.js`).

AdSense reviews the content a crawler can see. Seven pages that are mostly product description and policies are
unlikely to meet its "valuable inventory" bar, and ads must never be placed on screens that sit behind a login. The
integration below is correct and safe, but **it cannot create original public content**, and publishing invented
content to look active would break your own policy and Google's. If you want to pursue AdSense, the honest route is
to publish real, original, public material first (guides for students, how-to articles, documented case studies of
projects with their authors' consent), and to decide deliberately whether that fits a closed network.

## Configuration

All values are optional and public by nature. Obtain them from your AdSense account; never guess them.

| Variable | Format | Effect |
| --- | --- | --- |
| `NEXT_PUBLIC_ADSENSE_CLIENT_ID` | `ca-pub-` + 16 digits | Adds `<meta name="google-adsense-account">` on public pages and the `/ads.txt` entry. Nothing is loaded. |
| `NEXT_PUBLIC_ADSENSE_SLOT_ID` | digits | The ad unit ID of a **Display ad** unit you created in AdSense. |
| `NEXT_PUBLIC_ADS_ENABLED` | `true` | The explicit switch. Ads render only if the client ID, the slot ID and this are all set. |

They are read at build time (`NEXT_PUBLIC_*`), so rebuild after changing them. `lib/ads.js` validates the formats;
a malformed value is treated as absent.

With none of them set: no ad script, no ad space, no consent control, and a Content-Security-Policy with no Google
origins (`tests/unit/ads.test.js` asserts this).

## What the code does

- **Slots** (`components/ads/ad-slot.jsx`): rendered only on `/` (after the product showcase), `/features` and
  `/about`. Labelled "Advertisement", inside its own bordered band, with 280 px of reserved height so it cannot
  shift the page. The AdSense script is injected once, only when a slot is about to scroll into view, and never on
  pages without a slot. There are no slots in the signed-in app, messages, forms, admin, or on the privacy, terms,
  guidelines, cookies and contact pages.
- **CSP** (`lib/security/csp.js`): Google's ad origins are added to `script-src`, `frame-src`, `connect-src` and
  `img-src` only when ads are fully enabled. The policy stays `strict-dynamic`, with no `unsafe-inline` for scripts.
- **ads.txt** (`app/ads.txt/route.js`): with a client ID, `google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0`.
  Without one, a comment only. The last field is Google's fixed AdSense certification authority ID. Verify the
  deployed file at `https://<your-domain>/ads.txt` (plain text, HTTP 200, no redirect).
- **Policies**: `/privacy`, `/terms` and `/cookies` describe advertising only when ads are enabled, and say plainly
  that there is none otherwise. The FAQ on the home page does the same.
- **Consent**: the code does not invent a banner. Consent is delivered by Google's own message (below). When ads are
  enabled, the footer shows "Privacy and ad choices", which asks Google's script to reopen that message.

## Steps only you can take (in your AdSense account)

1. Sign up for AdSense and add your production domain as a site.
2. Put the publisher ID in `NEXT_PUBLIC_ADSENSE_CLIENT_ID`, rebuild, deploy, and use Google's "connect site" check
   (the meta tag and `/ads.txt` satisfy it without loading ads).
3. **Privacy & messaging**: create and publish a GDPR message (and the US-states message if you serve those
   regions) in a Google-certified consent tool. Without it, Google will not serve ads to visitors in regions that
   require consent. Turn on "Show a privacy and cookie settings button" so the footer control has something to open.
4. **Auto ads: leave them off** for this site. The slots are manual, and auto ads could place units where this site
   promises none.
5. Create one Display ad unit; put its ID in `NEXT_PUBLIC_ADSENSE_SLOT_ID`.
6. Wait for Google's review. Only then set `NEXT_PUBLIC_ADS_ENABLED=true`, rebuild and deploy.
7. Review each placement against the current AdSense Program policies before enabling it, and again after any
   layout change. Do not click your own ads.

## Details you must confirm (the code cannot know them)

- The operator named in the policies. They describe UniSphere as an independent platform and name no company, owner
  or legal address. Add that information if you have it, and decide who answers privacy and copyright requests.
- Data retention periods. The privacy policy says data is kept while an account is active and "for a limited period
  afterwards where required", and that deletion has a 14-day grace period (the latter is what the code does).
- The privacy contact route: the contact form (subject "Privacy") and hello@unispheres.in, handled by Aditya Kumar
  Gupta (`lib/constants.js`). Make sure that mailbox is monitored and that the 14-day reply target can be met.
- Whether your audience includes visitors in regions that require consent, and whether you need other notices.
- The legal text itself. The built-in pages are product-specific drafts, not legal advice. Administrators can replace
  each page from `/admin/settings`; have counsel review before launch.

## Verification performed (local, production build)

- Ads off: no ad script or markup in any page, no Google origins in the CSP, `ads.txt` is a comment, no
  `google-adsense-account` tag.
- Ads on with a **test** publisher ID and the Google script stubbed: the tag and `ads.txt` line appear, the CSP
  gains the Google origins, the script is injected once and only after a slot nears the viewport, a client-side
  navigation to another page with a slot does not load it again, layout shift stays 0.000, no console errors, and
  no slot exists on the policy, contact or authentication pages.
- Not done, because it needs your account: serving a real ad, the consent message, and the "Privacy and ad choices"
  reopen call (it follows Google's `googlefc` API and must be checked with your live message).

## Pre-submission checklist

- [ ] Production domain set in `NEXT_PUBLIC_APP_URL`; HTTPS works; `www`/apex redirect consistently.
- [ ] Original, useful public content exists beyond product and policy pages (see the first section).
- [ ] `/privacy`, `/terms`, `/cookies`, `/guidelines`, `/contact` are linked from the footer and read correctly.
- [ ] The contact form delivers to a mailbox someone reads.
- [ ] `/ads.txt` returns your publisher line; `/sitemap.xml` and `/robots.txt` look right.
- [ ] Consent message published in AdSense; Auto ads off; one Display unit created.
- [ ] Placements reviewed against current policies; no ads in private or action screens.
- [ ] After Google's decision, and only then, `NEXT_PUBLIC_ADS_ENABLED=true`.
