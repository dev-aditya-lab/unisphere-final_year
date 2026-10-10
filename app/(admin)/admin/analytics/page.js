import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { Panel, StatCard, fmtNumber } from "@/components/admin/ui";
import { BreakdownBars, TimeSeriesChart } from "@/components/admin/charts";
import { RangeFilter } from "@/components/admin/range-filter";
import { getScope } from "@/lib/admin/scope";
import { parseRange, previousRange } from "@/lib/admin/range";
import { getOverview, getSeries } from "@/lib/services/admin";

export const metadata = { title: "Analytics" };

const CATEGORY_LABELS = { projects: "Projects", ideas: "Ideas", questions: "Questions", achievements: "Achievements", resources: "Resources", opportunities: "Opportunities", events: "Events", general: "General" };

function delta(now, before) {
  if (!before) return now ? "new activity" : "no change";
  const pct = Math.round(((now - before) / before) * 100);
  return `${pct >= 0 ? "+" : ""}${pct}% vs previous period`;
}

export default async function AnalyticsPage({ searchParams }) {
  const sp = await searchParams;
  const scope = await getScope("analytics.view", sp.college);
  if (!scope) redirect("/forbidden");
  const range = parseRange(sp);
  const prev = previousRange(range);
  const args = { college: scope.college, from: range.from, to: range.to };

  const [o, before, series] = await Promise.all([
    getOverview(args),
    getOverview({ college: scope.college, from: prev.from, to: prev.to }),
    getSeries(["members", "posts", "comments", "messages", "projects", "events", "reports"], args),
  ]);
  const csv = `/api/admin/analytics?from=${range.from}&to=${range.to}${scope.college ? `&college=${scope.college}` : ""}`;

  return (
    <>
      <PageHeader
        eyebrow="Insights & system" title="Analytics"
        description={`${range.from} to ${range.to} (UTC days)${scope.college ? ` · ${scope.options.find((c) => c.id === scope.college)?.name}` : " · all colleges"}. Counts only — message and post content is never used here.`}
        actions={<a href={csv} className="text-primary text-sm font-semibold hover:underline">Download CSV</a>}
      />
      <RangeFilter basePath="/admin/analytics" range={range} scope={scope} />

      <section aria-label="Headline numbers" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Members" value={fmtNumber(o.members)} hint={`${fmtNumber(o.new_members)} new · ${delta(o.new_members, before.new_members)}`} />
        <StatCard label="Active contributors" value={fmtNumber(o.active_members)} hint={delta(o.active_members, before.active_members)} />
        <StatCard label="Posts" value={fmtNumber(o.posts_period)} hint={delta(o.posts_period, before.posts_period)} />
        <StatCard label="Comments" value={fmtNumber(o.comments_period)} hint={delta(o.comments_period, before.comments_period)} />
        <StatCard label="Messages" value={fmtNumber(o.messages_period)} hint={delta(o.messages_period, before.messages_period)} />
        <StatCard label="New connections" value={fmtNumber(o.connections_period)} hint={delta(o.connections_period, before.connections_period)} />
        <StatCard label="Projects started" value={fmtNumber(o.projects_period)} hint={`${fmtNumber(o.projects_total)} in total`} />
        <StatCard label="Events created" value={fmtNumber(o.events_period)} hint={`${fmtNumber(o.events_upcoming)} upcoming`} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <TimeSeriesChart title="New members" series={series.members} />
        <TimeSeriesChart title="Posts" series={series.posts} color="var(--chart-2)" />
        <TimeSeriesChart title="Comments" series={series.comments} color="var(--chart-3)" />
        <TimeSeriesChart title="Messages" series={series.messages} color="var(--chart-5)" />
        <TimeSeriesChart title="Projects started" series={series.projects} />
        <TimeSeriesChart title="Reports filed" series={series.reports} color="var(--chart-4)" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <BreakdownBars title="Posts by category" data={o.posts_by_category} labels={CATEGORY_LABELS} />
        <BreakdownBars title="Members by account type" data={o.members_by_type} color="var(--chart-2)" />
        <BreakdownBars title="Reports by reason" data={o.reports_by_category} color="var(--chart-4)" />
      </div>

      {scope.global && !scope.college && o.top_colleges?.length > 0 && (
        <Panel title="Largest colleges" className="mt-6">
          <ol className="divide-y text-sm">
            {o.top_colleges.map((c) => (
              <li key={c.name} className="flex justify-between py-2"><span>{c.name}</span><span className="text-muted-foreground tabular-nums">{fmtNumber(c.members)} members</span></li>
            ))}
          </ol>
        </Panel>
      )}

      <Panel title="Trust & safety" className="mt-6">
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div><dt className="eyebrow">Open reports</dt><dd className="font-heading text-2xl font-bold">{fmtNumber(o.reports_open)}</dd></div>
          <div><dt className="eyebrow">Resolved in period</dt><dd className="font-heading text-2xl font-bold">{fmtNumber(o.reports_resolved_period)}</dd></div>
          <div><dt className="eyebrow">Appeals waiting</dt><dd className="font-heading text-2xl font-bold">{fmtNumber(o.appeals_pending)}</dd></div>
          <div><dt className="eyebrow">Restricted or suspended</dt><dd className="font-heading text-2xl font-bold">{fmtNumber(o.suspended_members)}</dd></div>
        </dl>
      </Panel>
    </>
  );
}
