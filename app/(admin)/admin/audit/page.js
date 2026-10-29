import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { DataTable, EmptyRow, Pager, fmtDateTime } from "@/components/admin/ui";
import { listAudit } from "@/lib/services/admin";

export const metadata = { title: "Audit log" };

const GROUPS = [
  ["", "All activity"], ["moderation.", "Moderation decisions"], ["report.", "Reports"], ["appeal.", "Appeals"], ["role.", "Role changes"],
  ["verification.", "Verification"], ["settings.", "Settings"], ["flag.", "Feature flags"], ["announcement.", "Announcements"], ["account", "Account deletion"], ["content.purged", "Permanent deletions"], ["user.purge", "Member erasures"],
];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function summary(meta) {
  const entries = Object.entries(meta ?? {}).filter(([, v]) => v !== null && v !== undefined && v !== "");
  return entries.map(([k, v]) => `${k.replace(/_/g, " ")}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join(" · ");
}

export default async function AuditPage({ searchParams }) {
  const sp = await searchParams;
  const action = GROUPS.some(([v]) => v === sp.action) ? sp.action : "";
  const from = DATE.test(sp.from ?? "") ? sp.from : null;
  const to = DATE.test(sp.to ?? "") ? sp.to : null;
  const target = /^[0-9a-f-]{8,40}$/i.test(sp.target ?? "") ? sp.target : null;
  const page = Math.max(1, Number(sp.page) || 1);
  const { rows, total } = await listAudit({ action: action || null, from, to, target, page });
  const csv = `/api/admin/audit?${new URLSearchParams({ ...(action && { action }), ...(from && { from }), ...(to && { to }), ...(target && { target }) })}`;

  return (
    <>
      <PageHeader
        eyebrow="Insights & system" title="Audit log"
        description="An append-only record of staff actions and sensitive changes. Entries cannot be edited or deleted, even by an administrator. Secrets and message text are never stored."
        actions={<a href={csv} className="text-blue-text text-sm font-semibold hover:underline">Download CSV</a>}
      />
      <form method="get" className="surface mb-5 flex flex-wrap items-end gap-3 p-3" aria-label="Filter the audit log">
        <label className="text-[13px]">
          <span className="text-muted-foreground mb-1 block text-xs font-medium">Type</span>
          <select name="action" defaultValue={action} className="border-input bg-card h-9 rounded-md border px-2 text-sm">
            {GROUPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="text-[13px]"><span className="text-muted-foreground mb-1 block text-xs font-medium">From</span><input type="date" name="from" defaultValue={from ?? ""} className="border-input bg-card h-9 rounded-md border px-2 text-sm" /></label>
        <label className="text-[13px]"><span className="text-muted-foreground mb-1 block text-xs font-medium">To</span><input type="date" name="to" defaultValue={to ?? ""} className="border-input bg-card h-9 rounded-md border px-2 text-sm" /></label>
        <label className="text-[13px]"><span className="text-muted-foreground mb-1 block text-xs font-medium">About (record id)</span><input name="target" placeholder="Paste a record ID" defaultValue={target ?? ""} className="border-input bg-card h-9 w-64 rounded-md border px-2 font-mono text-xs" /></label>
        <Button type="submit" size="sm" variant="secondary">Filter</Button>
      </form>

      <DataTable caption="Audit log entries" columns={["When", "Who", "What", "About", "Details"]} empty={rows.length === 0 && <EmptyRow>No entries match.</EmptyRow>}>
        {rows.map((r) => (
          <tr key={r.id} className="align-top">
            <td className="text-muted-foreground px-4 py-3 whitespace-nowrap">{fmtDateTime(r.created_at)}</td>
            <td className="px-4 py-3">{r.actor?.full_name ?? <span className="text-muted-foreground">system</span>}{r.actor?.username && <span className="text-muted-foreground block text-xs">@{r.actor.username}</span>}</td>
            <td className="px-4 py-3 font-mono text-xs">{r.action}</td>
            <td className="px-4 py-3 text-xs">
              {r.target_type && <span className="capitalize">{r.target_type}</span>}
              {r.target_id && (r.target_type === "user" ? (
                <Link href={`/admin/users/${r.target_id}`} className="text-blue-text block font-mono hover:underline">{r.target_id.slice(0, 8)}…</Link>
              ) : <span className="text-muted-foreground block font-mono">{String(r.target_id).slice(0, 18)}</span>)}
            </td>
            <td className="text-muted-foreground max-w-sm px-4 py-3 text-xs break-words">{summary(r.metadata)}</td>
          </tr>
        ))}
      </DataTable>
      <Pager basePath="/admin/audit" page={page} total={total} params={{ action, from, to, target }} />
    </>
  );
}
