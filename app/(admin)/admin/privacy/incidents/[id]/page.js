import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "@/components/shell/page-header";
import { Panel, StatusBadge, fmtDateTime } from "@/components/admin/ui";
import { AffectedForm, IncidentEditor, IncidentEventForm, IncidentStatusForm, NoticeEditor } from "@/components/admin/privacy-admin";
import { getMyPermissions, requirePermission } from "@/lib/auth/session";
import { getIncident } from "@/lib/privacy/incidents";
import { INCIDENT_DATA_CATEGORIES } from "@/lib/privacy/registry";
import { NOTICE_AUDIENCES, hoursToBoardDeadline } from "@/lib/privacy/incident-templates";

export const metadata = { title: "Data breach" };

export default async function IncidentPage({ params }) {
  await requirePermission("privacy.incidents");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const found = await getIncident(id);
  if (!found) notFound();
  const { incident: i, events, affected, notices } = found;
  const names = new Set((await getMyPermissions()).map((p) => p.permission));
  const hours = hoursToBoardDeadline(i.aware_at);
  const notified = affected.filter((a) => a.notified_at).length;
  const closed = ["closed", "not_a_breach"].includes(i.status);

  return (
    <>
      <PageHeader eyebrow={`Data breach · ${i.reference}`} title={i.title} actions={<><StatusBadge value={i.severity} /> <StatusBadge value={i.status} /></>} />
      <p className="text-muted-foreground -mt-3 mb-5 text-sm">
        <Link href="/admin/privacy/incidents" className="text-blue-text underline">All incidents</Link> · detected {fmtDateTime(i.detected_at)}
        {i.aware_at ? <> · aware since {fmtDateTime(i.aware_at)}</> : " · not yet confirmed, so the 72-hour clock has not started"}
      </p>

      {i.aware_at && !i.board_detailed_at && (
        <div role="status" className={`mb-5 rounded-xl border px-4 py-3 text-sm font-medium ${hours < 0 ? "border-destructive/40 bg-destructive-soft text-destructive-text" : "border-warning/50 bg-warning-soft text-warning-text"}`}>
          {hours < 0 ? `The 72-hour detailed report to the Data Protection Board is ${Math.abs(Math.round(hours))} hours overdue. The Board can allow more time if you ask in writing.` : `About ${Math.round(hours)} hours left for the detailed report to the Data Protection Board (72 hours from becoming aware). Affected people must be told without delay.`}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="space-y-5">
          <Panel title="Facts" description="Only what is confirmed. These feed the notices; a notice cannot be approved while required facts are missing."><IncidentEditor incident={i} categories={INCIDENT_DATA_CATEGORIES} /></Panel>

          {Object.entries(NOTICE_AUDIENCES).map(([audience, meta]) => (
            <Panel key={audience} title={meta.label}>
              <NoticeEditor
                incidentId={i.id}
                audience={audience}
                label={meta.label}
                notice={notices.find((n) => n.audience === audience) ?? null}
                canApprove={names.has("privacy.incidents.approve")}
                canSend={names.has("privacy.incidents")}
              />
            </Panel>
          ))}
        </div>

        <div className="space-y-5">
          <Panel title="Status"><IncidentStatusForm id={i.id} status={i.status} /></Panel>
          <Panel title="Affected members" description={`${affected.length} listed, ${notified} notified.`}>
            {!closed && <AffectedForm id={i.id} />}
            <p className="text-muted-foreground mt-3 text-xs">The list itself is not shown on this page, to keep personal data off it.</p>
          </Panel>
          <Panel title="Timeline">
            <ol className="space-y-3">
              {events.map((e) => (
                <li key={e.id} className="border-l-2 pl-3">
                  <p className="text-xs font-semibold uppercase">{e.kind} <span className="text-muted-foreground font-normal normal-case">{fmtDateTime(e.created_at)}</span></p>
                  {e.body && <p className="mt-0.5 text-[13px] break-words whitespace-pre-wrap">{e.body}</p>}
                </li>
              ))}
            </ol>
            {!closed && <div className="mt-4 border-t pt-4"><IncidentEventForm id={i.id} /></div>}
          </Panel>
        </div>
      </div>
    </>
  );
}
