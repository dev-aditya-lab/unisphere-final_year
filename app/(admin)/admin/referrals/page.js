import Link from "next/link";
import { Search } from "@/components/icons/lucide-compat";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { ActionDialog } from "@/components/admin/action-dialog";
import { SettingRow } from "@/components/admin/referrals-admin";
import { DataTable, EmptyRow, FilterTabs, Pager, Panel, StatCard, StatusBadge, fmtDateTime, fmtNumber } from "@/components/admin/ui";
import { stopReferralCampaignAction } from "@/lib/actions/referrals-admin";
import { hasPermission } from "@/lib/auth/session";
import { PAGE_SIZE, pageOffset, read } from "@/lib/services/admin";

export const metadata = { title: "Refer & Earn" };

const STATUS_STYLE = { rewarded: "paid", flagged: "pending_review", registered: "new", pending_qualification: "in_progress", reversed: "refunded", rejected: "rejected", expired: "dismissed" };
const FILTERS = [
  { value: "all", label: "All" },
  { value: "flagged", label: "Held for review" },
  { value: "signals", label: "Abuse signals" },
  { value: "rewarded", label: "Rewarded" },
  { value: "pending_qualification", label: "Almost there" },
  { value: "registered", label: "Joined" },
  { value: "reversed", label: "Reversed" },
  { value: "rejected", label: "Rejected" },
  { value: "expired", label: "Expired" },
];
const LABELS = {
  program_enabled: ["Program on", "Off: no new attributions and no new rewards. Existing records and leaderboards are kept."],
  attribution_days: ["Invite link memory (days)", "How long a device remembers an invite link before the person signs up (1 to 90)."],
  qualify_days: ["Days to become active", "After signing up, how long a friend has to qualify before the referral expires (7 to 180)."],
  activation_days: ["Active on this many days", "Different days with recognised Orbits activity a friend needs (1 to 7). The page tells members exactly this."],
  daily_referrer_cap: ["Rewards per member per 24 hours", "Further qualified referrals wait in Held for review instead of being paid (1 to 100)."],
  ip_cluster_threshold: ["Shared-network signal at", "Referrals by one member from the same signup network that raise a signal. A signal never withholds a reward."],
  popup_enabled: ["Reminder popup on", "The occasional Refer & Earn reminder. Members can switch it off themselves."],
  popup_frequency_days: ["Days between reminders", "Minimum gap per member (1 to 90)."],
  popup_max_dismissals: ["Stop after dismissals", "After this many dismissals a member never sees the reminder again (1 to 10)."],
  popup_min_account_days: ["Days before the first reminder", "Days after finishing onboarding (0 to 60). The member must also have used Orbits."],
  campaign_enabled: ["Launch announcement on", "When on, the worker tick sends the announcement once to each eligible member, in the app only. Needs the worker or a scheduler calling /api/cron/tick."],
  campaign_key: ["Announcement ID", "Lowercase letters, digits and hyphens. A new ID is a new announcement; an ID that was sent is never sent to the same person twice."],
  campaign_title: ["Announcement title", "Up to 80 characters."],
  campaign_body: ["Announcement text", "Up to 240 characters. Do not promise anything the program does not do."],
};
const ORDER = ["program_enabled", "activation_days", "qualify_days", "attribution_days", "daily_referrer_cap", "ip_cluster_threshold", "popup_enabled", "popup_frequency_days", "popup_max_dismissals", "popup_min_account_days", "campaign_enabled", "campaign_key", "campaign_title", "campaign_body"];

