import { LegalPage } from "@/components/marketing/legal-page";
import { getCopyrightSections } from "@/lib/content/legal";

export const metadata = {
  title: "Copyright policy",
  description: "How to report content you believe infringes your copyright on UniSphere, what happens next, and how members can respond.",
  alternates: { canonical: "/copyright-policy" },
};

export default function Page() {
  return <LegalPage eyebrow="Legal" title="Copyright policy" intro="How to report a copyright concern and how complaints are handled." sections={getCopyrightSections()} markdown={null} />;
}
