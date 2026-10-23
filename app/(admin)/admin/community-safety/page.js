import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionDialog } from "@/components/admin/action-dialog";
import { TimeSeriesChart } from "@/components/admin/charts";
import { DataTable, EmptyRow, FilterTabs, Panel, StatCard, StatusBadge, fmtDate, fmtDateTime, fmtNumber } from "@/components/admin/ui";
import { PageHeader } from "@/components/shell/page-header";
import { ChatMarkdown } from "@/components/posts/chat-markdown";
import { adminResolveCommunityReportAction, adminReviewCommunityAppealAction } from "@/lib/actions/community-workspace";
import { hasPermission } from "@/lib/auth/session";
import { MOD_ACTION_LABEL, reportCategoryLabel } from "@/lib/community/rules";
import * as ws from "@/lib/services/community-workspace";

export const metadata = { title: "Community safety" };

const VIEWS = [
  { value: "communities", label: "Communities" },
  { value: "reports", label: "Escalated reports" },
  { value: "appeals", label: "Escalated appeals" },
  { value: "trends", label: "Abuse & spam trends" },
  { value: "health", label: "Storage & delivery" },
];

/**
 * Platform view of community workspaces. Least privilege on purpose: staff see how communities are structured, who runs them, what
 * has been escalated to the platform team (with the evidence copy attached to that report), real counts, and what is stuck. They do
 * not get a way to read private channels; message text reaches this page only as the snapshot on a report someone escalated.
 * Every figure and every list comes from a database function that checks the staff permission itself.
 */
