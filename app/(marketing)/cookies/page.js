import { LegalPage } from "@/components/marketing/legal-page";
import { DeviceDataControl } from "@/components/marketing/device-data-control";
import { getCookieSections } from "@/lib/content/legal";
import { ads } from "@/lib/ads";
import { monetag } from "@/lib/monetag";

export const metadata = {
  title: "Cookies and privacy preferences",
  description: "Exactly what UniSphere stores in your browser, why, how long it lasts, what advertising on public pages may add, and the controls you have.",
  alternates: { canonical: "/cookies" },
};

export default function CookiesPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Cookies and privacy preferences"
      intro="What UniSphere keeps on your device, in plain language, and what you can do about it."
      sections={getCookieSections({ adsEnabled: ads.enabled, networkAds: monetag.enabled })}
      markdown={null}
    >
      <DeviceDataControl />
    </LegalPage>
  );
}
