import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeNext } from "@/lib/safe-redirect";
import { redirectToPath } from "@/lib/security/relative-redirect";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { getPublicSettings } from "@/lib/settings";
import { HOME_PATH } from "@/lib/constants";

export const dynamic = "force-dynamic";

// A profile this young belongs to an account that was created by this very sign-in.
const NEW_ACCOUNT_SECONDS = 120;

/**
 * Where Google sends a person back to (through Supabase Auth) after they chose an account. The request carries a one-time `code`;
 * exchanging it needs the PKCE verifier stored in THIS browser's cookie, so a stolen link is useless to anyone else. Redirects are
 * relative and only to same-site paths. Never throws a detail to the visitor: every failure is one friendly message on /login.
 *
 * Two rules the form-based sign-up has, kept here too, because Google sign-in can create an account:
 *   - registration must be open (an administrator can close it);
 *   - the privacy review still happens: a new account has recorded no consent yet, so the app sends it to /privacy-review before anything else.
 */
export async function GET(request) {
  const limit = await rateLimit({ key: `oauth-cb:${await getClientIp()}`, limit: 30, windowSec: 600 });
  if (!limit.ok) return redirectToPath("/login?error=google_failed");

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"), HOME_PATH);
  if (searchParams.get("error") || !code) return redirectToPath("/login?error=google_failed");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data?.user) return redirectToPath("/login?error=google_failed");

  const settings = await getPublicSettings();
  if (!settings.registration_open) {
    const { data: profile } = await createAdminClient().from("profiles").select("created_at").eq("id", data.user.id).maybeSingle();
    const fresh = !profile || Date.now() - new Date(profile.created_at).getTime() < NEW_ACCOUNT_SECONDS * 1000;
    if (fresh) {
      // Someone new tried to join while sign-ups are closed: remove the account this attempt just made and end the session.
      await createAdminClient().auth.admin.deleteUser(data.user.id);
      await supabase.auth.signOut({ scope: "local" });
      return redirectToPath("/login?error=registration_closed");
    }
  }
  return redirectToPath(next);
}
