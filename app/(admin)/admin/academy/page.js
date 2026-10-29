import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Panel, StatCard, fmtNumber } from "@/components/admin/ui";
import { TimeSeriesChart } from "@/components/admin/charts";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/academy/money";
import { describePaymentsStatus, paymentsStatus } from "@/lib/payments/gateway";
import { getAcademySettings } from "@/lib/services/academy";
import { needAcademy } from "@/lib/services/academy-admin";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Academy" };

const PERMS = ["academy.courses.manage", "academy.finance.view", "academy.students.view", "academy.assignments.review", "academy.analytics.view", "academy.certificates.issue", "academy.coupons.manage", "academy.live.manage", "academy.announce", "academy.templates.manage"];

export default async function AcademyOverview({ searchParams }) {
  const held = await needAcademy(...PERMS);
  const sp = await searchParams;
  const days = [7, 30, 90, 365].includes(Number(sp.days)) ? Number(sp.days) : 30;
  const supabase = await createClient();
  const [{ data: o }, settings, templates, mentors] = await Promise.all([
    supabase.rpc("academy_admin_overview", { p_days: days }),
    getAcademySettings(),
    held["academy.templates.manage"] || held["academy.certificates.issue"] ? supabase.from("academy_cert_template_versions").select("id", { count: "exact", head: true }).eq("status", "active") : { count: null },
    supabase.from("academy_mentors").select("user_id", { count: "exact", head: true }).eq("active", true),
  ]);
  const m = o ?? {};
  const gateway = paymentsStatus();
  const gw = describePaymentsStatus(gateway);
  const fin = held["academy.finance.view"];
  const checklist = [
    ["A payment gateway is connected", Boolean(gateway.configured), "Set PAYMENT_GATEWAY and its keys (docs/PAYMENTS.md)."],
    ["Paid enrolment is switched on", settings.salesEnabled, "Academy settings, Sales."],
    ["A certificate template is active", (templates.count ?? 0) > 0, "Certificate templates."],
    ["At least one mentor is added", (mentors.count ?? 0) > 0, "Mentors."],
    ["A support email is set", Boolean(settings.supportEmail), "Academy settings."],
  ];

  return (
    <>
      <PageHeader eyebrow="Academy" title="Overview" description="Counted from real records. Money figures need the finance permission; gross is what was collected, not profit." />
      <nav aria-label="Period" className="mb-4 flex gap-1.5">
        {[7, 30, 90, 365].map((d) => (
          <Link key={d} href={`/admin/academy?days=${d}`} aria-current={d === days ? "page" : undefined} className={`rounded-md border px-3 py-1.5 text-[13px] font-medium ${d === days ? "bg-accent border-transparent" : "text-muted-foreground hover:bg-muted"}`}>{d === 365 ? "1 year" : `${d} days`}</Link>
        ))}
      </nav>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Published courses" value={fmtNumber(m.published_courses)} hint={`${fmtNumber(m.draft_courses)} drafts`} href="/admin/academy/courses" />
        <StatCard label="Active enrolments" value={fmtNumber(m.active_enrollments)} hint={`${fmtNumber(m.new_enrollments)} new in ${days} days`} href="/admin/academy/students" />
        <StatCard label="Completion rate" value={m.completion_rate_pct == null ? "—" : `${m.completion_rate_pct}%`} hint={`${fmtNumber(m.completions)} completed in ${days} days`} />
        <StatCard label="To grade" value={fmtNumber(m.review_backlog)} hint="Submissions waiting" href="/admin/academy/assignments" tone="warn" />
        <StatCard label="Certificates issued" value={fmtNumber(m.certificates_issued)} hint={`${fmtNumber(m.certificates_revoked)} revoked`} href="/admin/academy/certificates" />
        <StatCard label="Failed certificates" value={fmtNumber(m.certificates_failed)} hint="Generation to retry" href="/admin/academy/certificates?status=failed" tone="warn" />
        <StatCard label="Upcoming live classes" value={fmtNumber(m.upcoming_sessions)} href="/admin/academy/live" />
        <StatCard label="Coupon redemptions" value={fmtNumber(m.coupon_redemptions)} hint={`in ${days} days`} href="/admin/academy/pricing" />
        {fin && (
          <>
            <StatCard label="Gross collected" value={formatMoney(m.gross_minor, { withZero: true })} hint={`all time ${formatMoney(m.gross_all_minor, { withZero: true })}`} />
            <StatCard label="Refunded" value={formatMoney(m.refunded_minor, { withZero: true })} hint={`all time ${formatMoney(m.refunded_all_minor, { withZero: true })}`} />
            <StatCard label="Net (gross − refunds)" value={formatMoney(Number(m.gross_minor ?? 0) - Number(m.refunded_minor ?? 0), { withZero: true })} hint="Before gateway fees" />
            <StatCard label="Refunds open" value={fmtNumber(m.open_refunds)} href="/admin/academy/orders" tone="warn" hint={`${fmtNumber(m.pending_orders)} unpaid orders held`} />
          </>
        )}
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <TimeSeriesChart title="New enrolments per day" series={(m.enrollment_series ?? []).map((p) => ({ day: p.day, value: Number(p.value) }))} />
        {fin && <TimeSeriesChart title="Collected per day (₹)" series={(m.revenue_series ?? []).map((p) => ({ day: p.day, value: Number(p.value) / 100 }))} color="var(--chart-2)" />}
      </div>

      <Panel title="Before you open for business" description="What is still needed for paid enrolment to work end to end.">
        <ul className="space-y-2 text-sm">
          {checklist.map(([label, ok, where]) => (
            <li key={label} className="flex flex-wrap items-center gap-2"><Badge variant={ok ? "success" : "warning"}>{ok ? "done" : "to do"}</Badge><span>{label}</span>{!ok && <span className="text-muted-foreground text-xs">{where}</span>}</li>
          ))}
        </ul>
        {(gw.blocking || gw.warning) && <p className="bg-muted mt-4 rounded-md px-3 py-2 text-sm">{gw.blocking ?? gw.warning}</p>}
      </Panel>
    </>
  );
}
