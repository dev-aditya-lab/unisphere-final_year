import { LegalPage } from "@/components/marketing/legal-page";
import { getPrivacySections } from "@/lib/content/legal";
import { ads } from "@/lib/ads";
import { getSetting } from "@/lib/settings";

export const metadata = {
  title: "Privacy policy",
  description: "What information UniSphere collects, how it is used, who can see it and the choices you have.",
  alternates: { canonical: "/privacy" },
};

export default async function PrivacyPage() {
  const md = await getSetting("privacy_md");
  return (
    <LegalPage
      eyebrow="Legal"
      title="Privacy policy"
      intro="Plain-language details about your information on UniSphere."
      sections={getPrivacySections({ adsEnabled: ads.enabled })}
      markdown={typeof md === "string" && md.trim() ? md : null}
    />
  );
}
