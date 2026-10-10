import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { DataTable, EmptyRow, FilterTabs, Pager, StatusBadge, fmtDateTime } from "@/components/admin/ui";
import { listReports } from "@/lib/services/admin";

export const metadata = { title: "Reports" };

const VIEWS = [
  { value: "open", label: "Open" },
  { value: "mine", label: "Assigned to me" },
  { value: "unassigned", label: "Unassigned" },
  { value: "resolved", label: "Resolved" },
  { value: "dismissed", label: "Dismissed" },
  { value: "all", label: "All" },
];
const SEVERITIES = [{ value: "", label: "Any severity" }, { value: "critical", label: "Critical" }, { value: "high", label: "High" }, { value: "medium", label: "Medium" }, { value: "low", label: "Low" }];

const TARGET = { post: "Post", comment: "Comment", user: "Profile", project: "Project", message: "Message", event: "Event", community: "Community" };

export default async function ReportsPage({ searchParams }) {
  const sp = await searchParams;
  const view = VIEWS.some((v) => v.value === sp.view) ? sp.view : "open";
  const severity = SEVERITIES.some((s) => s.value && s.value === sp.severity) ? sp.severity : null;
  const page = Math.max(1, Number(sp.page) || 1);
  const rows = await listReports({
    status: view === "mine" || view === "unassigned" ? "open" : view,
    assigned: view === "mine" ? "me" : view === "unassigned" ? "unassigned" : null,
    severity,
    page,
  });
  const total = Number(rows[0]?.total_count ?? 0);

  return (
    <>
      <PageHeader eyebrow="Review queues" title="Reports" description="Reports from members, most serious and oldest first. Open one to see the content as it was when reported." />
      <FilterTabs label="Report views" basePath="/admin/reports" param="view" current={view} options={VIEWS} extra={{ severity }} />
      <FilterTabs label="Severity" basePath="/admin/reports" param="severity" current={severity ?? ""} options={SEVERITIES} extra={{ view }} />

      <DataTable
        caption="Reports"
        columns={["Severity", "Reported", "Category", "Status", "Assigned", "Filed", ""]}
        empty={rows.length === 0 && <EmptyRow>No reports here. Nice and quiet.</EmptyRow>}
      >
        {rows.map((r) => (
          <tr key={r.id} className="hover:bg-muted/40 align-top">
            <td className="px-4 py-3"><StatusBadge value={r.severity} /></td>
            <td className="px-4 py-3">
              <p className="font-medium">{TARGET[r.target_type] ?? r.target_type}</p>
              <p className="text-muted-foreground text-xs">{r.owner_name ? `by ${r.owner_name}` : "unknown author"}{r.college_name ? ` · ${r.college_name}` : ""}</p>
            </td>
            <td className="px-4 py-3 capitalize">{r.category.replace(/_/g, " ")}</td>
            <td className="px-4 py-3"><StatusBadge value={r.status} /></td>
            <td className="text-muted-foreground px-4 py-3">{r.assignee_name ?? "—"}</td>
            <td className="text-muted-foreground px-4 py-3 whitespace-nowrap">{fmtDateTime(r.created_at)}</td>
            <td className="px-4 py-3 text-right">
              <Link href={`/admin/reports/${r.id}`} className="text-blue-text font-semibold hover:underline">
                Review<span className="sr-only"> report from {fmtDateTime(r.created_at)}</span>
              </Link>
            </td>
          </tr>
        ))}
      </DataTable>
      <Pager basePath="/admin/reports" page={page} total={total} params={{ view, severity }} />
    </>
  );
}
