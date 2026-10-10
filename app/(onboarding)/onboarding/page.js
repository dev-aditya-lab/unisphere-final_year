import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { OnboardingForm } from "@/components/onboarding/onboarding-form";
import { requireProfile } from "@/lib/auth/session";
import { listCollegesWithStructure } from "@/lib/services/colleges";
import { HOME_PATH } from "@/lib/constants";

export const metadata = {
  title: "Set up your profile",
  description: "Tell UniSphere about your campus, skills and interests.",
  robots: { index: false, follow: false },
};

export default async function OnboardingPage() {
  const { profile } = await requireProfile({ allowIncomplete: true });
  if (profile.onboarded_at) redirect(HOME_PATH);
  const colleges = await listCollegesWithStructure();

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-2xl items-center justify-between p-4 sm:p-6">
        <Logo href={null} />
        <ThemeToggle />
      </header>
      <main id="main" className="mx-auto max-w-2xl px-4 pb-16 sm:px-6">
        <p className="eyebrow">Welcome, {profile.full_name.split(" ")[0]}</p>
        <h1 className="mt-1 mb-6 text-3xl font-extrabold">Let&rsquo;s set up your profile</h1>
        <OnboardingForm profile={profile} colleges={colleges} />
      </main>
    </div>
  );
}
