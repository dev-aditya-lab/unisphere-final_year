import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { OnboardingForm } from "@/components/onboarding/onboarding-form";
import { MotionFeatures } from "@/components/motion/motion-features";
import { requireProfile } from "@/lib/auth/session";
import { getCollegeStructure, getCollegeSummary } from "@/lib/services/colleges";
import { listCommunities } from "@/lib/services/campus";
import { HOME_PATH } from "@/lib/constants";

export const metadata = {
  title: "Set up your profile",
  description: "Tell UniSphere about your campus, skills and interests.",
  robots: { index: false, follow: false },
};

export default async function OnboardingPage() {
  const { profile } = await requireProfile({ allowIncomplete: true });
  if (profile.onboarded_at) redirect(HOME_PATH);
  const [college, structure, communities] = await Promise.all([
    getCollegeSummary(profile.college_id),
    getCollegeStructure(profile.college_id),
    listCommunities({}).then((list) => list.filter((c) => c.my_status !== "banned").slice(0, 6)),
  ]);

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-2xl items-center justify-between p-4 sm:p-6">
        <Logo href={null} />
        <ThemeToggle />
      </header>
      <main id="main" className="mx-auto max-w-2xl px-4 pb-16 sm:px-6">
        <p className="eyebrow">Welcome, {profile.full_name.split(" ")[0]}</p>
        <h1 className="display-sm mt-2 mb-7">Let&rsquo;s set up your profile</h1>
        <MotionFeatures>
          <OnboardingForm profile={profile} college={college} structure={structure} communities={communities} />
        </MotionFeatures>
      </main>
    </div>
  );
}
