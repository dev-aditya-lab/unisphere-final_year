import Link from "next/link";
import { Award, CalendarClock, ClipboardList, Megaphone, PlayCircle, Receipt, Sparkles, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/academy/ui/progress";
import { CourseCard } from "@/components/academy/ui/course-card";
import { EmptyBlock } from "@/components/academy/ui/section";
import { RevealGroup, RevealItem } from "@/components/academy/ui/reveal";
import { formatMoney } from "@/lib/academy/money";
import { ORDER_STATUSES } from "@/lib/academy/constants";
import { requireProfile } from "@/lib/auth/session";
import { getCertificateProgress, getDashboard } from "@/lib/services/academy";
import { AutoRefresh } from "@/components/academy/member/auto-refresh";
import { LiveClassRow, NowCard } from "@/components/academy/member/live-class";
import { CertificateProgress } from "@/components/academy/member/certificate-progress";
import { canJoin, nowMs, sessionStage } from "@/lib/academy/live";

export const metadata = { title: "Your learning" };

const when = (iso) => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(iso));
const pct = (p) => (p.total ? Math.floor((p.done * 100) / p.total) : 0);

function Panel({ icon: Icon, title, href, children }) {
  return (
    <section className="ac-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="ac-display flex items-center gap-2 text-xl"><Icon className="text-primary-text size-5" aria-hidden />{title}</h2>
        {href && <Link href={href} className="text-primary-text text-sm underline-offset-4 hover:underline">All</Link>}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

const CLASS_NOTE = {
  not_open: "That class link is not open yet. It opens an hour before the start.",
  not_allowed: "You are not enrolled in that class.",
  slow_down: "Too many tries. Please wait a moment.",
  not_found: "That class was not found.",
};

export default async function Dashboard({ searchParams }) {
  const { user, profile } = await requireProfile();
  const sp = await searchParams;
  const [d, certProgress] = await Promise.all([getDashboard(user.id), getCertificateProgress()]);
  const now = nowMs();
  const nowCard = d.sessions.find((s) => sessionStage(s, now) === "live") ?? d.sessions.find((s) => canJoin(s, now) || sessionStage(s, now) === "today");
  const first = String(profile.full_name ?? "").split(" ")[0] || "there";
  const inProgress = d.active.filter((e) => e.status === "active");
  const graded = d.assignments.flatMap((a) => a.submissions.filter((s) => s.status === "graded").map((s) => ({ ...s, assignment: a }))).sort((a, b) => new Date(b.graded_at) - new Date(a.graded_at)).slice(0, 4);
  const issued = d.certificates.filter((c) => c.status === "issued");

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-10 sm:px-6">
      <header className="ac-stagger">
        <p className="ac-kicker" style={{ "--i": 0 }}>Your learning</p>
        <h1 className="ac-display mt-3 text-[clamp(2rem,4vw,3rem)]" style={{ "--i": 1 }}>Welcome back, {first}</h1>
      </header>
      <AutoRefresh seconds={60} />
      {typeof sp?.class === "string" && CLASS_NOTE[sp.class] && <p role="status" className="bg-muted rounded-lg px-4 py-3 text-sm">{CLASS_NOTE[sp.class]}</p>}
      {nowCard && <NowCard session={nowCard} now={now} />}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[["In progress", inProgress.length], ["Due soon", d.due.length], ["Completed", d.enrollments.filter((e) => e.status === "completed").length], ["Certificates", issued.length]].map(([label, n]) => (
          <div key={label} className="ac-card p-4"><dt className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{label}</dt><dd className="ac-display mt-1 text-3xl tabular-nums">{n}</dd></div>
        ))}
      </dl>

      <section aria-labelledby="continue">
        <h2 id="continue" className="ac-display text-2xl">Continue learning</h2>
        {inProgress.length === 0 ? (
          <EmptyBlock className="mt-4" title="Nothing in progress" action={<Button asChild><Link href="/academy/courses">Find a course</Link></Button>}>Enrol in a course and it appears here, with a button to pick up where you stopped.</EmptyBlock>
        ) : (
          <RevealGroup className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {inProgress.slice(0, 3).map((e) => (
              <RevealItem key={e.id}>
                <div className="ac-card ac-card-hover flex h-full flex-col gap-4 p-5">
                  <div><p className="text-muted-foreground font-mono text-xs">{e.course.code}</p><h3 className="ac-display mt-1 text-xl">{e.course.title}</h3></div>
                  <div><ProgressBar value={pct(e.progress)} label={`${e.course.title} progress`} /><p className="text-muted-foreground mt-2 text-xs">{e.progress.done} of {e.progress.total} lessons · {pct(e.progress)}%</p></div>
                  <Button asChild className="mt-auto rounded-full"><Link href={`/academy/learn/${e.course.id}`}><PlayCircle aria-hidden />Continue</Link></Button>
                </div>
              </RevealItem>
            ))}
          </RevealGroup>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel icon={CalendarClock} title="Live classes" href="/academy/schedule" hrefLabel="My schedule">
          {d.sessions.length === 0 ? <p className="text-muted-foreground text-sm">No live classes are scheduled for your courses. When one is, you are notified and it shows here.</p> : (
            <ul className="divide-y">{d.sessions.map((s) => <LiveClassRow key={s.id} session={s} now={now} />)}</ul>
          )}
        </Panel>

        <Panel icon={ClipboardList} title="Assignment deadlines" href="/academy/assignments">
          {d.due.length === 0 ? <p className="text-muted-foreground text-sm">Nothing is due. Nice.</p> : (
            <ul className="divide-y">{d.due.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-3 py-3 text-sm"><div><p className="font-semibold">{a.title}</p><p className="text-muted-foreground">{a.course?.title}</p></div><time dateTime={a.due_at} className={`shrink-0 text-right text-xs ${new Date(a.due_at) < new Date() ? "text-destructive-text font-semibold" : "text-muted-foreground"}`}>{new Date(a.due_at) < new Date() ? "Overdue · " : "Due "}{when(a.due_at)}</time></li>
            ))}</ul>
          )}
        </Panel>

        <Panel icon={Trophy} title="Recent results" href="/academy/assignments">
          {graded.length === 0 ? <p className="text-muted-foreground text-sm">Your graded work shows up here.</p> : (
            <ul className="divide-y">{graded.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-3 text-sm"><div><p className="font-semibold">{s.assignment.title}</p><p className="text-muted-foreground">Attempt {s.attempt}</p></div><Badge variant={s.passed ? "success" : "warning"}>{s.score_pct}% · {s.passed ? "Passed" : "Not yet"}</Badge></li>
            ))}</ul>
          )}
        </Panel>

        <Panel icon={Award} title="Certificates" href="/academy/certificates">
          {certProgress.length > 0 && <div className="mb-4"><p className="mb-2 text-xs font-semibold tracking-wide uppercase">Coming up</p><CertificateProgress items={certProgress.slice(0, 2)} compact /></div>}
          {issued.length === 0 && certProgress.length > 0 ? null : issued.length === 0 ? <p className="text-muted-foreground text-sm">Finish a course and its certificate is issued here, with a link anyone can use to verify it.</p> : (
            <ul className="divide-y">{issued.slice(0, 3).map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-3 text-sm"><div><p className="font-semibold">{c.snapshot?.course_title}</p><p className="text-muted-foreground font-mono text-xs">{c.certificate_id}</p></div><Link className="text-primary-text underline" href={`/academy/verify/${c.certificate_id}`}>Verify</Link></li>
            ))}</ul>
          )}
        </Panel>

        <Panel icon={Megaphone} title="Announcements">
          {d.announcements.length === 0 ? <p className="text-muted-foreground text-sm">No announcements.</p> : (
            <ul className="divide-y">{d.announcements.map((a) => (
              <li key={a.id} className="py-3 text-sm"><p className="font-semibold">{a.title}</p><p className="text-muted-foreground mt-0.5 line-clamp-2">{a.message}</p><p className="text-muted-foreground mt-1 text-xs">{a.course?.title ?? "All students"} · {when(a.created_at)}</p></li>
            ))}</ul>
          )}
        </Panel>

        <Panel icon={Receipt} title="Recent purchases" href="/academy/payments">
          {d.orders.length === 0 ? <p className="text-muted-foreground text-sm">You have not bought anything yet.</p> : (
            <ul className="divide-y">{d.orders.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 py-3 text-sm"><div><p className="font-semibold">{o.items?.[0]?.title ?? "Order"}</p><p className="text-muted-foreground font-mono text-xs">{o.order_no}</p></div><div className="text-right"><p className="tabular-nums">{formatMoney(o.total_minor, { withZero: true })}</p><p className="text-muted-foreground text-xs">{ORDER_STATUSES[o.status]}</p></div></li>
            ))}</ul>
          )}
        </Panel>
      </div>

      {d.recommended.length > 0 && (
        <section aria-labelledby="next">
          <h2 id="next" className="ac-display flex items-center gap-2 text-2xl"><Sparkles className="text-primary-text size-5" aria-hidden />Next steps</h2>
          <p className="text-muted-foreground mt-1 text-sm">Based on the subjects you are studying.</p>
          <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{d.recommended.map((c) => <CourseCard key={c.id} course={c} price={d.prices[c.id]} />)}</div>
        </section>
      )}
    </div>
  );
}
