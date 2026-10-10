import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Refreshes the Supabase session cookies for every matched request and returns
 * the (verified) JWT claims, if any. Authorization decisions are NOT made
 * from this alone: pages and actions re-check with `requireUser()`.
 */
export async function updateSession(request, extraRequestHeaders = {}) {
  const requestHeaders = new Headers(request.headers);
  for (const [k, v] of Object.entries(extraRequestHeaders)) requestHeaders.set(k, v);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // getClaims() validates the JWT (JWKS) and refreshes the session when needed.
  const { data } = await supabase.auth.getClaims();
  return { getResponse: () => response, claims: data?.claims ?? null, supabase };
}
