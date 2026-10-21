import Link from "next/link";
import { Search } from "@/components/icons/lucide-compat";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { ActionDialog } from "@/components/admin/action-dialog";
import { DataTable, EmptyRow, Pager, Panel, StatusBadge, fmtDateTime } from "@/components/admin/ui";
import { OrbitsAdminTabs } from "@/components/admin/orbits-tabs";
import { AdjustForm } from "@/components/admin/orbits-admin";
import { reverseOrbitsAction } from "@/lib/actions/orbits-admin";
import { KIND_LABEL } from "@/lib/orbits/icons";
import { PAGE_SIZE, findUserByUsername, pageOffset, read } from "@/lib/services/admin";

export const metadata = { title: "Orbit ledger" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS = Object.keys(KIND_LABEL);

export default async function AdminLedgerPage({ searchParams }) {
  const sp = await searchParams;
  const q = (sp.user ?? "").toString().trim().replace(/^@/, "").slice(0, 60);
  const kind = KINDS.includes(sp.kind) ? sp.kind : null;
  const page = Math.max(1, Number(sp.page) || 1);
  const userId = !q ? null : UUID.test(q) ? q : ((await findUserByUsername(q))?.id ?? "00000000-0000-0000-0000-000000000000");
  const [rows, suspicious] = await Promise.all([
    read("orbit_admin_ledger", { p_user: userId, p_kind: kind, p_limit: PAGE_SIZE, p_offset: pageOffset(page) }),
    read("orbit_admin_suspicious", { p_days: 7 }),
  ]);
  const total = Number(rows[0]?.total_count ?? 0);

  return (
    <>
      <PageHeader eyebrow="Insights & system" title="Orbit ledger" description="Every Orbit that was earned or taken back. Entries are never edited: a mistake is fixed with a new entry that names the reason and the person who made it." />
      <OrbitsAdminTabs current="/admin/orbits/ledger" />

      <form method="get" role="search" aria-label="Filter the ledger" className="surface mb-5 flex flex-wrap items-end gap-3 p-3">
        <label className="min-w-56 flex-1 text-[13px]">
          <span className="text-muted-foreground mb-1 block text-xs font-medium">Member</span>
          <span className="relative block">
            <Search aria-hidden="true" className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <input name="user" defaultValue={q} placeholder="@username or member ID" className="border-input bg-card h-9 w-full rounded-md border pr-3 pl-9 text-sm" />
          </span>
        </label>
        <label className="text-[13px]">
          <span className="text-muted-foreground mb-1 block text-xs font-medium">Type</span>
          <select name="kind" defaultValue={kind ?? ""} className="border-input bg-card h-9 rounded-md border px-2 text-sm">
            <option value="">Any</option>
            {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </label>
        <Button type="submit" size="sm" variant="secondary">Filter</Button>
      </form>

      <DataTable caption="Ledger" columns={["When", "Member", "Type", "Orbits", "Source / reason", ""]} empty={rows.length === 0 && <EmptyRow>No entries match.</EmptyRow>}>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="text-muted-foreground px-4 py-3 whitespace-nowrap">{fmtDateTime(r.created_at)}</td>
            <td className="px-4 py-3"><Link href={`/admin/users/${r.user_id}`} className="text-blue-text font-medium hover:underline">@{r.username}</Link></td>
            <td className="px-4 py-3">{KIND_LABEL[r.kind] ?? r.kind}{r.reversed && <span className="ml-2"><StatusBadge value="refunded" /><span className="sr-only"> reversed</span></span>}</td>
            <td className={`px-4 py-3 font-semibold tabular-nums ${r.amount > 0 ? "text-success-text" : "text-destructive-text"}`}>{r.amount > 0 ? "+" : ""}{r.amount}</td>
            <td className="text-muted-foreground max-w-xs truncate px-4 py-3 text-xs">{r.reason ?? ([r.source_type, r.source_id].filter(Boolean).join(" ") || "—")}</td>
            <td className="px-4 py-3 text-right">
              {r.amount > 0 && r.kind !== "reversal" && !r.reversed && (
                <ActionDialog label="Reverse" destructive title="Reverse this reward?" description="A reversing entry takes the Orbits back (never below zero). The original stays in the ledger. Use it for confirmed abuse." action={reverseOrbitsAction} args={{ id: r.id }} reasonLabel="Reason (kept in the ledger and audit log)" confirmLabel="Reverse" />
              )}
            </td>
          </tr>
        ))}
      </DataTable>
      <Pager basePath="/admin/orbits/ledger" page={page} total={total} params={{ user: q || null, kind }} />

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel title="Review: unusual earning" description="The top earners of the last 7 days. Flagged means a day above the review threshold. It is a prompt to look, not a verdict.">
          {suspicious.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nobody has earned Orbits in this period.</p>
          ) : (
            <ul className="divide-y text-sm">
              {suspicious.map((s) => (
                <li key={s.user_id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <Link href={`/admin/orbits/ledger?user=${s.user_id}`} className="text-blue-text font-medium hover:underline">@{s.username}</Link>
                    <span className="text-muted-foreground block text-xs">{s.entries} entries · best day {s.best_day_earned} · {s.posts_rewarded} post rewards</span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{s.earned}{s.flagged && <span className="ml-2"><StatusBadge value="high" /><span className="sr-only"> flagged</span></span>}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Correct a balance" description="Adds or removes Orbits with a reason. Removal never takes a balance below zero.">
          <AdjustForm defaultUser={UUID.test(q) ? q : ""} />
        </Panel>
      </div>
    </>
  );
}