export default async function CommunitySafetyPage({ searchParams }) {
  const sp = await searchParams;
  const view = VIEWS.some((v) => v.value === sp.view) ? sp.view : "communities";
  const [canManage, canReports, canAppeals, canInsights] = await Promise.all([
    hasPermission("communities.manage"), hasPermission("reports.view"), hasPermission("appeals.review"), hasPermission("analytics.view"),
  ]);
  const allowed = { communities: canManage, reports: canReports, appeals: canAppeals, trends: canInsights, health: canInsights };
  const options = VIEWS.filter((v) => allowed[v.value]);
  if (options.length === 0) notFound();
  const current = options.some((o) => o.value === view) ? view : options[0].value;

  let body;
  if (current === "communities") {
    const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 60) : "";
    const offset = Math.max(0, Number(sp.offset) || 0);
    const res = await ws.adminOverview({ query: q, offset });
    const rows = res.ok ? res.data ?? [] : [];
    body = (
      <>
        <form method="get" action="/admin/community-safety" role="search" className="mb-4 flex gap-2">
          <input type="hidden" name="view" value="communities" />
          <label htmlFor="cs-q" className="sr-only">Search communities</label>
          <input id="cs-q" name="q" defaultValue={q} placeholder="Search by name" maxLength={60} className="border-input bg-card focus-visible:border-ring focus-visible:ring-ring/40 h-9 min-w-48 flex-1 rounded-md border px-3 text-sm outline-none focus-visible:ring-[3px]" />
          <button className="bg-primary text-primary-foreground rounded-md px-4 text-sm font-semibold">Search</button>
        </form>
        {!res.ok && <p role="alert" className="text-destructive-text mb-3 text-sm">{res.error}</p>}
        <DataTable
          caption="Communities"
          columns={["Community", "Owner", "Members", "Channels", "Messages (7 days)", "Open reports", "Banned", "Created"]}
          empty={rows.length === 0 ? <EmptyRow>No communities found.</EmptyRow> : null}
        >
          {rows.map((c) => (
            <tr key={c.id}>
              <td className="px-4 py-2.5">
                <Link href={`/admin/community-safety/${c.id}`} className="font-medium hover:underline">{c.name}</Link>
                <span className="text-muted-foreground block text-xs">{c.visibility} · {c.join_policy}{c.is_official ? " · official" : ""}{c.deleted_at ? " · removed" : ""}</span>
              </td>
              <td className="px-4 py-2.5">{c.owner_name ?? "—"}</td>
              <td className="px-4 py-2.5 tabular-nums">{fmtNumber(c.member_count)}</td>
              <td className="px-4 py-2.5 tabular-nums">{fmtNumber(c.channels)}</td>
              <td className="px-4 py-2.5 tabular-nums">{fmtNumber(c.messages_7d)}</td>
              <td className="px-4 py-2.5 tabular-nums">{Number(c.open_reports) > 0 ? <StatusBadge value="open" className="mr-1" /> : null}{fmtNumber(c.open_reports)}</td>
              <td className="px-4 py-2.5 tabular-nums">{fmtNumber(c.banned)}</td>
              <td className="px-4 py-2.5 whitespace-nowrap">{fmtDate(c.created_at)}</td>
            </tr>
          ))}
        </DataTable>
        <nav aria-label="Pagination" className="mt-4 flex justify-between text-sm">
          {offset > 0 ? <Link className="hover:bg-muted rounded-md border px-3 py-1.5" href={`/admin/community-safety?view=communities&q=${encodeURIComponent(q)}&offset=${Math.max(0, offset - 30)}`}>Previous</Link> : <span />}
          {rows.length === 30 && <Link className="hover:bg-muted rounded-md border px-3 py-1.5" href={`/admin/community-safety?view=communities&q=${encodeURIComponent(q)}&offset=${offset + 30}`}>Next</Link>}
        </nav>
      </>
    );
  } else if (current === "reports") {
    const status = ["open", "action_taken", "dismissed"].includes(sp.status) ? sp.status : "open";
    const res = await ws.adminEscalatedReports(status);
    const rows = res.ok ? res.data ?? [] : [];
    body = (
      <>
        <FilterTabs label="Report views" basePath="/admin/community-safety" extra={{ view: "reports" }} current={status} options={[{ value: "open", label: "Waiting" }, { value: "action_taken", label: "Action taken" }, { value: "dismissed", label: "Dismissed" }]} />
        <p className="text-muted-foreground mb-3 text-xs">Only reports a community&rsquo;s own moderators passed on, or that concern a community&rsquo;s owner, appear here. The reported text is the copy kept with the report; it is erased after the retention period.</p>
        {rows.length === 0 ? <div className="surface"><EmptyRow>No escalated reports here.</EmptyRow></div> : (
          <ul className="space-y-4">
            {rows.map((r) => (
              <li key={r.id}>
                <Panel title={`${reportCategoryLabel(r.category)} · ${r.community_name}`} description={`${r.target_type === "member" ? "A member" : "A message"}${r.target_name ? ` by ${r.target_name}` : ""} · reported ${fmtDateTime(r.created_at)} · escalated ${fmtDateTime(r.escalated_at)}`} actions={<span className="flex gap-1.5"><StatusBadge value={r.severity} /><StatusBadge value={r.status} /></span>}>
                  {r.details && <p className="bg-muted/50 mb-3 rounded-md border p-2.5 text-sm">{r.details}</p>}
                  {r.snapshot?.body ? <div className="bg-muted/50 rounded-md border p-2.5"><p className="eyebrow mb-1">Reported message</p><ChatMarkdown text={r.snapshot.body} /></div> : <p className="text-muted-foreground text-sm">No text kept for this report.</p>}
                  {r.resolution && <p className="mt-3 text-sm"><span className="text-muted-foreground">Outcome: </span>{r.resolution}</p>}
                  {["open", "reviewing"].includes(r.status) && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {r.target_type === "channel_message" && <ActionDialog label="Remove message" destructive title="Remove the reported message" description="The text and files are erased, the author is told and may appeal, and the report is closed as action taken." action={adminResolveCommunityReportAction} args={{ reportId: r.id, status: "action_taken", removeMessage: true }} reasonField="resolution" reasonLabel="Reason (the author will see this)" />}
                      <ActionDialog label="Close: action taken elsewhere" title="Close this report" description="Record what was done. The reporter is told it was reviewed." action={adminResolveCommunityReportAction} args={{ reportId: r.id, status: "action_taken" }} reasonField="resolution" reasonLabel="What was done" />
                      <ActionDialog label="Dismiss" title="Dismiss this report" description="No violation was found. The reporter is told it was reviewed." action={adminResolveCommunityReportAction} args={{ reportId: r.id, status: "dismissed" }} reasonField="resolution" reasonLabel="Why" />
                    </div>
                  )}
                </Panel>
              </li>
            ))}
          </ul>
        )}
      </>
    );
  } else if (current === "appeals") {
    const res = await ws.adminEscalatedAppeals();
    const rows = res.ok ? res.data ?? [] : [];
    body = rows.length === 0 ? <div className="surface"><EmptyRow>No appeals have been passed to the platform team.</EmptyRow></div> : (
      <ul className="space-y-4">
        {rows.map((a) => (
          <li key={a.id}>
            <Panel title={`${a.user_name ?? "A member"} appeals in ${a.community_name}`} description={`${MOD_ACTION_LABEL[a.action] ?? a.action} · filed ${fmtDateTime(a.created_at)}`} actions={<StatusBadge value={a.status} />}>
              {a.reason && <p className="text-muted-foreground mb-2 text-xs">The reason given was: “{a.reason}”</p>}
              <p className="bg-muted/50 rounded-md border p-2.5 text-sm break-words whitespace-pre-wrap">{a.message}</p>
              {a.status === "pending" && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <ActionDialog label="Uphold appeal" variant="default" title="Uphold this appeal" description="The decision is reversed (a ban is lifted, a timeout ends) and the member is told." action={adminReviewCommunityAppealAction} args={{ appealId: a.id, decision: "upheld" }} reasonField="note" reasonLabel="Note to the member" reasonRequired={false} />
                  <ActionDialog label="Deny appeal" destructive title="Deny this appeal" description="The decision stands. The member is told your note." action={adminReviewCommunityAppealAction} args={{ appealId: a.id, decision: "denied" }} reasonField="note" reasonLabel="Note to the member" />
                </div>
              )}
            </Panel>
          </li>
        ))}
      </ul>
    );
  } else if (current === "trends") {
    const res = await ws.adminTrends(30);
    const rows = res.ok ? res.data ?? [] : [];
    const series = (key) => rows.map((r) => ({ day: r.day, value: Number(r[key]) }));
    body = (
      <div className="space-y-4">
        {!res.ok && <p role="alert" className="text-destructive-text text-sm">{res.error}</p>}
        <p className="text-muted-foreground text-xs">Counts per day for the last 30 days, taken from the database as they are. Messages are counted, never read.</p>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TimeSeriesChart title="Messages posted" series={series("messages")} />
          <TimeSeriesChart title="Reports filed" series={series("reports")} color="var(--chart-2)" />
          <TimeSeriesChart title="Messages removed by moderators" series={series("removed")} color="var(--chart-3)" />
          <TimeSeriesChart title="Timeouts and bans" series={rows.map((r) => ({ day: r.day, value: Number(r.timeouts) + Number(r.bans) }))} color="var(--chart-4)" />
        </div>
      </div>
    );
  } else {
    const res = await ws.adminHealth();
    const h = res.ok ? res.data ?? {} : {};
    body = (
      <div className="space-y-4">
        {!res.ok && <p role="alert" className="text-destructive-text text-sm">{res.error}</p>}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Uploads stuck" value={fmtNumber(h.uploads_stuck)} hint="Started over an hour ago, never finished" tone="warn" />
          <StatCard label="Files awaiting removal" value={fmtNumber(h.files_awaiting_removal)} hint="Deleted messages; the worker removes the stored object" tone="warn" />
          <StatCard label="Unattached files" value={fmtNumber(h.unattached_message_files)} hint="Uploaded, never sent (cleaned after 24 h)" />
          <StatCard label="Announcements waiting" value={fmtNumber(h.announcements_pending)} hint={`Oldest ${fmtNumber(h.announcements_oldest_pending_minutes)} min. The worker sends them`} tone="warn" />
          <StatCard label="Email failures (7 days)" value={fmtNumber(h.email_failed)} tone="warn" />
          <StatCard label="Push devices failing" value={fmtNumber(h.push_devices_failing)} hint="3 or more failed deliveries" tone="warn" />
          <StatCard label="Open community reports" value={fmtNumber(h.open_reports)} hint={`${fmtNumber(h.escalated_open)} escalated`} />
          <StatCard label="Appeals waiting" value={fmtNumber(h.appeals_pending)} />
        </div>
        <p className="text-muted-foreground text-xs">If announcements stay waiting, the background worker is not running (see docs/DEPLOYMENT.md). Stuck uploads usually mean the storage credentials are wrong or the bucket is unreachable.</p>
      </div>
    );
  }

  return (
    <>
      <PageHeader eyebrow="Review queues" title="Community safety" description="Structure, escalations, trends and health of community channels. Private channel text is not available here." />
      <FilterTabs label="Community safety views" basePath="/admin/community-safety" param="view" current={current} options={options} />
      {body}
    </>
  );
}
