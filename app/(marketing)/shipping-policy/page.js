import { LegalPage } from "@/components/marketing/legal-page";
import { COMMERCE_UPDATED, getDeliverySections } from "@/lib/content/commerce";

export const metadata = {
  title: "Shipping and delivery policy",
  description: "UniSphere is a digital service delivered online: no physical shipping, and access starts when you create an account.",
  alternates: { canonical: "/shipping-policy" },
};

export default function ShippingPolicyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Shipping and delivery policy"
      intro="UniSphere is delivered online, so nothing is shipped."
      sections={getDeliverySections()}
      markdown={null}
      updated={COMMERCE_UPDATED}
    />
  );
}
