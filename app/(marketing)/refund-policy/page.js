import { LegalPage } from "@/components/marketing/legal-page";
import { COMMERCE_UPDATED, getRefundSections } from "@/lib/content/commerce";

export const metadata = {
  title: "Refund and cancellation policy",
  description: "How cancellation and refunds work on UniSphere: the service is free today, how to delete your account, and what will be published before any charge.",
  alternates: { canonical: "/refund-policy" },
};

export default function RefundPolicyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Refund and cancellation policy"
      intro="What happens if you want to cancel, and how refunds would work."
      sections={getRefundSections()}
      markdown={null}
      updated={COMMERCE_UPDATED}
    />
  );
}
