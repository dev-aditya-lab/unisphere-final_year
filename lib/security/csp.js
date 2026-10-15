/**
 * Content Security Policy, built per request (a fresh nonce each time) in proxy.js.
 *
 * Scripts are the part that matters most for XSS, so they are strict: only the framework's own nonce-tagged scripts and
 * what those load (`strict-dynamic`). Inline `style` attributes and runtime-injected <style> tags (toasts, charts, Radix)
 * are allowed, which is the usual, accepted trade-off. Nothing here uses `unsafe-eval` in production.
 * No third-party origins are allowed other than your own Supabase project (API + Realtime) and an optional media CDN.
 * The one exception is Google AdSense, and only when ads are switched on (see lib/ads.js); with ads off the policy is
 * exactly as strict as before. The AdSense script is loaded by our own nonce-tagged code, so `strict-dynamic` covers it.
 */
import { parseAdsConfig } from "@/lib/ads";

const origin = (value) => {
  try {
    return value ? new URL(value).origin : null;
  } catch {
    return null;
  }
};

// What Google's publisher tag needs to display and measure an ad (https://support.google.com/adsense/answer/10528939).
const GOOGLE_ADS = {
  script: ["https://pagead2.googlesyndication.com", "https://*.googlesyndication.com", "https://*.g.doubleclick.net", "https://fundingchoicesmessages.google.com", "https://*.adtrafficquality.google"],
  frame: ["https://googleads.g.doubleclick.net", "https://*.googlesyndication.com", "https://tpc.googlesyndication.com", "https://www.google.com", "https://fundingchoicesmessages.google.com"],
  connect: ["https://*.google.com", "https://*.googlesyndication.com", "https://*.g.doubleclick.net", "https://*.adtrafficquality.google", "https://fundingchoicesmessages.google.com"],
  image: ["https://*.googlesyndication.com", "https://*.g.doubleclick.net", "https://*.google.com", "https://*.googleusercontent.com", "https://*.adtrafficquality.google"],
};

// Razorpay Checkout, admitted only on the page where a member pays (see proxy.js). The checkout script itself is added by
// our own nonce-tagged code, so `strict-dynamic` covers it; the origins below are what it then talks to and frames.
const RAZORPAY = {
  script: ["https://checkout.razorpay.com"],
  frame: ["https://api.razorpay.com", "https://checkout.razorpay.com"],
  connect: ["https://api.razorpay.com", "https://lumberjack.razorpay.com", "https://checkout.razorpay.com"],
  image: ["https://*.razorpay.com"],
};

export function buildCsp({ nonce, isDev = false, env = process.env, adNetworkOrigin = null, checkout = false } = {}) {
  // The advertising-network origin(s) for the pages allowed to load its tag (see lib/monetag.js): a string or a list.
  // What its script goes on to load is governed by `strict-dynamic`; anything the network needs beyond these origins for
  // images or requests is blocked and shows up as a CSP violation in the console, where it can be reviewed deliberately.
  const adNet = [adNetworkOrigin].flat().filter(Boolean);
  const adsOn = parseAdsConfig({
    clientId: env.NEXT_PUBLIC_ADSENSE_CLIENT_ID,
    slotId: env.NEXT_PUBLIC_ADSENSE_SLOT_ID,
    enabled: env.NEXT_PUBLIC_ADS_ENABLED,
  }).enabled;
  const supabase = origin(env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseWs = supabase ? supabase.replace(/^http/, "ws") : null;
  const media = [origin(env.NEXT_PUBLIC_MEDIA_URL), origin(env.CLOUDFLARE_R2_PUBLIC_URL)].filter(Boolean);
  // Private files are served by redirecting to a short-lived signed R2 URL (virtual-hosted style: bucket.account.r2...),
  // so the browser must be allowed to load images and media from the storage endpoint itself.
  const r2 = origin(env.CLOUDFLARE_R2_ENDPOINT) || (env.CLOUDFLARE_ACCOUNT_ID ? `https://${env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com` : null);
  const storage = r2 ? [r2, r2.replace("://", "://*.")] : [];

  const frames = [...(adsOn ? GOOGLE_ADS.frame : []), ...(checkout ? RAZORPAY.frame : [])];

  const directives = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(adsOn ? GOOGLE_ADS.script : []), ...adNet, ...(checkout ? RAZORPAY.script : []), ...(isDev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", ...media, ...storage, ...(adsOn ? GOOGLE_ADS.image : []), ...adNet, ...(checkout ? RAZORPAY.image : [])],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...(supabase ? [supabase] : []), ...(supabaseWs ? [supabaseWs] : []), ...media, ...(adsOn ? GOOGLE_ADS.connect : []), ...adNet, ...(checkout ? RAZORPAY.connect : [])],
    "media-src": ["'self'", "blob:", ...media, ...storage],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "frame-src": frames.length ? frames : ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  const body = Object.entries(directives).map(([k, v]) => `${k} ${v.join(" ")}`).join("; ");
  // Only ask browsers to upgrade to HTTPS when the site really is served over HTTPS: on a plain-http preview (a local
  // production build, a Docker smoke test) the upgrade would break same-site redirects such as /feedback -> /login.
  const https = String(env.NEXT_PUBLIC_APP_URL ?? "").startsWith("https://");
  return isDev || !https ? body : `${body}; upgrade-insecure-requests`;
}

export const newNonce = () => btoa(crypto.randomUUID());
