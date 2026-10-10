import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { authCookieOptions } from "@/lib/supabase/cookie-options";

const AUTH_COOKIE = /^sb-.+-auth-token(\.\d+)?$/;

/**
 * Refreshes the Supabase session for every matched request and returns the (verified) JWT claims, if any.
 * Authorization decisions are NOT made from this alone: pages and actions re-check with `requireUser()`.
 *
 * Why this is careful. Supabase rotates the refresh token every time it is used, so a refresh whose new cookies
 * never reach the browser leaves the member holding a dead token: they are "randomly logged out" a little later.
 * Two things make that happen, and both are handled here:
 *   1. The rest of the request must see the NEW cookies, so the headers forwarded to the app are built AFTER the
 *      refresh, from the mutated request.
 *   2. EVERY response (a redirect, a rewrite, the maintenance page, a pass-through) must carry the new cookies.
 *      `finish(response)` does that; use it for whatever the proxy returns.
 *
 * A failed refresh is not a logout: when the auth server is merely unreachable the session cookie is left alone,
 * `unavailable` is true, and the caller must not send the member to the login page.
 */
export async function updateSession(request, extraRequestHeaders = {}) {
  let cookiesToWrite = [];
  let headersToWrite = {};

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookieOptions: authCookieOptions,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookies, headers) {
          // Keep this request consistent: later code (and the app, via the forwarded Cookie header) reads these.
          cookies.forEach(({ name, value }) => request.cookies.set(name, value));
          cookiesToWrite = cookies;
          headersToWrite = headers ?? {};
        },
      },
    },
  );

  // getClaims() verifies the JWT (JWKS, no network when the key is cached) and refreshes the session when needed.
  const { data, error } = await supabase.auth.getClaims();

  const hasSessionCookie = request.cookies.getAll().some((c) => AUTH_COOKIE.test(c.name) && c.value);
  const unavailable = Boolean(error) && hasSessionCookie && isAuthRetryableFetchError(error);

  // Built after the refresh: carries the refreshed Cookie header.
  const forwarded = new Headers(request.headers);
  for (const [k, v] of Object.entries(extraRequestHeaders)) forwarded.set(k, v);

  /** Attach the refreshed session cookies (and the headers that keep them out of shared caches) to a response. */
  const finish = (response) => {
    for (const { name, value, options } of cookiesToWrite) response.cookies.set(name, value, options);
    for (const [k, v] of Object.entries(headersToWrite)) response.headers.set(k, v);
    return response;
  };

  return {
    /** Continue to the app with the refreshed session. */
    next: () => finish(NextResponse.next({ request: { headers: forwarded } })),
    finish,
    /** Request headers to forward when the proxy rewrites instead of continuing (they carry the nonce and cookies). */
    requestHeaders: forwarded,
    claims: data?.claims ?? null,
    supabase,
    /** The auth server could not be reached while a session cookie exists: treat the member as unknown, not logged out. */
    unavailable,
  };
}
