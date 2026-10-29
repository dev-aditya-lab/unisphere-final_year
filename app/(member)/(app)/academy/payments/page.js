import Link from "next/link";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CancelOrder, RefundRequest } from "@/components/academy/commerce/student-actions";
import { EmptyBlock } from "@/components/academy/ui/section";
import { ORDER_STATUSES, REFUND_STATUSES } from "@/lib/academy/constants";
import { formatBps, formatMoney, withinDays } from "@/lib/academy/money";
import { requireProfile } from "@/lib/auth/session";
import { getAcademySettings, getMyOrders } from "@/lib/services/academy";

export const metadata = { title: "Payments" };

const NOTICE = {
  done: { icon: CheckCircle2, text: "Payment received. You are enrolled.", cls: "bg-success-soft text-[var(--success-text)]" },
  duplicate: { icon: CheckCircle2, text: "You already had this course, so the second payment is being refunded automatically.", cls: "bg-info-soft text-info-text" },
  pending: { icon: Clock, text: "We have not heard back from your payment provider yet. If you paid, it can take a minute. Check again below.", cls: "bg-warning-soft text-warning-text" },
  failed: { icon: XCircle, text: "The payment did not go through, and you were not charged for an enrolment. You can try again.", cls: "bg-destructive-soft text-destructive-text" },
};
const BADGE = { paid: "success", pending: "warning", failed: "danger", cancelled: "soft", expired: "soft", refunded: "info", partially_refunded: "info" };
const when = (iso) => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(iso));

export default async function PaymentsPage({ searchParams }) {
  const { user } = await requireProfile();
  const sp = await searchParams;
  const [orders, settings] = await Promise.all([getMyOrders(user.id), getAcademySettings()]);
  const notice = NOTICE[sp.payment];
  const money = (n) => formatMoney(n, { withZero: true });

  return (
    <div className="space-y-6 py-8">
      <header><h1 className="font-heading text-3xl font-extrabold">Payments</h1><p className="text-muted-foreground mt-1">Your Academy purchases, with the full price breakdown of each.</p></header>
      {notice && (
        <div role="status" className={`flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium ${notice.cls}`}>
          <notice.icon className="size-5 shrink-0" aria-hidden /><span>{notice.text}</span>
          {sp.payment === "pending" && sp.o && <Button asChild size="sm" variant="outline" className="ml-auto"><a href={`/api/payments/return?o=${encodeURIComponent(sp.o)}`}>Check again</a></Button>}
        </div>
      )}
      {orders.length === 0 ? (
        <EmptyBlock title="No purchases yet" action={<Button asChild><Link href="/academy/courses">Browse courses</Link></Button>}>Paid enrolments show up here. Free courses do not create an order.</EmptyBlock>
      ) : (
        <ul className="space-y-4">
          {orders.map((o) => {
            const item = o.items?.[0];
            const open = o.refunds?.find((r) => ["requested", "approved"].includes(r.status));
            const windowOpen = withinDays(o.paid_at, settings.refundWindowDays);
            return (
              <li key={o.id} className="ac-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><p className="text-muted-foreground font-mono text-xs">{o.order_no}</p><h2 className="text-lg font-bold">{item?.title ?? "Order"}</h2><p className="text-muted-foreground text-sm">{item?.course_code} · {when(o.created_at)}</p></div>
                  <Badge variant={BADGE[o.status] ?? "soft"}>{ORDER_STATUSES[o.status] ?? o.status}</Badge>
                </div>
                <dl className="mt-4 max-w-sm space-y-1.5 text-sm">
                  <div className="flex justify-between"><dt className="text-muted-foreground">Course price</dt><dd className="tabular-nums">{money(o.list_minor)}</dd></div>
                  {o.sale_discount_minor > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">Sale</dt><dd className="tabular-nums text-[var(--success-text)]">−{money(o.sale_discount_minor)}</dd></div>}
                  {o.coupon_discount_minor > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">Coupon {o.coupon_code}</dt><dd className="tabular-nums text-[var(--success-text)]">−{money(o.coupon_discount_minor)}</dd></div>}
                  {o.tax_minor > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">Tax ({formatBps(o.tax_rate_bps)}{o.tax_mode === "inclusive" ? ", included" : ""})</dt><dd className="tabular-nums">{money(o.tax_minor)}</dd></div>}
                  <div className="flex justify-between border-t pt-2 font-bold"><dt>Total</dt><dd className="tabular-nums">{money(o.total_minor)}</dd></div>
                </dl>
                {o.refunds?.length > 0 && (
                  <ul className="mt-4 space-y-1 text-sm">{o.refunds.map((r) => <li key={r.id} className="text-muted-foreground">Refund of {money(r.amount_minor)}: <strong className="text-foreground">{REFUND_STATUSES[r.status]}</strong> ({when(r.requested_at)})</li>)}</ul>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  {o.status === "pending" && <><Button asChild size="sm"><a href={`/api/payments/return?o=${o.id}`}>I have paid: check now</a></Button><CancelOrder orderId={o.id} /></>}
                  {o.status === "paid" && o.total_minor > 0 && !open && windowOpen && <RefundRequest orderId={o.id} orderNo={o.order_no} />}
                  {o.status === "paid" && !windowOpen && <span className="text-muted-foreground text-xs">The {settings.refundWindowDays}-day refund window has passed. <Link href="/refund-policy" className="underline">Policy</Link></span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
