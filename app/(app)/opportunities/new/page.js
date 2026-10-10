import { notFound } from "next/navigation";
import { OpportunityForm } from "@/components/campus/opportunity-parts";
import { PageHeader } from "@/components/shell/page-header";
import { requireProfile } from "@/lib/auth/session";
import { isFlagEnabled } from "@/lib/settings";

export const metadata = { title: "Share an opportunity", robots: { index: false, follow: false } };

export default async function NewOpportunityPage() {
  if (!(await isFlagEnabled("opportunities"))) notFound();
  await requireProfile();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow="Opportunities" title="Share an opportunity" description="Only share real openings you can stand behind. Listings can be reported and removed by moderators." />
      <OpportunityForm />
    </div>
  );
}
