import { PageHeader } from "@/components/shell/page-header";
import { DataTable, EmptyRow, FilterTabs, Pager, StatusBadge, fmtDate } from "@/components/admin/ui";
import { OrbitsAdminTabs } from "@/components/admin/orbits-tabs";
import { QuestionDialog } from "@/components/admin/orbits-admin";
import { CATEGORY_LABEL } from "@/lib/orbits/icons";
import { istToday } from "@/lib/orbits/question-draft";
import { getIntegrations } from "@/lib/env";
import { PAGE_SIZE, pageOffset, read } from "@/lib/services/admin";

export const metadata = { title: "Daily Challenge" };

const STATUSES = [
  { value: "all", label: "All" },
  { value: "draft", label: "Drafts" },
  { value: "scheduled", label: "Scheduled" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];
const BADGE = { draft: "new", scheduled: "pending", published: "published", archived: "cancelled" };

export default async function AdminQuestionsPage({ searchParams }) {
  const sp = await searchParams;
  const status = STATUSES.some((s) => s.value === sp.status) ? sp.status : "all";
  const page = Math.max(1, Number(sp.page) || 1);
  const rows = await read("orbit_admin_questions", { p_status: status === "all" ? null : status, p_limit: PAGE_SIZE, p_offset: pageOffset(page) });
  const total = Number(rows[0]?.total_count ?? 0);
  const aiDraft = getIntegrations().nvidia;
  const today = istToday();

  return (
    <>
      <PageHeader
        eyebrow="Insights & system"
        title="Daily Challenge"
        description="One question per day for everyone. Members never see the answer key before they answer. Check each answer yourself before scheduling."
        actions={
          <div className="flex flex-wrap gap-2">
            {aiDraft && <QuestionDialog label="Generate with AI" variant="secondary" aiDraft autoDraft />}
            <QuestionDialog label="New question" variant="default" aiDraft={aiDraft} />
          </div>
        }
      />
      <OrbitsAdminTabs current="/admin/orbits/questions" />
      <FilterTabs label="Status" basePath="/admin/orbits/questions" param="status" current={status} options={STATUSES} />
      <DataTable caption="Daily questions" columns={["Date (IST)", "Question", "Category", "Status", "Answers", "Correct", ""]} empty={rows.length === 0 && <EmptyRow>No questions here. Add the first one.</EmptyRow>}>
        {rows.map((q) => (
          <tr key={q.id}>
            <td className="px-4 py-3 whitespace-nowrap">{fmtDate(q.publish_date)}</td>
            <td className="max-w-md px-4 py-3">
              <p className="line-clamp-2 font-medium">{q.question}</p>
              {q.source === "ai_draft" && <p className="text-muted-foreground text-xs">Started from an AI draft{q.reviewed_at ? ", reviewed" : ", not yet reviewed"}</p>}
              {q.source === "ai_draft" && q.status === "draft" && q.publish_date >= today && <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Goes live at 2:00 AM IST on {fmtDate(q.publish_date)} unless you approve or archive it.</p>}
            </td>
            <td className="text-muted-foreground px-4 py-3">{CATEGORY_LABEL[q.category] ?? q.category}</td>
            <td className="px-4 py-3">
              <StatusBadge value={BADGE[q.status]} className="capitalize" />
              <span className="sr-only"> {q.status}</span>
            </td>
            <td className="px-4 py-3 tabular-nums">{Number(q.answers)}</td>
            <td className="px-4 py-3 tabular-nums">{Number(q.answers) ? `${Math.round((Number(q.correct) / Number(q.answers)) * 100)}%` : "—"}</td>
            <td className="px-4 py-3 text-right">
              <QuestionDialog question={q} label="Edit" />
            </td>
          </tr>
        ))}
      </DataTable>
      <Pager basePath="/admin/orbits/questions" page={page} total={total} params={{ status: status === "all" ? null : status }} />
    </>
  );
}
