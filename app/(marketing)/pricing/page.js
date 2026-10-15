import { LegalPage } from "@/components/marketing/legal-page";
import { COMMERCE_UPDATED, getPricingSections } from "@/lib/content/commerce";
import { getBlueTickConfig } from "@/lib/services/blue-tick";

export const metadata = {
  title: "Pricing",
  description: "UniSphere is free. The optional blue tick is a one-time payment confirmed by an administrator. What it costs and how it works.",
  alternates: { canonical: "/pricing" },
};

export default async function PricingPage() {
  // Read the live price so this page can never state a number that differs from what is charged.
  let blueTick = null;
  try {
    const config = await getBlueTickConfig();
    blueTick = { open: config.open, pricePaise: config.pricePaise };
  } catch {
    blueTick = null;
  }
  return (
    <LegalPage
      eyebrow="Pricing"
      title="Pricing"
      intro="UniSphere is free. The blue tick is the only optional, paid item."
      sections={getPricingSections({ blueTick })}
      markdown={null}
      updated={COMMERCE_UPDATED}
    />
  );
}
