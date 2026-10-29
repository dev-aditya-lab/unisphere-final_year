import Link from "next/link";
import { PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProgressRing } from "@/components/academy/ui/progress";
import { CourseCover } from "@/components/academy/ui/course-cover";
import { EmptyBlock } from "@/components/academy/ui/section";
import { RevealGroup, RevealItem } from "@/components/academy/ui/reveal";
import { ENROLLMENT_STATUSES, KINDS } from "@/lib/academy/constants";
import { requireProfile } from "@/lib/auth/session";
import { getMyEnrollments } from "@/lib/services/academy";

export const metadata = { title: "My learning" };

const VIEWS = [["active", "In progress"], ["completed", "Completed"], ["ended", "Ended"]];
const pct = (p) => (p.total ? Math.floor((p.done * 100) / p.total) : 0);

export default async function MyLearning({ searchParams }) {
  const { user } = await requireProfile();
  const sp = await searchParams;
  const view = VIEWS.some(([v]) => v === sp.view) ? sp.view : "active";
  const all = await getMyEnrollments(user.id);
  const groups = { active: all.filter((e) => ["active", "suspended"].includes(e.status)), completed: all.filter((e) => e.status === "completed"), ended: all.filter((e) => ["expired", "revoked", "refunded"].includes(e.status)) };
  const list = groups[view];

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6">
      <header><p className="ac-kicker">My learning</p><h1 className="ac-display mt-3 text-4xl">Courses, programs and internships</h1></header>

      {sp.welcome === "1" && (
        <div role="status" className="bg-success-soft flex items-start gap-3 rounded-xl px-4 py-3 text-[var(--success-text)]">
          <PartyPopper className="mt-0.5 size-5 shrink-0" aria-hidden /><p className="text-sm font-medium">You are enrolled. Open it below and start with the first lesson.</p>
        </div>
      )}

      <div role="tablist" aria-label="Filter" className="bg-muted inline-flex rounded-full p-1">
        {VIEWS.map(([v, label]) => (
          <Link key={v} role="tab" aria-selected={view === v} href={v === "active" ? "/academy/my-learning" : `/academy/my-learning?view=${v}`} className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${view === v ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {label} <span className="text-muted-foreground text-xs">{groups[v].length}</span>
          </Link>
        ))}
      </div>

      {list.length === 0 ? (
        <EmptyBlock title={view === "active" ? "Nothing in progress" : view === "completed" ? "No completed courses yet" : "Nothing here"} action={view === "active" ? <Button asChild><Link href="/academy/courses">Browse courses</Link></Button> : undefined}>
          {view === "active" ? "When you enrol, your course appears here." : view === "completed" ? "Finish a course and it moves here." : "Courses whose access has ended appear here."}
        </EmptyBlock>
      ) : (
        <RevealGroup className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" key={view}>
          {list.map((e) => (
            <RevealItem key={e.id}>
              <article className="ac-card ac-card-hover flex h-full flex-col overflow-hidden">
                <CourseCover course={e.course} />
                <div className="flex flex-1 flex-col gap-3 p-5">
                  <div className="flex flex-wrap items-center gap-2"><span className="ac-chip">{KINDS[e.course.kind]?.label}</span><Badge variant={e.status === "completed" ? "success" : e.status === "active" ? "soft" : "warning"}>{ENROLLMENT_STATUSES[e.status]}</Badge></div>
                  <h2 className="ac-display text-xl leading-tight">{e.course.title}</h2>
                  <div className="flex items-center gap-4">
                    <ProgressRing value={pct(e.progress)} size={56} stroke={5} />
                    <p className="text-muted-foreground text-sm">{e.progress.done} of {e.progress.total} lessons{e.access_expires_at && <><br />Access until {new Date(e.access_expires_at).toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" })}</>}</p>
                  </div>
                  {e.hasAccess ? <Button asChild className="mt-auto rounded-full"><Link href={`/academy/learn/${e.course.id}`}>{e.status === "completed" ? "Review course" : "Continue"}</Link></Button>
                    : <Button asChild variant="outline" className="mt-auto rounded-full"><Link href={`${KINDS[e.course.kind]?.path}/${e.course.slug}`}>{e.status === "suspended" ? "Access paused" : "View course"}</Link></Button>}
                </div>
              </article>
            </RevealItem>
          ))}
        </RevealGroup>
      )}
    </div>
  );
}
