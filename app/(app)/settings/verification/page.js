import { VerificationClient } from "@/components/settings/verification-client";
import { requireProfile } from "@/lib/auth/session";
import { getVerificationState } from "@/lib/services/verification";

export const metadata = { title: "College verification" };

export default async function VerificationPage() {
  const { profile } = await requireProfile();
  const { latest, college } = await getVerificationState(profile);

  return (
    <section className="surface p-5 sm:p-6">
      <h2 className="text-lg font-bold">College verification</h2>
      <p className="text-muted-foreground mt-0.5 mb-5 text-sm">
        A verified badge tells others you really belong to {college ? college.name : "your college"}.
      </p>
      <VerificationClient status={profile.verification_status} college={college} latest={latest} />
    </section>
  );
}
