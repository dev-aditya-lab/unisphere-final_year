import { RegisterForm } from "@/components/auth/register-form";
import { FormAlert } from "@/components/forms/form-alert";
import { getPublicSettings } from "@/lib/settings";
import { REF_COOKIE, REF_PARAM, normalizeRefCode, parseRefCookieValue } from "@/lib/referrals/core";
import { getAttributionDays, previewInvite } from "@/lib/services/referrals";
import { enforceRateLimit, getClientIp } from "@/lib/rate-limit";
import { cookies } from "next/headers";
import Link from "next/link";

export const metadata = {
  title: "Create your account",
  description: "Join UniSphere for free. No college needed.",
  alternates: { canonical: "/register" },
};

export default async function RegisterPage({ searchParams }) {
  const settings = await getPublicSettings();
  if (!settings.registration_open) {
    return (
      <div>
        <h1 className="text-3xl font-extrabold">Registration is closed</h1>
        <FormAlert variant="info" className="mt-6">
          New accounts are not being accepted right now. Please check back soon.
        </FormAlert>
        <p className="text-muted-foreground mt-6 text-center text-sm">
          Already a member?{" "}
          <Link href="/login" className="text-blue-text font-semibold hover:underline">
            Log in
          </Link>
        </p>
      </div>
    );
  }
  // An invite link (?ref=CODE) or the cookie it left. The inviter's name is only shown for a code that is valid right now;
  // the code itself is re-validated on the server when the account is created.
  const sp = await searchParams;
  const jar = await cookies();
  const code = normalizeRefCode(sp?.[REF_PARAM]) ?? parseRefCookieValue(jar.get(REF_COOKIE)?.value, { maxDays: await getAttributionDays() });
  // Looking a code up is rate limited per address, so the page cannot be used to probe for valid codes.
  const limited = code ? await enforceRateLimit("ref-preview", await getClientIp(), { limit: 40, windowSec: 60 }) : null;
  const invite = code && !limited ? await previewInvite(code) : { valid: false };
  return <RegisterForm referralCode={invite.valid ? code : null} inviterName={invite.valid ? invite.name : null} />;
}
