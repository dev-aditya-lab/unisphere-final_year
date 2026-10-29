import { PageHeader } from "@/components/shell/page-header";
import { DataTable, EmptyRow, Panel, StatusBadge, fmtNumber } from "@/components/admin/ui";
import { formatMoney } from "@/lib/academy/money";
import { categoriesAll, needAcademy, rows } from "@/lib/services/academy-admin";
import { can } from "@/lib/services/academy-admin";

export const metadata = { title: "Academy reports" };

const input = "border-input bg-card h-9 rounded-md border px-3 text-sm";

export default async function Reports({ searchParams }) {
  await needAcademy("academy.analytics.view", "academy.finance.view");
  const sp = await searchParams;
  const finance = await can("academy.finance.view");
  const coupons = await can("academy.coupons.manage");
  const from = sp.from && !Number.isNaN(Date.parse(sp.from)) ? new Date(sp.from).toISOString() : null;
  const to = sp.to && !Number.isNaN(Date.parse(sp.to)) ? new Date(Date.parse(sp.to) + 86_400_000).toISOString() : null;
  const category = typeof sp.category === "string" && /^[0-9a-f-]{36}$/.test(sp.category) ? sp.category : null;
  const [courses, categories, couponStats] = await Promise.all([
    rows("academy_admin_course_report", { p_from: from, p_to: to, p_category: category }),
    categoriesAll(),
    finance || coupons ? rows("academy_admin_coupon_report") : [],
  ]);

  return (
    <>
      <PageHeader eyebrow="Academy" title="Reports" description="Every figure is counted from stored records. Completion rate = enrolments that reached completion ÷ enrolments in the period. Average score = mean percentage of graded assignments. Gross = payments received; net = gross − completed refunds, before gateway fees." />
      <form method="get" className="mb-5 flex flex-wrap items-end gap-2">
        <div><label htmlFor="r-f" className="text-xs font-semibold">From</label><input id="r-f" type="date" name="from" defaultValue={sp.from ?? ""} className={`${input} mt-1 block`} /></div>
        <div><label htmlFor="r-t" className="text-xs font-semibold">To</label><input id="r-t" type="date" name="to" defaultValue={sp.to ?? ""} className={`${input} mt-1 block`} /></div>
        <div><label htmlFor="r-c" className="text-xs font-semibold">Subject</label><select id="r-c" name="category" defaultValue={category ?? ""} className={`${input} mt-1 block`}><option value="">All</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <button type="submit" className="bg-primary text-primary-foreground h-9 rounded-md px-4 text-sm font-semibold">Apply</button>
      </form>
      <DataTable caption="Course performance" columns={["Course", "Status", "Enrolments", "Completed", "Completion", "Avg score", "Certificates", ...(finance ? ["Gross", "Refunded", "Net"] : [])]} empty={courses.length === 0 && <EmptyRow>No courses.</EmptyRow>}>
        {courses.map((c) => (
          <tr key={c.course_id}>
            <td className="px-4 py-3"><span className="font-mono text-xs">{c.code}</span><p className="text-xs font-semibold">{c.title}</p></td>
            <td className="px-4 py-3"><StatusBadge value={c.status} /></td>
            <td className="px-4 py-3 tabular-nums">{fmtNumber(c.enrollments)}</td>
            <td className="px-4 py-3 tabular-nums">{fmtNumber(c.completions)}</td>
            <td className="px-4 py-3 tabular-nums">{c.completion_pct == null ? "—" : `${c.completion_pct}%`}</td>
            <td className="px-4 py-3 tabular-nums">{c.avg_score_pct == null ? "—" : `${c.avg_score_pct}%`}</td>
            <td className="px-4 py-3 tabular-nums">{fmtNumber(c.certificates)}</td>
            {finance && <><td className="px-4 py-3 tabular-nums">{formatMoney(c.gross_minor, { withZero: true })}</td><td className="px-4 py-3 tabular-nums">{formatMoney(c.refunded_minor, { withZero: true })}</td><td className="px-4 py-3 tabular-nums">{formatMoney(Number(c.gross_minor) - Number(c.refunded_minor), { withZero: true })}</td></>}
          </tr>
        ))}
      </DataTable>
      {(finance || coupons) && (
        <Panel title="Coupon effectiveness" description="Redemptions that became paid or free enrolments, the discount they gave, and the revenue of those orders." className="mt-6">
          <DataTable caption="Coupons" columns={["Code", "Redeemed", "Held", "Discount given", "Revenue", "Limit"]} empty={couponStats.length === 0 && <EmptyRow>No coupons.</EmptyRow>}>
            {couponStats.map((s) => <tr key={s.coupon_id}><td className="px-4 py-3 font-mono text-xs">{s.code}{!s.active && " (off)"}</td><td className="px-4 py-3 tabular-nums">{s.redeemed}</td><td className="px-4 py-3 tabular-nums">{s.reserved}</td><td className="px-4 py-3 tabular-nums">{formatMoney(s.discount_minor, { withZero: true })}</td><td className="px-4 py-3 tabular-nums">{formatMoney(s.revenue_minor, { withZero: true })}</td><td className="px-4 py-3">{s.usage_limit ?? "—"}</td></tr>)}
          </DataTable>
        </Panel>
      )}
    </>
  );
}
