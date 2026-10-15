import { LegalPage } from "@/components/marketing/legal-page";
import { getPricingSections } from "@/lib/content/commerce";
import { COMMERCE_UPDATED } from "@/lib/content/commerce";

export const metadata = {
  title: "Pricing",
  description: "UniSphere is free: no subscription, no paid tier and no payments. What is limited, and what will happen if paid features are ever introduced.",
  alternates: { canonical: "/pricing" },
};

export default function PricingPage() {
  return (
    <LegalPage
      eyebrow="Pricing"
      title="Pricing"
      intro="UniSphere is free. Here is exactly what that means."
      sections={getPricingSections()}
      markdown={null}
      updated={COMMERCE_UPDATED}
    />
  );
}
