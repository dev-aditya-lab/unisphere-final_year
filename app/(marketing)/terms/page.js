import { LegalPage } from "@/components/marketing/legal-page";
import { getTermsSections } from "@/lib/content/legal";
import { ads } from "@/lib/ads";
import { monetag } from "@/lib/monetag";
import { getSetting } from "@/lib/settings";

export const metadata = {
  title: "Terms of service",
  description: "The terms that apply when you use UniSphere.",
  alternates: { canonical: "/terms" },
};

export default async function TermsPage() {
  const md = await getSetting("terms_md");
  return (
    <LegalPage
      eyebrow="Legal"
      title="Terms of service"
      sections={getTermsSections({ adsEnabled: ads.enabled || monetag.enabled })}
      markdown={typeof md === "string" && md.trim() ? md : null}
    />
  );
}
