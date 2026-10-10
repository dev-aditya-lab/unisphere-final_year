import { PageHeader } from "@/components/shell/page-header";
import { FilterTabs, Pager, Panel, StatusBadge, fmtDateTime } from "@/components/admin/ui";
import { ActionDialog } from "@/components/admin/action-dialog";
import { EmptyRow } from "@/components/admin/ui";
import { reviewAppealAction } from "@/lib/actions/admin";
import { listAppeals } from "@/lib/services/admin";

export const metadata = { title: "Appeals" };

const VIEWS = [
  { value: "pending", label: "Waiting" },
  { value: "upheld", label: "Upheld" },
  { value: "denied", label: "Denied" },
  { value: "all", label: "All" },
];
const ACTION = { warn: "a warning", remove_content: "content removal", restrict: "an account restriction", suspend: "an account suspension" };

export default async function AppealsPage({ searchParams }) {
  const sp = await searchParams;
  const status = VIEWS.some((v) => v.value === sp.status) ? sp.status : "pending";
  const page = Math.max(1, Number(sp.page) || 1);
  const rows = await listAppeals({ status, page });
  const total = Number(rows[0]?.total_count ?? 0);

  return (
    <>
      <PageHeader
        eyebrow="Review queues" title="Appeals"
        description="Members can challenge a moderation decision once. A different reviewer decides — you cannot decide an appeal against your own action unless you are a global administrator."
      />
      <FilterTabs label="Appeal views" basePath="/admin/appeals" current={status} options={VIEWS} />
      {rows.length === 0 ? (
        <div className="surface"><EmptyRow>No appeals here.</EmptyRow></div>
      ) : (
        <ul className="space-y-4">
          {rows.map((a) => (
            <li key={a.id}>
              <Panel
                title={`${a.full_name} (@${a.username}) appeals ${ACTION[a.action] ?? a.action}`}
                description={`${a.college_name ?? "No college"} · filed ${fmtDateTime(a.created_at)} · ${a.prior_actions} moderation action(s) on record`}
                actions={<StatusBadge value={a.status} />}
              >
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <p className="eyebrow mb-1">The decision</p>
                    <p className="text-sm"><span className="font-semibold capitalize">{a.action.replace(/_/g, " ")}</span> by {a.actor_name ?? "staff"} · {fmtDateTime(a.action_at)}</p>
                    {a.action_reason && <p className="text-muted-foreground mt-1 text-sm break-words whitespace-pre-wrap">{a.action_reason}</p>}
                    {a.snapshot?.body && (
                      <p className="bg-muted/50 mt-2 max-h-40 overflow-auto rounded-md border p-2.5 text-[13px] break-words whitespace-pre-wrap">{a.snapshot.body}</p>
                    )}
                  </div>
                  <div>
                    <p className="eyebrow mb-1">Their appeal</p>
                    <p className="text-sm break-words whitespace-pre-wrap">{a.message}</p>
                    <p className="text-muted-foreground mt-2 text-xs">Account is currently <StatusBadge value={a.user_status} /></p>
                  </div>
                </div>
                {a.status === "pending" ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <ActionDialog
                      label="Uphold appeal" title="Uphold this appeal"
                      description="The decision is reversed: restrictions are lifted or removed content is restored, and the member is told."
                      action={reviewAppealAction} args={{ id: a.id, decision: "upheld" }} reasonField="note" reasonLabel="Note to the member" variant="default"
                    />
                    <ActionDialog
                      label="Deny appeal" destructive title="Deny this appeal"
                      description="The decision stands. The member is told your note."
                      action={reviewAppealAction} args={{ id: a.id, decision: "denied" }} reasonField="note" reasonLabel="Note to the member"
                    />
                  </div>
                ) : (
                  <p className="text-muted-foreground mt-4 border-t pt-3 text-sm">
                    Decided by {a.reviewer_name ?? "staff"} on {fmtDateTime(a.reviewed_at)}.{a.review_note ? ` “${a.review_note}”` : ""}
                  </p>
                )}
              </Panel>
            </li>
          ))}
        </ul>
      )}
      <Pager basePath="/admin/appeals" page={page} total={total} params={{ status }} />
    </>
  );
}
