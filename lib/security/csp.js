/**
 * Content Security Policy, built per request (a fresh nonce each time) in proxy.js.
 *
 * Scripts are the part that matters most for XSS, so they are strict: only the framework's own nonce-tagged scripts and
 * what those load (`strict-dynamic`). Inline `style` attributes and runtime-injected <style> tags (toasts, charts, Radix)
 * are allowed, which is the usual, accepted trade-off. Nothing here uses `unsafe-eval` in production.
 * No third-party origins are allowed other than your own Supabase project (API + Realtime) and an optional media CDN.
 * Payment is taken on the payment gateway's own page, so no gateway script, frame or connection is admitted. The one thing
 * the page where a member pays may do is post a form to a gateway that needs it (PAYMENT_FORM_ACTION_ORIGINS).
 */

const origin = (value) => {
  try {
    return value ? new URL(value).origin : null;
  } catch {
    return null;
  }
};

// Gateways whose hosted checkout is reached by posting a form from our page list the https origin(s) in
// PAYMENT_FORM_ACTION_ORIGINS. A gateway that is reached by an ordinary redirect needs nothing.
const httpsOrigins = (value) =>
  [...new Set(String(value ?? "").split(/[\s,]+/).map(origin).filter((o) => o && o.startsWith("https://")))];

export function buildCsp({ nonce, isDev = false, env = process.env, checkout = false } = {}) {
  const supabase = origin(env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseWs = supabase ? supabase.replace(/^http/, "ws") : null;
  const media = [...new Set([origin(env.NEXT_PUBLIC_MEDIA_URL), origin(env.CLOUDFLARE_R2_PUBLIC_URL)].filter(Boolean))];
  // Private files are served by redirecting to a short-lived signed R2 URL (virtual-hosted style: bucket.account.r2...),
  // so the browser must be allowed to load images and media from the storage endpoint itself.
  const r2 = origin(env.CLOUDFLARE_R2_ENDPOINT) || (env.CLOUDFLARE_ACCOUNT_ID ? `https://${env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com` : null);
  const storage = r2 ? [r2, r2.replace("://", "://*.")] : [];

  const directives = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(isDev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", ...media, ...storage],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...(supabase ? [supabase] : []), ...(supabaseWs ? [supabaseWs] : []), ...media],
    "media-src": ["'self'", "blob:", ...media, ...storage],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "frame-src": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'", ...(checkout ? httpsOrigins(env.PAYMENT_FORM_ACTION_ORIGINS) : [])],
    "frame-ancestors": ["'none'"],
  };
  const body = Object.entries(directives).map(([k, v]) => `${k} ${v.join(" ")}`).join("; ");
  // Only ask browsers to upgrade to HTTPS when the site really is served over HTTPS: on a plain-http preview (a local
  // production build, a Docker smoke test) the upgrade would break same-site redirects such as /feedback -> /login.
  const https = String(env.NEXT_PUBLIC_APP_URL ?? "").startsWith("https://");
  return isDev || !https ? body : `${body}; upgrade-insecure-requests`;
}

export const newNonce = () => btoa(crypto.randomUUID());
