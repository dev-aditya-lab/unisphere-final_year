import Link from "next/link";
import { ExternalLink, Paperclip } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyRow, FilterTabs, Pager, Panel, fmtDateTime } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { GradeForm } from "@/components/academy/admin/staff-tools";
import { PAGE_SIZE } from "@/lib/admin/paging";
import { needAcademy, offset, rows } from "@/lib/services/academy-admin";

export const metadata = { title: "Academy grading" };

const VIEWS = [{ value: "submitted", label: "Waiting" }, { value: "graded", label: "Graded" }, { value: "returned", label: "Sent back" }];

export default async function GradingQueue({ searchParams }) {
  await needAcademy("academy.assignments.review");
  const sp = await searchParams;
  const status = VIEWS.some((v) => v.value === sp.status) ? sp.status : "submitted";
  const page = Math.max(1, Number(sp.page) || 1);
  const list = await rows("academy_review_queue", { p_status: status, p_limit: PAGE_SIZE, p_offset: offset(page) });
  const total = Number(list[0]?.total_count ?? 0);

  return (
    <>
      <PageHeader eyebrow="Academy" title="Grading" description="Submissions from the courses you teach (or all courses, if you manage them). Scores follow the assignment's rubric; the student is told as soon as you save." />
      <FilterTabs label="Queue" basePath="/admin/academy/assignments" current={status} options={VIEWS} />
      {list.length === 0 ? <Panel><EmptyRow>{status === "submitted" ? "Nothing is waiting for you." : "Nothing here."}</EmptyRow></Panel> : (
        <ul className="space-y-4">
          {list.map((s) => (
            <li key={s.id} className="surface p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-muted-foreground font-mono text-xs">{s.course_code}</p>
                  <h2 className="font-heading text-base font-bold">{s.assignment_title}</h2>
                  <p className="text-sm"><Link href={`/u/${s.username}`} className="font-semibold hover:underline">{s.full_name}</Link> · attempt {s.attempt} · {fmtDateTime(s.submitted_at)}{s.is_late && <Badge variant="warning" className="ml-2">late</Badge>}</p>
                </div>
                {s.status === "graded" && <Badge variant={s.passed ? "success" : "warning"}>{s.score}/{s.max_score} · {s.score_pct}%</Badge>}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                {s.repo_url && <a href={s.repo_url} target="_blank" rel="noopener noreferrer nofollow ugc" className="text-primary-text inline-flex items-center gap-1 underline">Repository<ExternalLink className="size-3.5" aria-hidden /></a>}
                {s.demo_url && <a href={s.demo_url} target="_blank" rel="noopener noreferrer nofollow ugc" className="text-primary-text inline-flex items-center gap-1 underline">Live demo<ExternalLink className="size-3.5" aria-hidden /></a>}
                {s.file_id && <a href={`/api/files/${s.file_id}?download=1`} className="text-primary-text inline-flex items-center gap-1 underline"><Paperclip className="size-3.5" aria-hidden />File</a>}
              </div>
              {s.notes && <p className="bg-muted/60 mt-3 rounded-md p-3 text-sm whitespace-pre-wrap">{s.notes}</p>}
              <div className="mt-4 border-t pt-4"><GradeForm submission={s} /></div>
            </li>
          ))}
        </ul>
      )}
      <Pager basePath="/admin/academy/assignments" page={page} total={total} params={{ status }} />
    </>
  );
}
