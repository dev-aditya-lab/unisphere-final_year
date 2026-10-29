import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { CalendarClock, CheckCircle2, ClipboardCheck, Download, FileQuestion, FileText, Lock, Megaphone, PlayCircle, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/academy/ui/progress";
import { Markdown } from "@/components/academy/markdown";
import { VideoEmbed } from "@/components/academy/learn/video-embed";
import { QuizForm } from "@/components/academy/learn/quiz-form";
import { SubmissionForm } from "@/components/academy/learn/submission-form";
import { LessonControls } from "@/components/academy/learn/lesson-controls";
import { SessionButtons } from "@/components/academy/learn/session-buttons";
import { KINDS, LESSON_KINDS } from "@/lib/academy/constants";
import { requireProfile } from "@/lib/auth/session";
import { getLearnData } from "@/lib/services/academy";

export const metadata = { title: "Learn" };

const ICON = { video: Video, text: FileText, resource: Download, quiz: FileQuestion, assignment: ClipboardCheck };
const when = (iso) => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(iso));

function Syllabus({ data, courseId }) {
  const done = new Set(data.done);
  return (
    <nav aria-label="Course contents" className="space-y-5">
      {data.syllabus.map((m, i) => (
        <div key={m.id}>
          <h3 className="text-muted-foreground text-xs font-bold tracking-[0.12em] uppercase"><span className="mr-1.5 font-mono">{String(i + 1).padStart(2, "0")}</span>{m.title}</h3>
          <ul className="mt-2 space-y-0.5">
            {m.lessons.map((l) => {
              const Icon = ICON[l.kind] ?? PlayCircle;
              const current = l.id === data.current?.id;
              return (
                <li key={l.id}>
                  <Link href={`/academy/learn/${courseId}?lesson=${l.id}`} aria-current={current ? "page" : undefined} className={`flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${current ? "bg-primary-soft text-primary-text font-semibold" : "hover:bg-accent"}`}>
                    {done.has(l.id) ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--success-text)]" aria-label="Completed" /> : <Icon className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />}
                    <span className="min-w-0 flex-1">{l.title}</span>
                    {l.duration_minutes ? <span className="text-muted-foreground shrink-0 text-xs">{l.duration_minutes}m</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export default async function LearnPage({ params, searchParams }) {
  const { user } = await requireProfile();
  const { courseId } = await params;
  const sp = await searchParams;
  if (!z.uuid().safeParse(courseId).success) notFound();
  const lessonId = z.uuid().safeParse(sp.lesson).success ? sp.lesson : null;
  const data = await getLearnData(user.id, courseId, lessonId);
  if (!data) notFound();

  const { course, enrollment } = data;
  const open = enrollment && ["active", "completed"].includes(enrollment.status) && (!enrollment.access_expires_at || new Date(enrollment.access_expires_at) > new Date());
  // Staff can preview a course they can see; everyone else needs a valid enrolment. The database refuses the lesson text otherwise.
  const previewing = !open && data.current && data.content !== null;
  if (!open && !previewing) {
    const why = enrollment?.status === "suspended" ? "Your access to this course is paused. Please contact support." : enrollment?.status === "expired" ? "Your access period has ended." : enrollment?.status === "refunded" ? "This enrolment was refunded, so access has ended." : enrollment?.status === "revoked" ? "Your access to this course was removed." : "You are not enrolled in this course.";
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <Lock className="text-muted-foreground mx-auto size-8" aria-hidden />
        <h1 className="ac-display mt-4 text-3xl">{course.title}</h1>
        <p className="text-muted-foreground mt-2">{why}</p>
        <div className="mt-6 flex justify-center gap-3"><Button asChild><Link href={`${KINDS[course.kind].path}/${course.slug}`}>View the course</Link></Button><Button asChild variant="outline"><Link href="/academy/my-learning">My learning</Link></Button></div>
      </div>
    );
  }

  const lesson = data.current;
  const done = data.done.includes(lesson?.id);
  const pct = data.state?.completion_pct ?? 0;
  const latest = data.submissions.at(-1);
  const canResubmit = data.assignment && (!latest || (latest.status !== "submitted" && !latest.passed && data.submissions.length < data.assignment.max_attempts && (data.assignment.allow_resubmission || latest.status === "returned")));
  const upcoming = data.sessions.filter((s) => s.status === "scheduled" && new Date(s.ends_at) > new Date()).reverse();
  const past = data.sessions.filter((s) => s.recording_available);

  return (
    <div className="mx-auto grid max-w-[88rem] gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[19rem_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-y-auto">
        <details className="ac-card p-4 lg:contents" open>
          <summary className="cursor-pointer list-none lg:hidden"><span className="ac-display text-lg">Course contents</span></summary>
          <div className="lg:ac-card lg:p-4">
            <p className="text-muted-foreground font-mono text-xs">{course.code}</p>
            <h2 className="ac-display mt-1 text-xl leading-tight">{course.title}</h2>
            <div className="mt-3"><ProgressBar value={pct} label="Course progress" /><p className="text-muted-foreground mt-1.5 text-xs">{data.state?.lessons_done ?? 0} of {data.state?.lessons_total ?? 0} lessons · {pct}%</p></div>
            <div className="mt-5"><Syllabus data={data} courseId={course.id} /></div>
          </div>
        </details>
      </aside>

      <article className="min-w-0 pb-16">
        {previewing && <p role="status" className="bg-muted mb-4 rounded-lg px-3 py-2 text-sm">Preview: you are not enrolled in this course, so only preview lessons open.</p>}
        {data.state?.eligible && enrollment?.status === "completed" && (
          <div role="status" className="bg-success-soft mb-5 flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 text-sm text-[var(--success-text)]">
            <CheckCircle2 className="size-5" aria-hidden /><span className="font-semibold">You completed this course.</span>
            <Link href="/academy/certificates" className="ml-auto underline">See your certificate</Link>
          </div>
        )}
        {!lesson ? (
          <div className="ac-card p-10 text-center"><p className="ac-display text-2xl">No lessons yet</p><p className="text-muted-foreground mt-2 text-sm">The lessons for this course have not been added yet.</p></div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2"><Badge variant="soft">{LESSON_KINDS[lesson.kind]}</Badge>{lesson.duration_minutes ? <span className="text-muted-foreground text-xs">{lesson.duration_minutes} min</span> : null}{done && <Badge variant="success">Complete</Badge>}</div>
            <h1 className="ac-display mt-3 text-[clamp(1.8rem,3.5vw,2.6rem)]">{lesson.title}</h1>

            <div className="mt-6 space-y-6">
              {data.content?.video_ref && <VideoEmbed provider={data.content.video_provider} videoRef={data.content.video_ref} title={lesson.title} />}
              {data.content?.body_md && <Markdown>{data.content.body_md}</Markdown>}
              {!data.content && lesson.kind !== "quiz" && lesson.kind !== "assignment" && <p className="text-muted-foreground text-sm">This lesson has no content yet.</p>}

              {lesson.kind === "quiz" && <section aria-label="Quiz" className="ac-card p-5"><QuizForm lessonId={lesson.id} questions={data.questions} passPct={lesson.pass_pct} last={data.lastAttempt} /></section>}

              {lesson.kind === "assignment" && (
                data.assignment ? (
                  <section aria-label="Assignment" className="space-y-5">
                    <div className="ac-card p-5">
                      <h2 className="ac-display text-xl">{data.assignment.title}</h2>
                      <p className="text-muted-foreground mt-1 text-sm">Out of {data.assignment.max_score}, pass at {data.assignment.pass_pct}%{data.assignment.due_at ? ` · due ${when(data.assignment.due_at)}` : ""}{data.assignment.max_attempts > 1 ? ` · up to ${data.assignment.max_attempts} attempts` : ""}</p>
                      <Markdown className="mt-3">{data.assignment.instructions_md}</Markdown>
                      {data.assignment.rubric.length > 0 && (
                        <div className="mt-4"><p className="text-sm font-semibold">How it is scored</p><ul className="text-muted-foreground mt-1 space-y-1 text-sm">{data.assignment.rubric.map((r) => <li key={r.key}>{r.label} · {r.max} points</li>)}</ul></div>
                      )}
                    </div>
                    {data.submissions.length > 0 && (
                      <ol className="space-y-3">
                        {data.submissions.map((s) => (
                          <li key={s.id} className="ac-card p-4 text-sm">
                            <div className="flex flex-wrap items-center gap-2"><strong>Attempt {s.attempt}</strong><Badge variant={s.status === "submitted" ? "info" : s.passed ? "success" : "warning"}>{s.status === "submitted" ? "Waiting for review" : s.status === "returned" ? "Sent back" : s.passed ? `Passed · ${s.score_pct}%` : `Not passed · ${s.score_pct}%`}</Badge><span className="text-muted-foreground ml-auto text-xs">{when(s.submitted_at)}{s.is_late ? " · late" : ""}</span></div>
                            {s.feedback && <p className="bg-muted mt-3 rounded-lg p-3 whitespace-pre-wrap">{s.feedback}</p>}
                          </li>
                        ))}
                      </ol>
                    )}
                    {canResubmit ? <div className="ac-card p-5"><h3 className="ac-display text-lg">{data.submissions.length ? "Submit again" : "Submit your work"}</h3><div className="mt-4"><SubmissionForm assignment={data.assignment} /></div></div>
                      : latest?.status === "submitted" ? <p className="text-muted-foreground text-sm">Your mentor will review this and you will be notified.</p>
                      : latest?.passed ? null : <p className="text-muted-foreground text-sm">No more attempts are available for this assignment.</p>}
                  </section>
                ) : <p className="text-muted-foreground text-sm">This assignment has not been published yet.</p>
              )}

              {data.resources.length > 0 && (
                <section aria-label="Resources"><h2 className="ac-display text-xl">Resources</h2>
                  <ul className="mt-3 divide-y rounded-xl border">{data.resources.map((r) => <li key={r.id}><a href={`/api/files/${r.file_id}?download=1`} className="hover:bg-accent flex items-center gap-3 px-4 py-3 text-sm"><Download className="text-muted-foreground size-4" aria-hidden />{r.title}</a></li>)}</ul>
                </section>
              )}
            </div>

            <LessonControls courseId={course.id} lesson={lesson} done={done} prev={data.prev} next={data.next} />
          </>
        )}

        {(upcoming.length > 0 || past.length > 0) && (
          <section id="live" className="mt-12" aria-label="Live classes">
            <h2 className="ac-display flex items-center gap-2 text-2xl"><CalendarClock className="text-primary-text size-5" aria-hidden />Live classes</h2>
            <ul className="mt-4 space-y-3">
              {upcoming.map((s) => <li key={s.id} className="ac-card flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-semibold">{s.title}</p><time dateTime={s.starts_at} className="text-muted-foreground text-sm">{when(s.starts_at)}</time></div><SessionButtons sessionId={s.id} canRecording={false} /></li>)}
              {past.map((s) => <li key={s.id} className="ac-card flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-semibold">{s.title}</p><p className="text-muted-foreground text-sm">Recorded · {when(s.starts_at)}</p></div><SessionButtons sessionId={s.id} canRecording /></li>)}
            </ul>
          </section>
        )}

        {data.announcements.length > 0 && (
          <section className="mt-12" aria-label="Announcements"><h2 className="ac-display flex items-center gap-2 text-2xl"><Megaphone className="text-primary-text size-5" aria-hidden />Announcements</h2>
            <ul className="mt-4 space-y-3">{data.announcements.map((a) => <li key={a.id} className="ac-card p-4"><p className="font-semibold">{a.title}</p><p className="text-muted-foreground mt-1 text-sm whitespace-pre-wrap">{a.message}</p><p className="text-muted-foreground mt-2 text-xs">{when(a.created_at)}</p></li>)}</ul>
          </section>
        )}
      </article>
    </div>
  );
}
