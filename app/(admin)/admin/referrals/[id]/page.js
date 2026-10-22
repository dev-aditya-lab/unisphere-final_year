import Link from "next/link";
import { ArrowLeft, Check, X } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { ActionDialog } from "@/components/admin/action-dialog";
import { Panel, StatusBadge, fmtDateTime } from "@/components/admin/ui";
import { reverseReferralAction, reviewReferralAction } from "@/lib/actions/referrals-admin";
import { hasPermission } from "@/lib/auth/session";
import { read } from "@/lib/services/admin";

export const metadata = { title: "Referral" };

const STATUS_STYLE = { rewarded: "paid", flagged: "pending_review", registered: "new", pending_qualification: "in_progress", reversed: "refunded", rejected: "rejected", expired: "dismissed" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Check_({ ok, children }) {
  return (
    <li className="flex items-start gap-2 py-2 text-sm">
      {ok ? <Check className="text-success-text mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <X className="text-destructive-text mt-0.5 size-4 shrink-0" aria-hidden="true" />}
      <span><span className="sr-only">{ok ? "Met: " : "Not met: "}</span>{children}</span>
    </li>
  );
}

export default async function AdminReferralPage({ params }) {
  const { id } = await params;
  if (!UUID.test(id)) return <p className="text-muted-foreground">That is not a referral ID.</p>;
  const [canManage, r] = await Promise.all([hasPermission("referrals.manage"), read("referral_admin_detail", { p_id: id })]);
  const closed = ["rewarded", "reversed", "rejected", "expired"].includes(r.status);

  return (
    <>
      <PageHeader
        eyebrow="Refer & Earn"
        title="Referral"
        description="The evidence below is what the qualification rule saw. Usernames and dates only: no emails, no network data."
        actions={<Button asChild variant="outline" size="sm"><Link href="/admin/referrals"><ArrowLeft /> All referrals</Link></Button>}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel title="Summary" actions={<StatusBadge value={STATUS_STYLE[r.status] ?? r.status} />}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Referral ID</dt><dd className="font-mono text-xs break-all">{r.id}</dd>
            <dt className="text-muted-foreground">Inviter</dt><dd>@{r.referrer?.username} <span className="text-muted-foreground text-xs">({r.referrer?.status}, {r.referrer?.rewarded_total} rewarded, {r.referrer?.rewarded_24h} in 24 h)</span></dd>
            <dt className="text-muted-foreground">Invited</dt><dd>{r.referred ? <>@{r.referred.username} <span className="text-muted-foreground text-xs">({r.referred.status})</span></> : <span className="text-muted-foreground">account deleted</span>}</dd>
            <dt className="text-muted-foreground">Joined</dt><dd>{fmtDateTime(r.registered_at)}</dd>
            <dt className="text-muted-foreground">Must qualify by</dt><dd>{fmtDateTime(r.qualify_by)}</dd>
            <dt className="text-muted-foreground">Qualified</dt><dd>{r.qualified_at ? fmtDateTime(r.qualified_at) : "—"}</dd>
            <dt className="text-muted-foreground">Reward</dt><dd>{r.reward_amount ? `${r.reward_amount} Orbits` : "—"}</dd>
            <dt className="text-muted-foreground">Signals</dt><dd>{r.signals?.length ? r.signals.join(", ").replace(/_/g, " ") : "none"}</dd>
            {r.review_reason && (<><dt className="text-muted-foreground">Review note</dt><dd>{r.review_reason}</dd></>)}
            {r.reversed_at && (<><dt className="text-muted-foreground">Reversed</dt><dd>{fmtDateTime(r.reversed_at)} — {r.reversal_reason}{r.reversal_shortfall ? ` (${r.reversal_shortfall} Orbits could not be taken back)` : ""}</dd></>)}
          </dl>
          {canManage && (
            <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
              {r.status === "flagged" && (
                <>
                  <ActionDialog label="Approve reward" variant="default" title="Approve and pay the reward?" description="Credits 100 Orbits to the inviter, once. Use it when the referral looks genuine." action={reviewReferralAction} args={{ id: r.id, decision: "approve" }} reasonLabel="Why is it genuine? (kept in the audit log)" confirmLabel="Approve" />
                  <ActionDialog label="Reject" destructive title="Reject this referral?" description="No reward is paid. The referral stays on record as rejected." action={reviewReferralAction} args={{ id: r.id, decision: "reject" }} reasonLabel="Why is it not valid? (kept in the audit log)" confirmLabel="Reject" />
                </>
              )}
              {r.status === "rewarded" && (
                <ActionDialog label="Reverse reward" destructive title="Reverse this reward?" description="A compensating ledger entry takes the 100 Orbits back, never below a zero balance and never touching other Orbits. If the balance no longer holds them, the shortfall is recorded. The inviter is told." action={reverseReferralAction} args={{ id: r.id }} reasonLabel="Reason (kept in the ledger and audit log)" confirmLabel="Reverse" />
              )}
              {closed && r.status !== "rewarded" && <p className="text-muted-foreground text-sm">This referral is closed.</p>}
              {!closed && r.status !== "flagged" && <p className="text-muted-foreground text-sm">Nothing to decide: the rule pays this automatically if the friend qualifies.</p>}
            </div>
          )}
        </Panel>

        <Panel title="Qualification evidence" description="Each line is checked by the database, not the browser.">
          <ul className="divide-y">
            <Check_ ok={Boolean(r.referred?.email_confirmed)}>Email address confirmed</Check_>
            <Check_ ok={Boolean(r.referred?.onboarded)}>Profile set up (onboarding finished)</Check_>
            <Check_ ok={r.activity_days >= r.activity_days_required}>Recognised Orbits activity on {r.activity_days} of {r.activity_days_required} required days</Check_>
            <Check_ ok={r.referrer?.status === "active"}>Inviter&rsquo;s account in good standing</Check_>
            <Check_ ok={!r.signals?.includes("velocity")}>Within the inviter&rsquo;s 24-hour reward cap</Check_>
            <Check_ ok={!r.shared_network_with}>{r.shared_network_with ? `Shares a signup network with ${r.shared_network_with} other referral(s) by the same inviter (a signal only; shared Wi-Fi is common)` : "No shared signup network with other referrals by the same inviter"}</Check_>
          </ul>
        </Panel>

        <Panel title="Trail" className="lg:col-span-2" description="Every state change, oldest first.">
          {r.events.length === 0 ? (
            <p className="text-muted-foreground text-sm">No events.</p>
          ) : (
            <ol className="divide-y text-sm">
              {r.events.map((e, i) => (
                <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                  <span className="font-medium">{e.kind.replace(/_/g, " ")}{Object.keys(e.detail ?? {}).length ? <span className="text-muted-foreground font-normal"> · {Object.entries(e.detail).map(([k, v]) => `${k}: ${v}`).join(", ")}</span> : null}</span>
                  <span className="text-muted-foreground text-xs">{fmtDateTime(e.at)}</span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </>
  );
}
