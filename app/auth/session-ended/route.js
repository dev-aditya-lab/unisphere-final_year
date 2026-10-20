import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-redirect";
import { redirectToPath } from "@/lib/security/relative-redirect";

export const dynamic = "force-dynamic";

const PASS_THROUGH_ERRORS = new Set(["profile_missing"]);

/**
 * Where a request lands when the browser still holds session cookies that the server no longer accepts: the
 * session was revoked elsewhere ("sign out everywhere", a password change, an administrator), or its profile is gone.
 *
 * It ends the local session (clearing the cookies) and only then sends the visitor to /login. Redirecting straight
 * to /login would loop: the proxy still sees a JWT that verifies and would bounce /login back to the app, which
 * would send the visitor to /login again.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const next = safeNext(searchParams.get("next"), "/feed");
  const error = searchParams.get("error");

  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" }).catch(() => {});

  // Relative, so it is right behind a proxy (request.url there is the server's own address, not the public domain).
  const query = new URLSearchParams({ next });
  if (error && PASS_THROUGH_ERRORS.has(error)) query.set("error", error);
  const res = redirectToPath(`/login?${query.toString()}`);
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
