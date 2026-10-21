import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/admin/ui";
import { PrivacySettingRow } from "@/components/admin/privacy-admin";
import { requirePermission } from "@/lib/auth/session";
import { getSetting } from "@/lib/settings";

export const metadata = { title: "Privacy settings" };

const KEYS = ["privacy_review_mode", "privacy_response_days", "privacy_grievance_max_days", "privacy_retention", "privacy_incident_self_approval"];
const DEFAULTS = {
  privacy_review_mode: "soft",
  privacy_response_days: { access: 30, correction: 30, erasure: 30, nomination: 30, grievance: 14, other: 30 },
  privacy_grievance_max_days: 90,
  privacy_retention: { closed_request_days: 365, contact_message_days: 365, ai_usage_log_days: 365, erasure_ledger_days: 365, closed_report_days: 365 },
  privacy_incident_self_approval: false,
};

export default async function PrivacySettingsAdminPage() {
  await requirePermission("privacy.manage");
  const values = await Promise.all(KEYS.map((k) => getSetting(k)));
  return (
    <>
      <PageHeader eyebrow="Privacy" title="Privacy settings" description="Deadlines and retention that the privacy pages and jobs use. Only privacy officers can change these; every change is written to the audit log." />
      <Panel>
        {KEYS.map((k, i) => (
          <PrivacySettingRow key={k} settingKey={k} value={values[i] ?? DEFAULTS[k]} />
        ))}
      </Panel>
      <p className="text-muted-foreground mt-4 text-xs">Retention and deadline numbers here are placeholders. They are not legal advice; confirm them with a lawyer before launch (docs/DPDP_COMPLIANCE.md).</p>
    </>
  );
}
