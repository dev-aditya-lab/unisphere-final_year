// Monetag (an advertising network) page tag. Added at the owner's request. The site-verification meta tag lives in
// lib/constants.js; this is the script the dashboard issues for the site's zone.
//
// Where it runs, deliberately narrow:
//   - only on the pages in AD_PATHS (home, about, features, FAQ), never on policy, contact, sign-in or app pages;
//   - only for visitors who are not signed in (app/(marketing)/layout.js), so a member is never shown it;
//   - after the page is idle, so it cannot delay what the visitor came to read.
// The Content-Security-Policy admits the tag's origin on those same paths only (proxy.js), not in the app.
//
// Kill switch: set NEXT_PUBLIC_MONETAG_ENABLED=false and rebuild. NEXT_PUBLIC_* values must be read as literal
// `process.env.NEXT_PUBLIC_X` so the bundler can inline them.

const TAG_URL = "https://quge5.com/88/tag.min.js";

export const monetag = {
  tagUrl: TAG_URL,
  zone: "296070",
  origin: new URL(TAG_URL).origin,
  enabled: process.env.NEXT_PUBLIC_MONETAG_ENABLED !== "false",
};
