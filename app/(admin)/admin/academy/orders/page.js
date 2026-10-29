import Link from "next/link";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { DataTable, EmptyRow, FilterTabs, Pager, Panel, StatusBadge, fmtDateTime } from "@/components/admin/ui";
import { ActionDialog, QuickAction } from "@/components/admin/action-dialog";
import { Button } from "@/components/ui/button";
import { StaffRefundButton } from "@/components/academy/admin/staff-tools";
import { processRefundAction, reconcileOrderAction, reviewRefundAction } from "@/lib/actions/academy-admin";
import { ORDER_STATUSES, REFUND_STATUSES } from "@/lib/academy/constants";
import { formatBps, formatMoney, toMinor } from "@/lib/academy/money";
import { PAGE_SIZE } from "@/lib/admin/paging";
import { courseOptions, needAcademy, offset, rows } from "@/lib/services/academy-admin";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Academy orders and refunds" };

const VIEWS = [{ value: "orders", label: "Orders" }, { value: "refunds", label: "Refunds" }];
const STATUSES = [{ value: "all", label: "All" }, ...Object.entries(ORDER_STATUSES).map(([value, label]) => ({ value, label }))];
const money = (n) => formatMoney(n, { withZero: true });
const input = "border-input bg-card h-9 rounded-md border px-3 text-sm";

