import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { ReviewForm } from "@/components/privacy/review-form";
import { requireProfile } from "@/lib/auth/session";
import { gateFor } from "@/lib/privacy/gate-server";
import { NOTICE_VERSION } from "@/lib/privacy/registry";
import { safeNext } from "@/lib/safe-redirect";
import { HOME_PATH } from "@/lib/constants";

export const metadata = {
  title: "Review your privacy choices",
  description: "Confirm how UniSphere may use your information.",
  robots: { index: false, follow: false },
};

export default async function PrivacyReviewPage({ searchParams }) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : null, HOME_PATH);
  const { profile } = await requireProfile({ allowIncomplete: true });
  const gate = await gateFor(profile);
  if (gate.state === "ok" || gate.state === "notice_updated") redirect(next);

  const minor = gate.state === "minor";
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-2xl items-center justify-between p-4 sm:p-6">
        <Logo href={null} />
        <ThemeToggle />
      </header>
      <main id="main" className="mx-auto max-w-2xl px-4 pb-16 sm:px-6">
        <p className="eyebrow">Your privacy</p>
        <h1 className="display-sm mt-2 mb-3">{minor ? "A note about your age" : "Review your privacy choices"}</h1>
        {!minor && (
          <p className="text-muted-foreground mb-7 max-w-xl text-[0.9375rem] leading-relaxed">
            UniSphere now records what you agree to, and keeps optional things, like AI features, separate from your account. Your account is unchanged. Nothing optional is switched on for you; you can choose those in Settings → Privacy at any time.
          </p>
        )}
        <ReviewForm
          next={next}
          needsAge={minor || gate.missing.includes("age_confirmation")}
          needsCore={gate.missing.includes("core_service")}
          minor={minor}
          noticeVersion={NOTICE_VERSION}
        />
      </main>
    </div>
  );
}
