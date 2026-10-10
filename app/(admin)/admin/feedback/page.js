import { PageHeader } from "@/components/shell/page-header";
import { EmptyRow, FilterTabs, Pager, Panel, StatusBadge, fmtDateTime } from "@/components/admin/ui";
import { TriageDialog } from "@/components/admin/triage-dialog";
import { Badge } from "@/components/ui/badge";
import { FEEDBACK_KINDS, FEEDBACK_STATUS, areaLabel } from "@/lib/feedback-meta";
import { adminListFeedback, adminListReleases } from "@/lib/services/feedback";

export const metadata = { title: "Feedback" };

const KINDS = [{ value: "all", label: "Everything" }, ...FEEDBACK_KINDS.map((k) => ({ value: k.value, label: `${k.short}s` }))];
const STATUSES = [{ value: "open", label: "Open" }, { value: "new", label: "New" }, { value: "shipped", label: "Shipped" }, { value: "declined", label: "Not planned" }, { value: "all", label: "All" }];

export default async function AdminFeedbackPage({ searchParams }) {
  const sp = await searchParams;
  const kind = KINDS.some((k) => k.value === sp.kind) ? sp.kind : "all";
  const status = STATUSES.some((s) => s.value === sp.status) ? sp.status : "open";
  const q = (sp.q ?? "").toString().trim().slice(0, 80) || null;
  const page = Math.max(1, Number(sp.page) || 1);
  const [rows, releases] = await Promise.all([
    adminListFeedback({ kind: kind === "all" ? null : kind, status: status === "all" ? null : status, q, page }),
    adminListReleases(),
  ]);
  const total = Number(rows[0]?.total_count ?? 0);

  return (
    <>
      <PageHeader eyebrow="Product" title="Feedback" description="Bug reports, ideas and feedback from members. Bugs are listed by severity. Replying or changing a status notifies the member; ideas show on the public roadmap once planned." />
      <FilterTabs label="Kind" basePath="/admin/feedback" param="kind" current={kind} options={KINDS} extra={{ status, q }} />
      <FilterTabs label="Status" basePath="/admin/feedback" param="status" current={status} options={STATUSES} extra={{ kind, q }} />
      <form method="get" role="search" className="mb-4 flex gap-2">
        <input type="hidden" name="kind" value={kind} /><input type="hidden" name="status" value={status} />
        <input name="q" defaultValue={q ?? ""} aria-label="Search feedback" placeholder="Search title or text" className="border-input bg-card h-9 w-full max-w-xs rounded-md border px-3 text-sm" />
        <button className="border-input hover:bg-muted h-9 rounded-md border px-3 text-sm">Search</button>
      </form>
      {rows.length === 0 ? (
        <div className="surface"><EmptyRow>Nothing here.</EmptyRow></div>
      ) : (
        <ul className="space-y-3">
          {rows.map((f) => (
            <li key={f.id}>
              <Panel
                title={f.title}
                description={`${f.full_name ?? "Removed member"}${f.username ? ` (@${f.username})` : ""} · ${f.college_name ?? "no college"} · ${areaLabel(f.area)} · ${fmtDateTime(f.created_at)}`}
                actions={
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline">{FEEDBACK_KINDS.find((k) => k.value === f.kind)?.short}</Badge>
                    {f.severity && <StatusBadge value={f.severity} />}
                    <Badge variant={FEEDBACK_STATUS[f.status]?.tone ?? "mono"}>{FEEDBACK_STATUS[f.status]?.label}</Badge>
                    {f.kind === "feature" && <Badge variant="soft">{f.vote_count} vote{f.vote_count === 1 ? "" : "s"}</Badge>}
                  </span>
                }
              >
                <p className="text-sm break-words whitespace-pre-wrap">{f.body}</p>
                {f.context && Object.keys(f.context).length > 0 && (
                  <p className="text-muted-foreground mt-2 text-xs break-words">
                    {[f.context.path && `page ${f.context.path}`, f.context.app_version && `v${f.context.app_version}`, f.context.viewport && `screen ${f.context.viewport}`, f.context.standalone && "installed app", f.context.user_agent].filter(Boolean).join(" · ")}
                  </p>
                )}
                {f.public_response && <p className="bg-accent/50 mt-2 rounded-md px-3 py-2 text-[13px]"><strong>Reply:</strong> {f.public_response}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <TriageDialog item={f} releases={releases.filter((r) => r.published_at)} />
                  <span className="text-muted-foreground font-mono text-[11px] select-all">{f.id}</span>
                </div>
              </Panel>
            </li>
          ))}
        </ul>
      )}
      <Pager basePath="/admin/feedback" page={page} total={total} params={{ kind, status, q }} />
    </>
  );
}
