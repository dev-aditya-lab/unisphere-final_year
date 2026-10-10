import Link from "next/link";
import { MailCheck } from "lucide-react";
import { ResendVerification } from "@/components/auth/resend-verification";
import { z } from "zod";

export const metadata = {
  title: "Check your email",
  description: "Confirm your email address to finish creating your UniSphere account.",
  robots: { index: false, follow: false },
};

export default async function VerifyEmailPage({ searchParams }) {
  const sp = await searchParams;
  const parsed = z.email().safeParse(typeof sp.email === "string" ? sp.email : "");
  const email = parsed.success ? parsed.data : null;

  return (
    <div className="text-center">
      <span className="bg-accent text-accent-foreground mx-auto flex size-12 items-center justify-center rounded-full">
        <MailCheck className="size-6" aria-hidden="true" />
      </span>
      <h1 className="mt-5 text-2xl font-extrabold">Confirm your email</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        {email ? (
          <>
            We sent a confirmation link to <strong className="text-foreground">{email}</strong>. Open it on this device to finish setting up your account.
          </>
        ) : (
          "We sent you a confirmation link. Open it to finish setting up your account."
        )}
      </p>
      <div className="mt-6 flex flex-col items-center gap-3">
        <ResendVerification email={email} />
        <p className="text-muted-foreground max-w-xs text-xs">
          Not there after a minute? Check spam, or make sure the address is spelled correctly. If you already have an account, you can{" "}
          <Link href="/forgot-password" className="text-primary font-medium hover:underline">
            reset your password
          </Link>
          .
        </p>
        <Link href="/login" className="text-primary text-sm font-semibold hover:underline">
          Back to log in
        </Link>
      </div>
    </div>
  );
}
