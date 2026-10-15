import { LegalPage } from "@/components/marketing/legal-page";
import { getAccessibilitySections } from "@/lib/content/legal";

export const metadata = {
  title: "Accessibility",
  description: "What UniSphere does to be usable by everyone, where it falls short, and how to report an accessibility problem.",
  alternates: { canonical: "/accessibility" },
};

export default function AccessibilityPage() {
  return (
    <LegalPage
      eyebrow="Accessibility"
      title="Accessibility"
      intro="What we do, what we have not done yet, and how to tell us when something does not work for you."
      sections={getAccessibilitySections()}
      markdown={null}
    />
  );
}
