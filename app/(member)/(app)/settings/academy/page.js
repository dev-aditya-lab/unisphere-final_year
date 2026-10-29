import Link from "next/link";
import { ProfileForm } from "@/components/academy/commerce/student-actions";
import { requireProfile } from "@/lib/auth/session";
import { getMyAcademyProfile } from "@/lib/services/academy";

export const metadata = { title: "Academy settings" };

export default async function AcademySettingsPage() {
  const { profile } = await requireProfile();
  const initial = await getMyAcademyProfile(profile.id);
  return (
    <section className="surface p-5 sm:p-6">
      <h2 className="text-lg font-bold">Academy</h2>
      <p className="text-muted-foreground mt-0.5 mb-5 text-sm">
        How your name appears on certificates and what a person checking one may see. Your profile, notifications and privacy stay in the other settings. Academy notifications have their own switch in <Link href="/settings/notifications" className="text-primary-text underline">Notifications</Link>.
      </p>
      <ProfileForm initial={initial} />
    </section>
  );
}
