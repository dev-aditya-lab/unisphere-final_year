import Link from "next/link";
import { Check, Circle } from "lucide-react";
import { ProgressBar } from "@/components/academy/ui/progress";
import { ConsentButton } from "@/components/academy/commerce/student-actions";

/**
 * What stands between a student and a certificate, one checklist per course. Each line comes from the same completion check the
 * database uses to issue it, so the list cannot disagree with what actually happens.
 */
export function CertificateProgress({ items, compact = false }) {
  if (!items.length) return null;
  return (
    <ul className="space-y-4">
      {items.map((it) => {
        const s = it.state ?? {};
        const missing = new Set(s.missing ?? []);
        const manual = Boolean(s.manual_approval);
        const steps = [
          { done: !missing.has("lessons"), text: `Finish the lessons (${s.lessons_done ?? 0} of ${s.lessons_total ?? 0})` },
          ...((s.assignments_required ?? 0) > 0 ? [{ done: !missing.has("assignments"), text: `Pass the required assignments (${s.assignments_passed ?? 0} of ${s.assignments_required})` }] : []),
          ...(missing.has("score") ? [{ done: false, text: `Reach the average score the course asks for${s.avg_score_pct != null ? ` (you are at ${s.avg_score_pct}%)` : ""}` }] : []),
          { done: it.consent, text: "Agree to show your name on the public verification page", action: !it.consent ? <ConsentButton enrollmentId={it.enrollment_id} /> : null },
          ...(manual ? [{ done: it.approved, text: "A mentor approves your certificate" }] : []),
        ];
        const eligible = Boolean(s.eligible);
        const pending = it.certificate === "pending" || it.certificate === "failed";
        const finished = steps.every((x) => x.done);
        return (
          <li key={it.enrollment_id} className="ac-card p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Link href={`/academy/learn/${it.course_id}`} className="font-semibold hover:underline">{it.title}</Link>
              <span className="text-muted-foreground text-xs">{s.completion_pct ?? 0}% of lessons</span>
            </div>
            <ProgressBar value={s.completion_pct ?? 0} label={`${it.title} certificate progress`} className="mt-2" />
            {!compact && (
              <ul className="mt-3 space-y-1.5 text-sm">
                {steps.map((x) => (
                  <li key={x.text} className="flex items-center gap-2">
                    {x.done ? <Check className="size-4 shrink-0 text-[var(--success-text)]" aria-label="Done" /> : <Circle className="text-muted-foreground size-4 shrink-0" aria-label="Still to do" />}
                    <span className={x.done ? "text-muted-foreground" : ""}>{x.text}</span>
                    {x.action}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-muted-foreground mt-3 text-xs">
              {pending ? "Your certificate is being prepared." : finished && eligible ? "Everything is done. Your certificate is issued automatically and you will be notified." : "It is issued automatically as soon as every step above is done."}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
