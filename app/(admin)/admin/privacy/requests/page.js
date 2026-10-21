import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { DataTable, EmptyRow, FilterTabs, Pager, fmtDateTime } from "@/components/admin/ui";
import { RequestStatusBadge } from "@/components/privacy/request-status";
import { requirePermission } from "@/lib/auth/session";
import { listRequestsForStaff } from "@/lib/privacy/requests";
import { REQUEST_KINDS } from "@/lib/privacy/registry";

export const metadata = { title: "Privacy requests" };

const VIEWS = [
  { value: "open", label: "Open" },
  { value: "overdue", label: "Overdue" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All" },
];

export default async function PrivacyRequestsAdminPage({ searchParams }) {
  await requirePermission("privacy.requests");
  const sp = await searchParams;
  const status = VIEWS.some((v) => v.value === sp.status) ? sp.status : "open";
  const kind = Object.keys(REQUEST_KINDS).includes(sp.kind) ? sp.kind : null;
  const page = Math.max(1, Number(sp.page) || 1);
  const { rows, total, error } = await listRequestsForStaff({ status, kind, page });

  return (
    <>
      <PageHeader eyebrow="Privacy" title="Requests & grievances" description="Everything members and visitors have asked for under their data rights, oldest deadline first." />
      <FilterTabs label="Request views" basePath="/admin/privacy/requests" current={status} options={VIEWS} extra={{ kind }} />
      <FilterTabs label="Kinds" basePath="/admin/privacy/requests" param="kind" current={kind ?? "all"} options={[{ value: "all", label: "Every kind" }, ...Object.entries(REQUEST_KINDS).map(([value, k]) => ({ value, label: k.plural }))]} extra={{ status }} />
      {error && <p role="alert" className="text-destructive-text mb-3 text-sm">{error}</p>}
      <DataTable caption="Privacy requests" columns={["Reference", "Kind", "From", "Subject", "Status", "Due"]} empty={rows.length === 0 && <EmptyRow>No requests here.</EmptyRow>}>
        {rows.map((r) => (
          <tr key={r.id} className="align-top">
            <td className="px-4 py-3 font-mono text-xs whitespace-nowrap"><Link href={`/admin/privacy/requests/${r.id}`} className="text-blue-text hover:underline">{r.reference}</Link></td>
            <td className="px-4 py-3 whitespace-nowrap">{REQUEST_KINDS[r.kind]?.label ?? r.kind}</td>
            <td className="text-muted-foreground px-4 py-3 whitespace-nowrap">{r.requester_username ? `@${r.requester_username}` : r.channel === "visitor" ? "Visitor" : "Erased account"}</td>
            <td className="max-w-xs px-4 py-3 break-words">{r.subject}</td>
            <td className="px-4 py-3"><RequestStatusBadge status={r.status} /></td>
            <td className="px-4 py-3 whitespace-nowrap">{r.closed_at ? <span className="text-muted-foreground">closed {fmtDateTime(r.closed_at)}</span> : <span className={r.overdue ? "text-destructive-text font-semibold" : ""}>{fmtDateTime(r.due_at)}{r.overdue ? " (overdue)" : ""}</span>}</td>
          </tr>
        ))}
      </DataTable>
      <Pager basePath="/admin/privacy/requests" page={page} total={total} params={{ status, kind }} />
    </>
  );
}
