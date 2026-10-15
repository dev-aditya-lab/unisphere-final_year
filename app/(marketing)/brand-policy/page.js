import { LegalPage } from "@/components/marketing/legal-page";
import { getBrandSections } from "@/lib/content/legal";

export const metadata = {
  title: "Brand policy",
  description: "How the UniSphere name and logo may be used, and how third-party college names and logos are treated.",
  alternates: { canonical: "/brand-policy" },
};

export default function Page() {
  return <LegalPage eyebrow="Legal" title="Brand policy" intro="How the UniSphere name and logo may be used." sections={getBrandSections()} markdown={null} />;
}
