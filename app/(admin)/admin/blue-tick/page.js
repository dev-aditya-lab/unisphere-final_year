import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { DataTable, EmptyRow, FilterTabs, Pager, Panel, StatusBadge, fmtDateTime } from "@/components/admin/ui";
import { GrantForm, ReviewActions, RevokeButton } from "@/components/admin/blue-tick-admin";
import { BlueTick } from "@/components/ui/blue-tick";
import { hasPermission } from "@/lib/auth/session";
import { formatInr } from "@/lib/blue-tick";
import { listApplications, listBlueTicks } from "@/lib/services/blue-tick";

export const metadata = { title: "Blue tick" };

const VIEWS = [
  { value: "pending_review", label: "Waiting for review" },
  { value: "awaiting_document", label: "Paid, ID not sent" },
  { value: "approved", label: "Approved" },
  { value: "refunded", label: "Refunded" },
  { value: "ticks", label: "Active blue ticks" },
];

export default async function BlueTickAdminPage({ searchParams }) {
  const sp = await searchParams;
  const view = VIEWS.some((v) => v.value === sp.status) ? sp.status : "pending_review";
  const page = Math.max(1, Number(sp.page) || 1);
  const canManage = await hasPermission("bluetick.manage");
  const isTicks = view === "ticks";
  const rows = isTicks ? await listBlueTicks({ page }) : await listApplications({ status: view, page });
  const total = Number(rows[0]?.total ?? 0);

  return (
    <>
      <PageHeader
        eyebrow="Review queues" title="Blue tick"
        description="A member pays once, sends an Aadhaar card, and you confirm the name and photo match their profile. Documents are visible only here, only while waiting for review, and are deleted the moment you decide."
      />
      <FilterTabs label="Blue tick views" basePath="/admin/blue-tick" current={view} options={VIEWS} />

      {isTicks ? (
        <div className="space-y-6">
          {canManage && (
            <Panel title="Give a blue tick free of charge" description="For people who should have it without paying or sending a document. If other administrators exist, one of them has to give you yours.">
              <GrantForm />
            </Panel>
          )}
          <DataTable
            caption="Active blue ticks"
            columns={["Member", "How", "Reason", "Given by", "Date", ""]}
            empty={rows.length === 0 && <EmptyRow>Nobody has a blue tick yet.</EmptyRow>}
          >
            {rows.map((t) => (
              <tr key={t.id} className="hover:bg-muted/40 align-top">
                <td className="px-4 py-3">
                  <Link href={`/u/${t.username}`} className="inline-flex items-center gap-1.5 font-semibold hover:underline">
                    {t.full_name} <BlueTick className="size-3.5" decorative />
                  </Link>
                  <p className="text-muted-foreground text-xs">@{t.username}</p>
                </td>
                <td className="px-4 py-3">{t.source === "purchase" ? "Bought and verified" : "Given free"}</td>
                <td className="max-w-64 px-4 py-3 break-words">{t.reason ?? "—"}</td>
                <td className="px-4 py-3">{t.granted_by_username ? `@${t.granted_by_username}` : "—"}</td>
                <td className="px-4 py-3 whitespace-nowrap">{fmtDateTime(t.created_at)}</td>
                <td className="px-4 py-3">{canManage && <RevokeButton userId={t.user_id} />}</td>
              </tr>
            ))}
          </DataTable>
        </div>
      ) : rows.length === 0 ? (
        <div className="surface"><EmptyRow>Nothing here.</EmptyRow></div>
      ) : (
        <ul className="space-y-4">
          {rows.map((a) => (
            <li key={a.id}>
              <Panel
                title={`${a.full_name} (@${a.username})`}
                description={`Paid ${a.amount_paise ? formatInr(a.amount_paise, { withZero: true }) : ""} · ${a.submitted_at ? `sent ${fmtDateTime(a.submitted_at)}` : `applied ${fmtDateTime(a.created_at)}`}`}
                actions={<StatusBadge value={a.status} />}
              >
                <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  <div><dt className="eyebrow">Name on their profile</dt><dd className="font-semibold">{a.full_name}</dd></div>
                  <div><dt className="eyebrow">Times sent back</dt><dd>{a.attempts}</dd></div>
                  {a.document_file_id && (
                    <div className="sm:col-span-2">
                      <dt className="eyebrow">Document</dt>
                      <dd>
                        <a href={`/api/files/${a.document_file_id}`} target="_blank" rel="noopener noreferrer" className="text-blue-text font-semibold hover:underline">
                          Open the Aadhaar document (opens in a new tab)
                        </a>
                        <p className="text-muted-foreground mt-1 text-xs">Check that the name and photo match. Do not copy or share it; it is deleted when you decide.</p>
                      </dd>
                    </div>
                  )}
                  {a.rejection_reason && <div className="sm:col-span-2"><dt className="eyebrow">Last message to the member</dt><dd className="break-words whitespace-pre-wrap">{a.rejection_reason}</dd></div>}
                </dl>
                {a.status === "pending_review" && <ReviewActions id={a.id} orderId={a.order_id} canManage={canManage} />}
              </Panel>
            </li>
          ))}
        </ul>
      )}
      <Pager basePath="/admin/blue-tick" page={page} total={total} params={{ status: view }} />
    </>
  );
}
