import { VerificationClient } from "@/components/settings/verification-client";
import { requireProfile } from "@/lib/auth/session";
import { getVerificationState } from "@/lib/services/verification";

export const metadata = { title: "Verified badge" };

export default async function VerificationPage() {
  const { profile } = await requireProfile();
  const { latest, college } = await getVerificationState(profile);

  return (
    <section className="surface p-5 sm:p-6">
      <h2 className="text-lg font-bold">Verified badge <span className="text-muted-foreground text-sm font-normal">(optional)</span></h2>
      <p className="text-muted-foreground mt-0.5 mb-5 text-sm">
        UniSphere is open to everyone and you never need a badge. Where a college has shared its own list of student IDs, you can use yours to show you really belong there. Choosing a college on its own never verifies you.
      </p>
      <VerificationClient status={profile.verification_status} college={college} latest={latest} />
    </section>
  );
}
