import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { VerificationClient } from "@/components/settings/verification-client";
import { logoutAction } from "@/lib/actions/auth";
import { getVerificationState } from "@/lib/services/verification";

/**
 * What a signed-in but unverified account sees instead of the app. It explains why, and puts the one thing they
 * can do (verify with their student ID, or ask for manual review) right on the page.
 */
export async function VerificationGate({ profile }) {
  const { latest, college } = await getVerificationState(profile);
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between p-4 sm:p-6">
        <Logo />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <form action={logoutAction}>
            <Button type="submit" variant="outline" size="sm">Log out</Button>
          </form>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-xl flex-1 px-4 pb-20 sm:pt-6">
        <div className="text-center">
          <span className="bg-accent text-accent-foreground mx-auto flex size-12 items-center justify-center rounded-full">
            <LockKeyhole className="size-5" aria-hidden="true" />
          </span>
          <h1 className="mt-4 text-3xl font-extrabold">Verify to enter UniSphere</h1>
          <p className="text-muted-foreground mt-3">
            UniSphere is a private network for {college?.name ?? "Ramgarh Engineering College"}. Nothing inside is visible until you confirm you are a member.
          </p>
        </div>
        <section className="surface mt-8 p-5 sm:p-6" aria-label="Verify your membership">
          <VerificationClient status={profile.verification_status} college={college} latest={latest} />
        </section>
        <p className="text-muted-foreground mt-5 text-center text-sm">
          Wrong college or account type? <Link href="/settings/profile" className="text-primary font-semibold hover:underline">Edit your profile</Link>. Need help? <Link href="/contact" className="text-primary font-semibold hover:underline">Contact us</Link>.
        </p>
      </main>
    </div>
  );
}
