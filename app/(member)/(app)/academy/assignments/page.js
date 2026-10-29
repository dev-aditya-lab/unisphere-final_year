import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SubmissionForm } from "@/components/academy/learn/submission-form";
import { EmptyBlock } from "@/components/academy/ui/section";
import { requireProfile } from "@/lib/auth/session";
import { getAssignmentsForMe } from "@/lib/services/academy";

export const metadata = { title: "Assignments" };

const when = (iso) => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(iso));

function state(a) {
  const last = a.submissions.at(-1);
  if (last?.passed) return { label: `Passed · ${last.score_pct}%`, variant: "success" };
  if (last?.status === "submitted") return { label: "Waiting for review", variant: "info" };
  if (last?.status === "returned") return { label: "Sent back", variant: "warning" };
  if (last) return { label: `Not passed · ${last.score_pct}%`, variant: "warning" };
  if (a.due_at && new Date(a.due_at) < new Date()) return { label: a.allow_late ? "Overdue" : "Closed", variant: "danger" };
  return { label: "Not started", variant: "soft" };
}

export default async function AssignmentsPage() {
  const { user } = await requireProfile();
  const list = await getAssignmentsForMe(user.id);
  return (
    <div className="space-y-6 py-8">
      <header><h1 className="font-heading text-3xl font-extrabold">Assignments</h1><p className="text-muted-foreground mt-1">Hand in work for your courses and read your mentors&apos; feedback.</p></header>
      {list.length === 0 ? (
        <EmptyBlock title="No assignments yet">Assignments from the courses you are enrolled in appear here.</EmptyBlock>
      ) : (
        <ul className="space-y-4">
          {list.map((a) => {
            const s = state(a);
            const last = a.submissions.at(-1);
            const canSubmit = !last?.passed && last?.status !== "submitted" && a.submissions.length < a.max_attempts && (a.submissions.length === 0 || a.allow_resubmission || last?.status === "returned") && !(a.due_at && new Date(a.due_at) < new Date() && !a.allow_late);
            return (
              <li key={a.id} className="ac-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><p className="text-muted-foreground font-mono text-xs">{a.course?.code}</p><h2 className="text-lg font-bold">{a.title}</h2><p className="text-muted-foreground text-sm">{a.course?.title}{a.due_at ? ` · due ${when(a.due_at)}` : ""}</p></div>
                  <Badge variant={s.variant}>{s.label}</Badge>
                </div>
                {a.summary && <p className="text-muted-foreground mt-3 text-sm">{a.summary}</p>}
                {a.submissions.length > 0 && (
                  <ol className="mt-4 space-y-2">
                    {a.submissions.map((x) => (
                      <li key={x.id} className="bg-muted/60 rounded-lg p-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2"><strong>Attempt {x.attempt}</strong><span className="text-muted-foreground">{when(x.submitted_at)}{x.is_late ? " · late" : ""}</span>{x.status === "graded" && <Badge variant={x.passed ? "success" : "warning"}>{x.score_pct}%</Badge>}</div>
                        {x.rubric_scores && a.rubric.length > 0 && <p className="text-muted-foreground mt-1 text-xs">{a.rubric.map((r) => `${r.label} ${x.rubric_scores[r.key] ?? 0}/${r.max}`).join(" · ")}</p>}
                        {x.feedback && <p className="mt-2 whitespace-pre-wrap">{x.feedback}</p>}
                      </li>
                    ))}
                  </ol>
                )}
                {canSubmit && (
                  <details className="mt-4"><summary className="text-primary-text cursor-pointer text-sm font-semibold">{a.submissions.length ? "Submit again" : "Submit your work"}</summary><div className="mt-4"><SubmissionForm assignment={a} /></div></details>
                )}
                <p className="mt-3 text-xs"><Link href={`/academy/learn/${a.course_id}`} className="text-primary-text underline">Open the course</Link></p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
