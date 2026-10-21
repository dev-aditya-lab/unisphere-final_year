import Link from "next/link";
import { LegalPage } from "@/components/marketing/legal-page";
import { getPrivacySections } from "@/lib/content/legal";
import { CURRENT_NOTICE } from "@/lib/privacy/registry";

export const metadata = {
  title: "Privacy policy",
  description: "What information UniSphere collects, how it is used, who can see it and the choices you have.",
  alternates: { canonical: "/privacy" },
};

// The policy cannot be replaced from the admin console: it must describe what the code really does, and every
// version is archived (lib/privacy/). Changing its text means a new notice version.
export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Privacy policy"
      intro={`Plain-language details about your information on UniSphere. Version ${CURRENT_NOTICE.version}.`}
      sections={getPrivacySections()}
      markdown={null}
    >
      <p className="mt-10 text-sm">
        <Link href="/privacy-notice" className="text-blue-text underline">Privacy notice</Link> ·{" "}
        <Link href="/privacy-centre" className="text-blue-text underline">Privacy centre</Link> ·{" "}
        <Link href="/grievance" className="text-blue-text underline">Grievances</Link>
      </p>
    </LegalPage>
  );
}
