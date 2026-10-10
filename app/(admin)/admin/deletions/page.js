import { PageHeader } from "@/components/shell/page-header";
import { DataTable, EmptyRow, FilterTabs, StatusBadge, fmtDateTime } from "@/components/admin/ui";
import { ActionDialog } from "@/components/admin/action-dialog";
import { reviewDeletionAction } from "@/lib/actions/admin";
import { listDeletions } from "@/lib/services/admin";

export const metadata = { title: "Account deletion" };

const VIEWS = [
  { value: "pending", label: "Waiting" },
  { value: "processing", label: "Being erased" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" },
];

export default async function DeletionsPage({ searchParams }) {
  const sp = await searchParams;
  const status = VIEWS.some((v) => v.value === sp.status) ? sp.status : "pending";
  const rows = await listDeletions(status);

  return (
    <>
      <PageHeader
        eyebrow="Review queues" title="Account deletion"
        description="Members can ask to delete their account. It is erased automatically after a 14-day grace period unless they cancel; approving here erases it immediately, and rejecting keeps it. Erasure is permanent."
      />
      <FilterTabs label="Deletion views" basePath="/admin/deletions" current={status} options={VIEWS} />
      <DataTable caption="Account deletion requests" columns={["Member", "Reason", "Requested", "Erased on", "Status", ""]} empty={rows.length === 0 && <EmptyRow>No requests.</EmptyRow>}>
        {rows.map((r) => (
          <tr key={r.id} className="align-top">
            <td className="px-4 py-3"><p className="font-medium">{r.full_name}</p><p className="text-muted-foreground text-xs">@{r.username} · {r.email}</p></td>
            <td className="text-muted-foreground max-w-xs px-4 py-3 break-words">{r.reason ?? "—"}</td>
            <td className="text-muted-foreground px-4 py-3 whitespace-nowrap">{fmtDateTime(r.requested_at)}</td>
            <td className="px-4 py-3 whitespace-nowrap">{fmtDateTime(r.scheduled_for)}{r.due && <span className="text-warning-text block text-xs">due now</span>}</td>
            <td className="px-4 py-3"><StatusBadge value={r.status} /></td>
            <td className="px-4 py-3 text-right whitespace-nowrap">
              {r.status === "pending" && (
                <div className="flex justify-end gap-2">
                  <ActionDialog
                    label="Erase now" destructive askReason={false} title={`Permanently erase ${r.full_name}'s account?`}
                    description="Their profile, posts, comments, projects, connections and uploaded files are deleted. This cannot be undone."
                    action={reviewDeletionAction} args={{ id: r.id, decision: "approve" }} confirmLabel="Erase permanently"
                  />
                  <ActionDialog
                    label="Reject" askReason={false} title="Reject this request?"
                    description="The account stays. The member can ask again later."
                    action={reviewDeletionAction} args={{ id: r.id, decision: "reject" }} confirmLabel="Reject request"
                  />
                </div>
              )}
            </td>
          </tr>
        ))}
      </DataTable>
    </>
  );
}
