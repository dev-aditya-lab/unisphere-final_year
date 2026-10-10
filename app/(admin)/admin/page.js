import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Panel, StatCard, fmtNumber } from "@/components/admin/ui";
import { TimeSeriesChart } from "@/components/admin/charts";
import { RangeFilter } from "@/components/admin/range-filter";
import { getMyPermissions } from "@/lib/auth/session";
import { getScope } from "@/lib/admin/scope";
import { parseRange } from "@/lib/admin/range";
import { getOverview, getSeries } from "@/lib/services/admin";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Overview" };

const QUEUES = [
  { perm: "reports.view", label: "Open reports", href: "/admin/reports", rpc: ["list_reports", { p_status: "open", p_limit: 1 }], count: (d) => Number(d?.[0]?.total_count ?? 0) },
  { perm: "appeals.review", label: "Appeals to review", href: "/admin/appeals", rpc: ["list_appeals", { p_status: "pending", p_limit: 1 }], count: (d) => Number(d?.[0]?.total_count ?? 0) },
  { perm: "verification.review", label: "Verification requests", href: "/admin/verification", rpc: ["list_verification_requests", { p_status: "pending", p_limit: 200 }], count: (d) => d?.length ?? 0 },
  { perm: "users.delete", label: "Deletion requests", href: "/admin/deletions", rpc: ["admin_list_deletions", { p_status: "pending" }], count: (d) => d?.length ?? 0 },
];

export default async function AdminOverviewPage({ searchParams }) {
  const sp = await searchParams;
  const names = new Set((await getMyPermissions()).map((p) => p.permission));
  const supabase = await createClient();

  const queues = await Promise.all(
    QUEUES.filter((q) => names.has(q.perm)).map(async (q) => {
      const { data } = await supabase.rpc(q.rpc[0], q.rpc[1]);
      return { ...q, value: q.count(data) };
    }),
  );

  const scope = names.has("analytics.view") ? await getScope("analytics.view", sp.college) : null;
  const range = parseRange(sp);
  let overview = null;
  let series = null;
  if (scope) {
    [overview, series] = await Promise.all([
      getOverview({ college: scope.college, from: range.from, to: range.to }),
      getSeries(["members", "posts", "reports"], { college: scope.college, from: range.from, to: range.to }),
    ]);
  }

  return (
    <>
      <PageHeader eyebrow="Admin console" title="Overview" description={scope ? "What needs attention, and how the community is doing." : "What needs your attention."} />

      {queues.length > 0 && (
        <section aria-label="Waiting for review" className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {queues.map((q) => (
            <StatCard key={q.href} label={q.label} value={fmtNumber(q.value)} href={q.href} tone="warn" hint={q.value === 0 ? "All clear" : "Open the queue"} />
          ))}
        </section>
      )}

      {scope ? (
        <>
          <RangeFilter basePath="/admin" range={range} scope={scope} />
          <section aria-label="Key numbers" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Members" value={fmtNumber(overview.members)} hint={`+${fmtNumber(overview.new_members)} in period`} />
            <StatCard label="Active contributors" value={fmtNumber(overview.active_members)} hint="Posted, commented or messaged" />
            <StatCard label="Verified" value={fmtNumber(overview.verified_members)} hint={overview.members ? `${Math.round((overview.verified_members / overview.members) * 100)}% of members` : "—"} />
            <StatCard label="Posts" value={fmtNumber(overview.posts_period)} hint={`${fmtNumber(overview.posts_total)} all-time`} />
            <StatCard label="Comments" value={fmtNumber(overview.comments_period)} />
            <StatCard label="Messages sent" value={fmtNumber(overview.messages_period)} hint="Counts only; content is never read" />
            <StatCard label="Reports filed" value={fmtNumber(overview.reports_period)} hint={`${fmtNumber(overview.reports_resolved_period)} resolved`} />
            <StatCard label="Restricted / suspended" value={fmtNumber(overview.suspended_members)} />
          </section>
          <div className="grid gap-4 lg:grid-cols-2">
            <TimeSeriesChart title="New members per day" series={series.members} />
            <TimeSeriesChart title="Posts per day" series={series.posts} color="var(--chart-2)" />
          </div>
          <p className="mt-4 text-sm">
            <Link href={`/admin/analytics?from=${range.from}&to=${range.to}${scope.college ? `&college=${scope.college}` : ""}`} className="text-primary inline-flex items-center gap-1 font-semibold hover:underline">
              Full analytics <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </p>
        </>
      ) : (
        <Panel title="Your tools" description="Use the menu to open the queues and tools your role covers." />
      )}
    </>
  );
}
