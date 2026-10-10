import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-redirect";
import { HOME_PATH } from "@/lib/constants";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES = new Set(["email", "signup", "recovery", "email_change", "invite"]);

/**
 * Landing route for links in Supabase auth emails (confirm email, reset password,
 * confirm new email). Verifies the one-time token server-side, which sets the
 * session cookies, then redirects to a same-origin destination only.
 */
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = safeNext(searchParams.get("next"), HOME_PATH);

  if (!tokenHash || !type || !ALLOWED_TYPES.has(type)) {
    return NextResponse.redirect(`${origin}/login?error=invalid_link`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    const target = type === "recovery" ? "/forgot-password?error=expired_link" : "/login?error=expired_link";
    return NextResponse.redirect(`${origin}${target}`);
  }

  // Recovery sessions may only be used to set a new password.
  if (type === "recovery") return NextResponse.redirect(`${origin}/reset-password`);
  return NextResponse.redirect(`${origin}${next}`);
}
