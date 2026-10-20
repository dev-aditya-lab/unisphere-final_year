import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-redirect";
import { redirectToPath } from "@/lib/security/relative-redirect";
import { HOME_PATH } from "@/lib/constants";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES = new Set(["email", "signup", "recovery", "email_change", "invite"]);

/**
 * Landing route for links in Supabase auth emails (confirm email, reset password,
 * confirm new email). Verifies the one-time token server-side, which sets the
 * session cookies, then redirects to a same-site destination only. The redirects are relative on purpose: behind a
 * proxy `request.url` carries the server's own host and port (https://localhost:10000), not the public domain.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = safeNext(searchParams.get("next"), HOME_PATH);

  if (!tokenHash || !type || !ALLOWED_TYPES.has(type)) {
    return redirectToPath("/login?error=invalid_link");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    const target = type === "recovery" ? "/forgot-password?error=expired_link" : "/login?error=expired_link";
    return redirectToPath(target);
  }

  // Recovery sessions may only be used to set a new password.
  if (type === "recovery") return redirectToPath("/reset-password");
  return redirectToPath(next);
}