export default async function AdminReferralsPage({ searchParams }) {
  const sp = await searchParams;
  const status = FILTERS.some((f) => f.value === sp.status) ? sp.status : "all";
  const q = (sp.q ?? "").toString().trim().replace(/^@/, "").slice(0, 60);
  const page = Math.max(1, Number(sp.page) || 1);
  const [canManage, metrics, rows, settings] = await Promise.all([
    hasPermission("referrals.manage"),
    read("referral_admin_metrics"),
    read("referral_admin_list", { p_status: status === "all" ? null : status, p_q: q || null, p_limit: PAGE_SIZE, p_offset: pageOffset(page) }),
    read("referral_admin_settings"),
  ]);
  const total = Number(rows[0]?.total_count ?? 0);
  const by = metrics.by_status ?? {};
  const setting = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  const campaign = metrics.campaign;

  return (
    <>
      <PageHeader eyebrow="Insights & system" title="Refer & Earn" description="Referrals, held rewards, abuse signals and the program's settings. Reversals are compensating ledger entries and every decision is written to the audit log." />

      <section aria-label="Totals" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Rewarded" value={fmtNumber(by.rewarded ?? 0)} hint={`${fmtNumber(metrics.rewarded_7d)} in 7 days · ${fmtNumber(metrics.rewarded_30d)} in 30`} />
        <StatCard label="Held for review" value={fmtNumber(by.flagged ?? 0)} href="/admin/referrals?status=flagged" tone="warn" hint="Over the 24-hour cap" />
        <StatCard label="Waiting for friends" value={fmtNumber((by.registered ?? 0) + (by.pending_qualification ?? 0))} hint="Joined, not yet active" />
        <StatCard label="Abuse signals" value={fmtNumber(metrics.with_signals)} href="/admin/referrals?status=signals" hint="A prompt to look, not a verdict" />
        <StatCard label="Orbits issued" value={fmtNumber(metrics.orbits_issued)} hint={`${fmtNumber(metrics.orbits_reversed)} taken back`} />
        <StatCard label="Reversed" value={fmtNumber(by.reversed ?? 0)} />
        <StatCard label="Expired" value={fmtNumber(by.expired ?? 0)} hint="Did not become active in time" />
        <StatCard label="Announcement" value={`${fmtNumber(campaign.delivered)} sent`} hint={campaign.enabled ? `On · ${fmtNumber(campaign.read)} read · ${fmtNumber(campaign.skipped)} skipped` : `Off · ${fmtNumber(campaign.read)} read`} />
      </section>

      <FilterTabs label="Filter referrals" basePath="/admin/referrals" current={status} options={FILTERS} extra={{ q: q || null }} />
      <form method="get" role="search" aria-label="Search referrals" className="surface mb-4 flex flex-wrap items-end gap-3 p-3">
        <input type="hidden" name="status" value={status} />
        <label className="min-w-56 flex-1 text-[13px]">
          <span className="text-muted-foreground mb-1 block text-xs font-medium">Username or referral ID</span>
          <span className="relative block">
            <Search aria-hidden="true" className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <input name="q" defaultValue={q} placeholder="@username or referral ID" className="border-input bg-card h-9 w-full rounded-md border pr-3 pl-9 text-sm" />
          </span>
        </label>
        <Button type="submit" size="sm" variant="secondary">Search</Button>
        {canManage && <Button asChild size="sm" variant="outline"><a href="/api/admin/referrals/export" download>Export CSV (no names)</a></Button>}
      </form>

      <DataTable caption="Referrals" columns={["Joined", "Inviter", "Invited", "Status", "Signals", ""]} empty={rows.length === 0 && <EmptyRow>No referrals match.</EmptyRow>}>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="text-muted-foreground px-4 py-3 whitespace-nowrap">{fmtDateTime(r.registered_at)}</td>
            <td className="px-4 py-3">@{r.referrer_username}</td>
            <td className="px-4 py-3">{r.referred_username ? `@${r.referred_username}` : <span className="text-muted-foreground">account deleted</span>}</td>
            <td className="px-4 py-3"><StatusBadge value={STATUS_STYLE[r.status] ?? r.status} /><span className="sr-only"> {r.status.replace(/_/g, " ")}</span></td>
            <td className="text-muted-foreground px-4 py-3 text-xs">{r.signals?.length ? r.signals.join(", ").replace(/_/g, " ") : "—"}</td>
            <td className="px-4 py-3 text-right"><Link href={`/admin/referrals/${r.id}`} className="text-blue-text font-medium hover:underline">Review<span className="sr-only"> referral</span></Link></td>
          </tr>
        ))}
      </DataTable>
      <Pager basePath="/admin/referrals" page={page} total={total} params={{ status: status === "all" ? null : status, q: q || null }} />

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel title="Top referrers, last 7 days" description="Rewarded referrals per member. Look at anyone far above the rest.">
          {metrics.top_referrers_7d.length === 0 ? (
            <p className="text-muted-foreground text-sm">No rewards in the last 7 days.</p>
          ) : (
            <ul className="divide-y text-sm">
              {metrics.top_referrers_7d.map((t) => (
                <li key={t.username} className="flex items-center justify-between gap-3 py-2">
                  <Link href={`/admin/referrals?q=${encodeURIComponent(t.username)}`} className="text-blue-text font-medium hover:underline">@{t.username}</Link>
                  <span className="text-muted-foreground text-xs">{t.rewarded} rewarded{t.signals ? ` · ${t.signals} with signals` : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Invites refused, last 7 days" description="Why invite links did not become referrals. Spikes can mean someone is probing the program.">
          {Object.keys(metrics.refused_7d).length === 0 ? (
            <p className="text-muted-foreground text-sm">Nothing was refused.</p>
          ) : (
            <ul className="divide-y text-sm">
              {Object.entries(metrics.refused_7d).map(([reason, n]) => (
                <li key={reason} className="flex justify-between py-2"><span>{reason.replace(/_/g, " ")}</span><span className="font-semibold tabular-nums">{n}</span></li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel
        className="mt-6"
        title="Program settings"
        description="Changes apply from now on. The reward amount (100 Orbits) is fixed and is not a setting."
        actions={campaign.enabled && canManage ? (
          <div className="flex flex-wrap gap-2">
            <ActionDialog label="Stop announcement" title="Stop the launch announcement?" description="No further members will receive it. Copies already delivered stay in people's bells." action={stopReferralCampaignAction} args={{ retract: false }} askReason={false} confirmLabel="Stop" />
            <ActionDialog label="Stop and remove unread copies" destructive title="Stop and take back unread copies?" description="Unread copies disappear from members' bells. Copies that were already read are left alone." action={stopReferralCampaignAction} args={{ retract: true }} askReason={false} confirmLabel="Stop and remove" />
          </div>
        ) : null}
      >
        <div className="divide-y">
          {ORDER.filter((k) => k in setting).map((k) => (
            <SettingRow key={k} name={k} label={LABELS[k][0]} hint={LABELS[k][1]} value={setting[k]} />
          ))}
        </div>
      </Panel>
    </>
  );
}
