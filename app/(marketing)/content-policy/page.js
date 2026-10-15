import { LegalPage } from "@/components/marketing/legal-page";
import { getContentPolicySections } from "@/lib/content/legal";

export const metadata = {
  title: "Content policy",
  description: "What content is not allowed on UniSphere, how reports are reviewed, what can happen to content and accounts, and how to appeal.",
  alternates: { canonical: "/content-policy" },
};

export default function Page() {
  return <LegalPage eyebrow="Community" title="Content policy" intro="What is not allowed, how we review reports, and how you can appeal." sections={getContentPolicySections()} markdown={null} />;
}
