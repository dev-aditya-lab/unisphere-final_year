import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { DataTable, EmptyRow, Panel, StatusBadge, fmtDateTime } from "@/components/admin/ui";
import { IncidentCreateForm } from "@/components/admin/privacy-admin";
import { requirePermission } from "@/lib/auth/session";
import { listIncidents } from "@/lib/privacy/incidents";
import { INCIDENT_DATA_CATEGORIES, INCIDENT_STATUS } from "@/lib/privacy/registry";
import { hoursToBoardDeadline } from "@/lib/privacy/incident-templates";

export const metadata = { title: "Data breaches" };

export default async function IncidentsPage() {
  await requirePermission("privacy.incidents");
  const rows = await listIncidents();
  return (
    <>
      <PageHeader eyebrow="Privacy" title="Data breaches" description="Suspected and confirmed personal data breaches. Open an incident as soon as something looks wrong: you can mark it “not a breach” later. Nothing here is visible outside the privacy team, and nothing is sent without a person approving it." />
      <DataTable caption="Incidents" columns={["Reference", "Title", "Severity", "Status", "Detected", "72-hour report"]} empty={rows.length === 0 && <EmptyRow>No incidents recorded.</EmptyRow>}>
        {rows.map((r) => {
          const h = hoursToBoardDeadline(r.aware_at);
          return (
            <tr key={r.id} className="align-top">
              <td className="px-4 py-3 font-mono text-xs whitespace-nowrap"><Link href={`/admin/privacy/incidents/${r.id}`} className="text-blue-text hover:underline">{r.reference}</Link></td>
              <td className="px-4 py-3">{r.title}</td>
              <td className="px-4 py-3"><StatusBadge value={r.severity} /></td>
              <td className="px-4 py-3"><StatusBadge value={r.status} /><span className="sr-only"> {INCIDENT_STATUS[r.status]}</span></td>
              <td className="text-muted-foreground px-4 py-3 whitespace-nowrap">{fmtDateTime(r.detected_at)}</td>
              <td className="px-4 py-3 whitespace-nowrap text-xs">
                {r.board_detailed_at ? "Submitted" : h == null ? "Clock not started" : h < 0 ? <span className="text-destructive-text font-semibold">{Math.abs(Math.round(h))}h overdue</span> : `${Math.round(h)}h left`}
              </td>
            </tr>
          );
        })}
      </DataTable>
      <Panel title="Open an incident" className="mt-6">
        <IncidentCreateForm categories={INCIDENT_DATA_CATEGORIES} />
      </Panel>
    </>
  );
}