export default async function AcademyOrders({ searchParams }) {
  const held = await needAcademy("academy.finance.view");
  const sp = await searchParams;
  const view = sp.view === "refunds" ? "refunds" : "orders";
  const canRefund = held["academy.finance.view"] && (await (await createClient()).rpc("has_permission", { p_permission: "academy.refunds.process", p_college_id: null })).data === true;
  const page = Math.max(1, Number(sp.page) || 1);
  const supabase = await createClient();

  if (view === "refunds") {
    const { data: refunds } = await supabase.from("academy_refunds").select("*, order:academy_orders(order_no, buyer_name, buyer_username, total_minor)").order("requested_at", { ascending: false }).limit(100);
    const open = (refunds ?? []).filter((r) => ["requested", "approved"].includes(r.status));
    const closed = (refunds ?? []).filter((r) => !["requested", "approved"].includes(r.status));
    const table = (list, actions) => (
      <DataTable caption="Refunds" columns={["Order", "Student", "Amount", "Why", "Status", "Asked", ""]} empty={list.length === 0 && <EmptyRow>Nothing here.</EmptyRow>}>
        {list.map((r) => (
          <tr key={r.id} className="align-top">
            <td className="px-4 py-3 font-mono text-xs">{r.order?.order_no}</td>
            <td className="px-4 py-3">{r.order?.buyer_name ?? "Deleted account"}{r.order?.buyer_username && <p className="text-muted-foreground text-xs">@{r.order.buyer_username}</p>}</td>
            <td className="px-4 py-3 tabular-nums">{money(r.amount_minor)}<p className="text-muted-foreground text-xs">of {money(r.order?.total_minor)}</p></td>
            <td className="max-w-64 px-4 py-3 text-xs">{r.reason}{r.review_note && <p className="text-muted-foreground mt-1">Note: {r.review_note}</p>}</td>
            <td className="px-4 py-3"><StatusBadge value={r.status === "completed" ? "completed" : r.status} /><p className="text-muted-foreground mt-1 text-xs">{REFUND_STATUSES[r.status]} · {r.initiated_by}</p></td>
            <td className="px-4 py-3 text-xs whitespace-nowrap">{fmtDateTime(r.requested_at)}</td>
            <td className="px-4 py-3"><div className="flex flex-wrap justify-end gap-1.5">{actions?.(r)}</div></td>
          </tr>
        ))}
      </DataTable>
    );
    return (
      <>
        <PageHeader eyebrow="Academy" title="Orders and refunds" description="A refund is a decision first and a bank movement second. An order is marked refunded only after the payment gateway accepts the refund." />
        <FilterTabs label="View" basePath="/admin/academy/orders" param="view" current={view} options={VIEWS} />
        <h2 className="mb-2 text-sm font-bold">Needs action</h2>
        {table(open, (r) => canRefund && (r.status === "requested" ? (
          <>
            <ActionDialog label="Approve" args={{ refundId: r.id, approve: true }} reasonField="note" reasonRequired={false} reasonLabel="Note to the file" action={reviewRefundAction} title="Approve this refund?" description="This only records the decision. Send it to the gateway next." />
            <ActionDialog label="Decline" destructive args={{ refundId: r.id, approve: false }} reasonField="note" reasonLabel="Why (the student is told)" action={reviewRefundAction} title="Decline this refund?" />
          </>
        ) : <QuickAction label="Send to gateway" variant="default" action={processRefundAction} args={{ refundId: r.id }} />))}
        <h2 className="mt-8 mb-2 text-sm font-bold">History</h2>
        {table(closed)}
      </>
    );
  }

  const status = STATUSES.some((s) => s.value === sp.status) && sp.status !== "all" ? sp.status : null;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : "";
  const course = typeof sp.course === "string" && /^[0-9a-f-]{36}$/.test(sp.course) ? sp.course : null;
  const from = sp.from && !Number.isNaN(Date.parse(sp.from)) ? new Date(sp.from).toISOString() : null;
  const to = sp.to && !Number.isNaN(Date.parse(sp.to)) ? new Date(new Date(sp.to).getTime() + 86_400_000).toISOString() : null;
  const min = sp.min ? toMinor(sp.min) : null;
  const max = sp.max ? toMinor(sp.max) : null;
  const [list, courses] = await Promise.all([
    rows("academy_admin_orders", { p_search: q || null, p_status: status, p_course: course, p_from: from, p_to: to, p_min: min, p_max: max, p_limit: PAGE_SIZE, p_offset: offset(page) }),
    courseOptions(),
  ]);
  const total = Number(list[0]?.total_count ?? 0);
  const ids = list.map((o) => o.id);
  const { data: events } = ids.length ? await supabase.from("academy_payment_events").select("order_id, type, detail, created_at").in("order_id", ids).order("created_at") : { data: [] };
  const params = { q, status, course, from: sp.from, to: sp.to, min: sp.min, max: sp.max };
  const exportHref = `/api/admin/academy/export?kind=orders&${new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString()}`;

  return (
    <>
      <PageHeader eyebrow="Academy" title="Orders and refunds" description="Search by order number, student, email, course code or a payment-gateway reference. The full price breakdown and the gateway's event history are under each order."
        actions={<Button asChild variant="outline" size="sm"><a href={exportHref}><Download aria-hidden />Export CSV</a></Button>} />
      <FilterTabs label="View" basePath="/admin/academy/orders" param="view" current="orders" options={VIEWS} />
      <FilterTabs label="Status" basePath="/admin/academy/orders" param="status" current={status ?? "all"} options={STATUSES} extra={{ q, course }} />
      <form method="get" role="search" className="mb-4 flex flex-wrap items-end gap-2">
        <input type="hidden" name="status" value={status ?? ""} />
        <div><label htmlFor="o-q" className="text-xs font-semibold">Search</label><input id="o-q" name="q" defaultValue={q} placeholder="AO-2026-…, name, email, code, gateway id" className={`${input} mt-1 block w-64`} /></div>
        <div><label htmlFor="o-c" className="text-xs font-semibold">Course</label><select id="o-c" name="course" defaultValue={course ?? ""} className={`${input} mt-1 block`}><option value="">All</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</select></div>
        <div><label htmlFor="o-f" className="text-xs font-semibold">From</label><input id="o-f" type="date" name="from" defaultValue={sp.from ?? ""} className={`${input} mt-1 block`} /></div>
        <div><label htmlFor="o-t" className="text-xs font-semibold">To</label><input id="o-t" type="date" name="to" defaultValue={sp.to ?? ""} className={`${input} mt-1 block`} /></div>
        <div><label htmlFor="o-min" className="text-xs font-semibold">Min ₹</label><input id="o-min" placeholder="0" name="min" defaultValue={sp.min ?? ""} className={`${input} mt-1 block w-24`} /></div>
        <div><label htmlFor="o-max" className="text-xs font-semibold">Max ₹</label><input id="o-max" placeholder="5000" name="max" defaultValue={sp.max ?? ""} className={`${input} mt-1 block w-24`} /></div>
        <Button type="submit" size="sm">Filter</Button>
      </form>
      <DataTable caption="Academy orders" columns={["Order", "Student", "Course", "Total", "Status", "Gateway", "When", ""]} empty={list.length === 0 && <EmptyRow>No orders match.</EmptyRow>}>
        {list.map((o) => {
          const left = Number(o.total_minor) - Number(o.refunded_minor);
          const ev = (events ?? []).filter((e) => e.order_id === o.id);
          return (
            <tr key={o.id} className="align-top">
              <td className="px-4 py-3 font-mono text-xs">{o.order_no}</td>
              <td className="px-4 py-3">{o.buyer_name ?? <span className="text-muted-foreground">Deleted account</span>}{o.buyer_username && <p className="text-muted-foreground text-xs">@{o.buyer_username}</p>}{o.buyer_email && <p className="text-muted-foreground text-xs">{o.buyer_email}</p>}</td>
              <td className="px-4 py-3"><span className="font-mono text-xs">{o.course_code}</span><p className="text-xs">{o.course_title}</p></td>
              <td className="px-4 py-3 tabular-nums">
                {money(o.total_minor)}
                <details className="mt-1"><summary className="text-primary-text cursor-pointer text-xs">Breakdown & events</summary>
                  <dl className="mt-2 w-60 space-y-1 text-xs">
                    <div className="flex justify-between"><dt>List</dt><dd>{money(o.list_minor)}</dd></div>
                    {o.sale_discount_minor > 0 && <div className="flex justify-between"><dt>Sale</dt><dd>−{money(o.sale_discount_minor)}</dd></div>}
                    {o.coupon_discount_minor > 0 && <div className="flex justify-between"><dt>Coupon {o.coupon_code}</dt><dd>−{money(o.coupon_discount_minor)}</dd></div>}
                    <div className="flex justify-between"><dt>Tax {o.tax_mode !== "none" ? `(${formatBps(o.tax_rate_bps)} ${o.tax_mode})` : ""}</dt><dd>{money(o.tax_minor)}</dd></div>
                    <div className="flex justify-between border-t pt-1 font-bold"><dt>Total</dt><dd>{money(o.total_minor)}</dd></div>
                    {Number(o.refunded_minor) > 0 && <div className="flex justify-between"><dt>Refunded</dt><dd>{money(o.refunded_minor)}</dd></div>}
                  </dl>
                  <ul className="text-muted-foreground mt-2 space-y-0.5 text-[11px]">{ev.map((e, i) => <li key={i}>{fmtDateTime(e.created_at)} · {e.type}</li>)}{ev.length === 0 && <li>No gateway events recorded.</li>}</ul>
                </details>
              </td>
              <td className="px-4 py-3"><StatusBadge value={o.status === "partially_refunded" ? "processing" : o.status} /><p className="text-muted-foreground mt-1 text-xs">{ORDER_STATUSES[o.status]}{o.refund_status ? ` · refund ${o.refund_status}` : ""}</p></td>
              <td className="max-w-40 px-4 py-3 font-mono text-[11px] break-all">{o.provider_payment_id ?? o.provider_order_id ?? "—"}</td>
              <td className="px-4 py-3 text-xs whitespace-nowrap">{fmtDateTime(o.created_at)}{o.paid_at && <p className="text-muted-foreground">paid {fmtDateTime(o.paid_at)}</p>}</td>
              <td className="px-4 py-3"><div className="flex flex-wrap justify-end gap-1.5">
                {canRefund && ["pending", "failed", "expired", "cancelled"].includes(o.status) && o.provider_order_id && <QuickAction label="Reconcile" action={reconcileOrderAction} args={{ orderId: o.id }} successMessage="Checked with the gateway." />}
                {canRefund && ["paid", "partially_refunded"].includes(o.status) && left > 0 && <StaffRefundButton orderId={o.id} orderNo={o.order_no} refundableMinor={left} />}
              </div></td>
            </tr>
          );
        })}
      </DataTable>
      <Pager basePath="/admin/academy/orders" page={page} total={total} params={params} />
      <Panel className="mt-6"><p className="text-muted-foreground text-xs">Reconcile asks the payment gateway what happened to an order that is not marked paid and records the truth. It is the same check that runs when a student comes back or a webhook arrives. <Link className="text-primary-text underline" href="/admin/payments">Blue tick payments</Link> are listed separately.</p></Panel>
    </>
  );
}
