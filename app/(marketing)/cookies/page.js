import { LegalPage } from "@/components/marketing/legal-page";
import { getCookieSections } from "@/lib/content/legal";
import { ads } from "@/lib/ads";

export const metadata = {
  title: "Cookies and browser storage",
  description: "Exactly what UniSphere stores in your browser, why, and how long it lasts. No analytics or tracking cookies.",
  alternates: { canonical: "/cookies" },
};

export default function CookiesPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Cookies and browser storage"
      intro="What UniSphere keeps on your device, in plain language."
      sections={getCookieSections({ adsEnabled: ads.enabled })}
      markdown={null}
    />
  );
}
