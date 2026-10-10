import { PageHeader } from "@/components/shell/page-header";
import { EmptyRow, FilterTabs, Pager, Panel, StatusBadge, fmtDateTime } from "@/components/admin/ui";
import { SupportActions } from "@/components/admin/support-actions";
import { listContactMessages } from "@/lib/services/admin";

export const metadata = { title: "Support inbox" };

const VIEWS = [
  { value: "new", label: "New" },
  { value: "in_progress", label: "In progress" },
  { value: "resolved", label: "Resolved" },
  { value: "spam", label: "Spam" },
  { value: "all", label: "All" },
];

export default async function SupportPage({ searchParams }) {
  const sp = await searchParams;
  const status = VIEWS.some((v) => v.value === sp.status) ? sp.status : "new";
  const page = Math.max(1, Number(sp.page) || 1);
  const { rows, total } = await listContactMessages({ status, page });

  return (
    <>
      <PageHeader eyebrow="Review queues" title="Support inbox" description="Messages from the public contact form. Reply from your own mail client; mark them here so the team knows what is handled." />
      <FilterTabs label="Inbox views" basePath="/admin/support" current={status} options={VIEWS} />
      {rows.length === 0 ? (
        <div className="surface"><EmptyRow>Inbox zero.</EmptyRow></div>
      ) : (
        <ul className="space-y-3">
          {rows.map((m) => (
            <li key={m.id}>
              <Panel title={m.subject} description={`${m.name} · ${fmtDateTime(m.created_at)}`} actions={<StatusBadge value={m.status} />}>
                <p className="text-sm break-words whitespace-pre-wrap">{m.message}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <a href={`mailto:${encodeURIComponent(m.email)}?subject=${encodeURIComponent(`Re: ${m.subject}`)}`} className="text-blue-text text-sm font-semibold hover:underline">
                    Reply to {m.email}
                  </a>
                  <SupportActions id={m.id} status={m.status} />
                </div>
              </Panel>
            </li>
          ))}
        </ul>
      )}
      <Pager basePath="/admin/support" page={page} total={total} params={{ status }} />
    </>
  );
}
