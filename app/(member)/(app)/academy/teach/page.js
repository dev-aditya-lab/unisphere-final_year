import Link from "next/link";
import { BookOpen, CalendarClock, ClipboardCheck, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyBlock } from "@/components/academy/ui/section";
import { AutoRefresh } from "@/components/academy/member/auto-refresh";
import { JoinButton } from "@/components/academy/member/live-class";
import { DELIVERY_MODES } from "@/lib/academy/constants";
import { STAGE_LABEL, nowMs, sessionStage, startsIn } from "@/lib/academy/live";
import { requireProfile } from "@/lib/auth/session";
import { getTeaching } from "@/lib/services/academy";

export const metadata = { title: "Teaching" };
export const dynamic = "force-dynamic";

const when = (iso) => new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(iso));

function Panel({ icon: Icon, title, href, hrefLabel = "All", children }) {
  return (
    <section className="ac-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="ac-display flex items-center gap-2 text-xl"><Icon className="text-primary-text size-5" aria-hidden />{title}</h2>
        {href && <Link href={href} className="text-primary-text text-sm underline-offset-4 hover:underline">{hrefLabel}</Link>}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** The instructor's own dashboard: what to teach next, what is waiting for them, and how their courses are doing. */
export default async function TeachPage() {
  await requireProfile();
  const t = await getTeaching();
  const now = nowMs();
  if (!t.teaches) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <EmptyBlock title="You are not teaching a course yet" action={<Button asChild variant="outline"><Link href="/academy/dashboard">Back to my learning</Link></Button>}>When an administrator adds you as a mentor or instructor on a course, your classes, your students and the work waiting for you appear here, and you are notified.</EmptyBlock>
      </div>
    );
  }
  const next = t.sessions[0];
  const students = t.courses.reduce((n, c) => n + Number(c.students), 0);
  const waiting = t.courses.reduce((n, c) => n + Number(c.waiting_review), 0);

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
      <AutoRefresh seconds={60} />
      <header>
        <p className="ac-kicker">Teaching</p>
        <h1 className="ac-display mt-2 text-[clamp(1.8rem,4vw,2.6rem)]">Your classes and students</h1>
      </header>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[["Courses", t.courses.length], ["Students", students], ["Work to review", waiting], ["Classes coming", t.sessions.length]].map(([label, n]) => (
          <div key={label} className="ac-card p-4"><dt className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{label}</dt><dd className="ac-display mt-1 text-3xl tabular-nums">{n}</dd></div>
        ))}
      </dl>

      {next && (
        <section aria-label="Next class" className="ac-card flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: "var(--primary)" }}>
          <div>
            <p className="ac-kicker">{sessionStage(next, now) === "live" ? "Live now" : "Your next class"}</p>
            <h2 className="ac-display text-xl">{next.title}</h2>
            <p className="text-muted-foreground text-sm">{next.course_title} · {when(next.starts_at)} IST{sessionStage(next, now) === "live" ? "" : ` · ${startsIn(next.starts_at, now)}`} · {next.joined} of {next.expected} joined</p>
          </div>
          <JoinButton session={next} now={now} size="lg" className="rounded-full" />
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel icon={CalendarClock} title="Upcoming classes">
          {t.sessions.length === 0 ? <p className="text-muted-foreground text-sm">No classes are scheduled. An administrator schedules them under Academy, Live classes.</p> : (
            <ul className="divide-y">
              {t.sessions.map((s) => (
                <li key={s.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
                  <div><p className="font-semibold">{s.title} <Badge variant={sessionStage(s, now) === "live" ? "success" : "mono"}>{STAGE_LABEL[sessionStage(s, now)]}</Badge></p><p className="text-muted-foreground text-xs">{s.course_title} · {when(s.starts_at)} IST · {s.expected} students expected</p></div>
                  <JoinButton session={s} now={now} />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel icon={ClipboardCheck} title="Work waiting for you" href="/admin/academy/assignments" hrefLabel="Review">
          {t.reviews.length === 0 ? <p className="text-muted-foreground text-sm">Nothing is waiting. You will be notified when a student hands in work.</p> : (
            <ul className="divide-y">
              {t.reviews.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                  <div><p className="font-semibold">{r.assignment}</p><p className="text-muted-foreground text-xs">{r.student} · {r.course_title}</p></div>
                  <time dateTime={r.submitted_at} className="text-muted-foreground shrink-0 text-xs">{r.late ? "Late · " : ""}{when(r.submitted_at)}</time>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel icon={BookOpen} title="Your courses">
          <ul className="divide-y">
            {t.courses.map((c) => (
              <li key={c.id} className="py-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2"><Link href={`/academy/learn/${c.id}`} className="font-semibold hover:underline">{c.title}</Link><span className="text-muted-foreground font-mono text-xs">{c.code}</span></div>
                <p className="text-muted-foreground text-xs">{DELIVERY_MODES[c.delivery_mode]?.label ?? "Recorded"} · {c.students} students ({c.completed} completed){c.waiting_review ? ` · ${c.waiting_review} to review` : ""}{c.next_class ? ` · next class ${when(c.next_class)}` : ""}</p>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel icon={UserPlus} title="New students">
          {t.new_students.length === 0 ? <p className="text-muted-foreground text-sm">No one has enrolled yet.</p> : (
            <ul className="divide-y">{t.new_students.map((s, i) => <li key={i} className="flex items-center justify-between gap-3 py-2.5 text-sm"><span><span className="font-semibold">{s.name}</span> <span className="text-muted-foreground text-xs">{s.course_title}</span></span><time dateTime={s.enrolled_at} className="text-muted-foreground text-xs">{when(s.enrolled_at)}</time></li>)}</ul>
          )}
        </Panel>

        <Panel icon={Users} title="Recent classes">
          {t.recent_sessions.length === 0 ? <p className="text-muted-foreground text-sm">Finished classes appear here with how many students joined.</p> : (
            <ul className="divide-y">{t.recent_sessions.map((s) => <li key={s.id} className="flex items-center justify-between gap-3 py-2.5 text-sm"><span><span className="font-semibold">{s.title}</span> <span className="text-muted-foreground text-xs">{s.course_title} · {when(s.starts_at)}</span></span><Badge variant="mono">{s.joined} / {s.expected} joined</Badge></li>)}</ul>
          )}
          <p className="text-muted-foreground mt-3 text-xs">&quot;Joined&quot; counts students who used the Join button here. It cannot see inside Google Meet.</p>
        </Panel>
      </div>
    </div>
  );
}
