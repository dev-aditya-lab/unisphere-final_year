import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { DataTable, EmptyRow, FilterTabs, Pager, Panel, StatCard, StatusBadge, fmtDateTime, fmtNumber } from "@/components/admin/ui";
import { TimeSeriesChart } from "@/components/admin/charts";
import { PricingForm, RefundButton } from "@/components/admin/blue-tick-admin";
import { Badge } from "@/components/ui/badge";
import { hasPermission } from "@/lib/auth/session";
import { publicEnv } from "@/lib/env-public";
import { describePaymentsStatus, paymentsStatus } from "@/lib/payments/gateway";
import { formatInr, paiseToRupeesInput } from "@/lib/blue-tick";
import { getPaymentsOverview, listOrders } from "@/lib/services/blue-tick";

export const metadata = { title: "Payments" };

const VIEWS = [
  { value: "all", label: "All" },
  { value: "paid", label: "Paid" },
  { value: "created", label: "Not completed" },
  { value: "failed", label: "Failed" },
  { value: "refunded", label: "Refunded" },
];

export default async function PaymentsPage({ searchParams }) {
  const sp = await searchParams;
  const view = VIEWS.some((v) => v.value === sp.status) ? sp.status : "all";
  const page = Math.max(1, Number(sp.page) || 1);
  const [overview, rows, canManage] = await Promise.all([
    getPaymentsOverview(30),
    listOrders({ status: view === "all" ? null : view, page }),
    hasPermission("bluetick.manage"),
  ]);
  const o = overview.orders;
  const total = Number(rows[0]?.total ?? 0);
  const gateway = paymentsStatus();
  const gatewayNotice = describePaymentsStatus(gateway);

  return (
    <>
      <PageHeader
        eyebrow="Insights & system" title="Payments"
        description={`Blue tick purchases through ${gateway.label ?? "the payment gateway you connect"}. Every amount is set and checked on the server; card and UPI details never reach UniSphere. Refunds made here or in the gateway's own dashboard are both recorded.`}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Net revenue" value={formatInr(o.net_paise, { withZero: true })} hint={`${fmtNumber(o.paid_count)} paid ${o.paid_count === 1 ? "order" : "orders"}, all time`} />
        <StatCard label="Last 30 days" value={formatInr(o.period_net_paise, { withZero: true })} hint={`${fmtNumber(o.period_paid_count)} paid ${o.period_paid_count === 1 ? "order" : "orders"}`} />
        <StatCard label="Refunded" value={formatInr(o.refunded_paise, { withZero: true })} hint={`${fmtNumber(o.refunded_count)} orders`} />
        <StatCard label="Failed or abandoned" value={fmtNumber(o.failed_count + o.abandoned_count)} hint={`${fmtNumber(o.failed_count)} failed, ${fmtNumber(o.abandoned_count)} not completed`} />
        <StatCard label="Waiting for review" value={fmtNumber(overview.applications.pending_review)} hint="IDs to check" href="/admin/blue-tick" tone="warn" />
        <StatCard label="Paid, ID not sent" value={fmtNumber(overview.applications.awaiting_document)} hint="Members who paid but have not uploaded" />
        <StatCard label="Active blue ticks" value={fmtNumber(overview.ticks.active)} hint={`${fmtNumber(overview.ticks.purchased)} bought, ${fmtNumber(overview.ticks.free)} given free`} href="/admin/blue-tick?status=ticks" />
        <StatCard label="Duplicate payments" value={fmtNumber(o.refund_due_count)} hint="Refunded automatically when detected" tone="warn" />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <TimeSeriesChart title="Paid orders per day" series={overview.series.map((p) => ({ day: p.day, value: Number(p.value) }))} />
        <TimeSeriesChart title="Revenue per day (₹)" series={overview.series.map((p) => ({ day: p.day, value: Number(p.paise) / 100 }))} color="var(--chart-2)" />
      </div>

      <Panel title="Payment gateway" description="Chosen with PAYMENT_GATEWAY on the server; see docs/PAYMENTS.md to connect another." className="mb-6">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
          <dt className="text-muted-foreground">Gateway</dt>
          <dd className="font-semibold">{gateway.label ?? (gateway.wanted ? `${gateway.wanted} (no adapter in the code)` : "Not connected")}</dd>
          <dt className="text-muted-foreground">Keys</dt>
          <dd><Badge variant={gateway.configured ? "success" : "warning"}>{gateway.configured ? "set" : "not set"}</Badge></dd>
          <dt className="text-muted-foreground">Webhook</dt>
          <dd><Badge variant={gateway.webhookReady ? "success" : "warning"}>{gateway.webhookReady ? "ready" : "not set up"}</Badge></dd>
          <dt className="text-muted-foreground">Webhook address</dt>
          <dd className="font-mono text-xs break-all">{publicEnv.appUrl}/api/payments/webhook</dd>
        </dl>
      </Panel>

      <Panel title="Blue tick price" description="One-time payment. Nothing is sold until it is switched on and a price is set." className="mb-6">
        <PricingForm
          enabled={overview.pricing.enabled}
          price={overview.pricing.price_paise ? paiseToRupeesInput(overview.pricing.price_paise) : ""}
          canManage={canManage}
          gatewayBlocking={gatewayNotice.blocking}
          gatewayWarning={gatewayNotice.warning}
        />
      </Panel>

      <h2 className="font-heading mb-3 text-lg font-bold">Orders</h2>
      <FilterTabs label="Order views" basePath="/admin/payments" current={view} options={VIEWS} />
      <DataTable
        caption="Blue tick orders"
        columns={["Member", "Amount", "Status", "Review", "Created", "Payment ID", ""]}
        empty={rows.length === 0 && <EmptyRow>No orders here.</EmptyRow>}
      >
        {rows.map((r) => (
          <tr key={r.id} className="hover:bg-muted/40 align-top">
            <td className="px-4 py-3">
              {r.user_id ? (
                <Link href={`/u/${r.username}`} className="font-semibold hover:underline">{r.full_name ?? r.username}</Link>
              ) : (
                <span className="text-muted-foreground">Deleted account</span>
              )}
              {r.username && <p className="text-muted-foreground text-xs">@{r.username}</p>}
            </td>
            <td className="px-4 py-3 whitespace-nowrap tabular-nums">{formatInr(r.amount_paise, { withZero: true })}</td>
            <td className="px-4 py-3">
              <StatusBadge value={r.status} />
              {r.method && <span className="text-muted-foreground ml-1.5 text-xs capitalize">{r.method}</span>}
              {r.note && <p className="text-muted-foreground mt-1 max-w-48 text-xs">{r.note}</p>}
            </td>
            <td className="px-4 py-3">{r.application_status ? <StatusBadge value={r.application_status} /> : "—"}</td>
            <td className="px-4 py-3 whitespace-nowrap">
              {fmtDateTime(r.created_at)}
              {r.paid_at && <p className="text-muted-foreground text-xs">paid {fmtDateTime(r.paid_at)}</p>}
            </td>
            <td className="max-w-36 px-4 py-3 font-mono text-xs"><span className="block truncate" title={r.provider_payment_id ?? undefined}>{r.provider_payment_id ?? "—"}</span></td>
            <td className="px-4 py-3">{canManage && r.status === "paid" ? <RefundButton orderId={r.id} /> : null}</td>
          </tr>
        ))}
      </DataTable>
      <Pager basePath="/admin/payments" page={page} total={total} params={{ status: view === "all" ? null : view }} />
    </>
  );
}
