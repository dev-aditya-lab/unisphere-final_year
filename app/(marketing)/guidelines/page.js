import { LegalPage } from "@/components/marketing/legal-page";
import { GUIDELINES } from "@/lib/content/legal";
import { getSetting } from "@/lib/settings";

export const metadata = {
  title: "Community guidelines",
  description: "How we keep UniSphere respectful, safe and useful for everyone on campus.",
  alternates: { canonical: "/guidelines" },
};

export default async function GuidelinesPage() {
  const md = await getSetting("guidelines_md");
  return (
    <LegalPage
      eyebrow="Community"
      title="Community guidelines"
      intro="UniSphere works when people feel safe to share. These are the shared expectations for everyone here."
      sections={GUIDELINES}
      markdown={typeof md === "string" && md.trim() ? md : null}
    />
  );
}
