import { PageHeader } from "@/components/shell/page-header";
import { DataTable, EmptyRow, FilterTabs, Pager, Panel, fmtDate, fmtNumber } from "@/components/admin/ui";
import { ActionDialog } from "@/components/admin/action-dialog";
import { AcademicVisibility, RenameAcademicDialog } from "@/components/admin/academics-admin";
import { Button } from "@/components/ui/button";
import { deleteAcademicItemAction } from "@/lib/actions/admin";
import { listAcademicItems } from "@/lib/services/admin";

export const metadata = { title: "Departments & courses" };

const KINDS = [
  { value: "all", label: "Both" },
  { value: "department", label: "Departments" },
  { value: "program", label: "Courses" },
];
const STATUSES = [
  ["", "Everything"],
  ["community", "Added by members"],
  ["listed", "Set up by the college"],
  ["hidden", "Hidden"],
];

export default async function AdminAcademicsPage({ searchParams }) {
  const sp = await searchParams;
  const kind = sp.kind === "department" || sp.kind === "program" ? sp.kind : "all";
  const status = STATUSES.some(([v]) => v && v === sp.status) ? sp.status : "";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const page = Math.max(1, Number.parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1);

  const rows = await listAcademicItems({ kind: kind === "all" ? null : kind, status: status || null, q: q || null, page });
  const total = Number(rows[0]?.total_count ?? 0);

  return (
    <>
      <PageHeader
        eyebrow="Community"
        title="Departments & courses"
        description="Members add the department or course their college is missing, so lists grow as people join, like colleges do. Nothing needs approval before it appears. Use this page to fix spelling, hide something that should not be offered, or remove it. Hiding keeps it on the profiles that already use it."
      />
      <FilterTabs label="Type" basePath="/admin/academics" param="kind" current={kind} options={KINDS} extra={{ status, q }} />
      <Panel title={`Items (${fmtNumber(total)})`}>
        <form action="/admin/academics" className="mb-4 flex flex-wrap items-end gap-2">
          <input type="hidden" name="kind" value={kind} />
          <div className="space-y-1.5">
            <label htmlFor="ac-q" className="text-[13px] font-semibold">Search</label>
            <input id="ac-q" name="q" defaultValue={q} placeholder="Name or college" className="border-input bg-card h-10 w-64 rounded-lg border px-3 text-sm" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="ac-status" className="text-[13px] font-semibold">Show</label>
            <select id="ac-status" name="status" defaultValue={status}>
              {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <Button type="submit" size="sm">Filter</Button>
        </form>

        <DataTable caption="Departments and courses" columns={["Name", "Type", "College", "Added by", "Members", "Offered", ""]} empty={rows.length === 0 && <EmptyRow>Nothing matches.</EmptyRow>}>
          {rows.map((r) => (
            <tr key={`${r.kind}-${r.id}`}>
              <td className="px-4 py-3 font-medium">
                {r.name}
                {r.department_name && <span className="text-muted-foreground block text-xs font-normal">{r.department_name}</span>}
              </td>
              <td className="text-muted-foreground px-4 py-3">{r.kind === "department" ? "Department" : "Course"}</td>
              <td className="px-4 py-3">{r.college_name}</td>
              <td className="text-muted-foreground px-4 py-3 whitespace-nowrap">{r.is_community ? <>@{r.added_by ?? "former member"}<span className="block text-xs">{fmtDate(r.created_at)}</span></> : "College"}</td>
              <td className="px-4 py-3 tabular-nums">{fmtNumber(r.members)}</td>
              <td className="px-4 py-3"><AcademicVisibility item={r} /></td>
              <td className="px-4 py-3 text-right whitespace-nowrap">
                <RenameAcademicDialog item={r} />{" "}
                <ActionDialog
                  label="Remove"
                  destructive
                  title={`Remove ${r.name}`}
                  description={`${fmtNumber(r.members)} member${Number(r.members) === 1 ? "" : "s"} listed it. They keep their college and role, and just lose this line. To keep it on their profiles and stop offering it, hide it instead.`}
                  action={deleteAcademicItemAction}
                  args={{ kind: r.kind, id: r.id }}
                  askReason={false}
                />
              </td>
            </tr>
          ))}
        </DataTable>
        <Pager basePath="/admin/academics" page={page} total={total} params={{ kind: kind === "all" ? null : kind, q: q || null, status: status || null }} />
      </Panel>
    </>
  );
}
