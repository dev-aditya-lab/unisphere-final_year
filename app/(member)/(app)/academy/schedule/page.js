import Link from "next/link";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyBlock } from "@/components/academy/ui/section";
import { AutoRefresh } from "@/components/academy/member/auto-refresh";
import { JoinButton } from "@/components/academy/member/live-class";
import { Badge } from "@/components/ui/badge";
import { DELIVERY_MODES } from "@/lib/academy/constants";
import { STAGE_LABEL, buildWeek, nowMs, sessionStage } from "@/lib/academy/live";
import { clock } from "@/lib/academy/timetable";
import { requireProfile } from "@/lib/auth/session";
import { getSchedule } from "@/lib/services/academy";

export const metadata = { title: "My schedule" };
export const dynamic = "force-dynamic";

const dayLabel = (key) => new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${key}T00:00:00Z`));
const time = (hhmm) => clock(hhmm);

export default async function SchedulePage() {
  const { user } = await requireProfile();
  const { courses, sessions, deadlines } = await getSchedule(user.id);
  const now = nowMs();
  const week = buildWeek({ courses, sessions, deadlines, now });
  const todayKey = new Date(now + 5.5 * 3600_000).toISOString().slice(0, 10);
  const live = courses.filter((c) => c.delivery_mode !== "recorded");
  const later = sessions.filter((s) => new Date(s.ends_at).getTime() > now && !week.some((d) => d.items.some((i) => i.session?.id === s.id))).slice(0, 8);

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
      <AutoRefresh seconds={60} />
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-extrabold">My schedule</h1>
          <p className="text-muted-foreground mt-1">This week&apos;s classes, the repeating timetable of your courses and your deadlines. All times are India time.</p>
        </div>
        <Button asChild variant="outline" size="sm"><a href="/api/academy/schedule.ics"><Download aria-hidden />Add to my calendar</a></Button>
      </header>

      {courses.length === 0 ? (
        <EmptyBlock title="Nothing scheduled yet" action={<Button asChild><Link href="/academy/courses">Find a course</Link></Button>}>Enrol in a course and its classes, timetable and deadlines appear here.</EmptyBlock>
      ) : (
        <>
          <section aria-label="This week" className="grid gap-3 md:grid-cols-2">
            {week.map((d) => (
              <div key={d.key} className="ac-card p-4" style={d.key === todayKey ? { borderColor: "var(--primary)" } : undefined}>
                <h2 className="flex items-center justify-between text-sm font-bold">{dayLabel(d.key)}{d.key === todayKey && <Badge>Today</Badge>}</h2>
                {d.items.length === 0 ? <p className="text-muted-foreground mt-2 text-sm">Nothing scheduled.</p> : (
                  <ul className="mt-2 divide-y">
                    {d.items.map((i, n) => (
                      <li key={`${i.kind}-${i.title}-${n}`} className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="font-semibold">{i.title}{i.session && <Badge variant={sessionStage(i.session, now) === "live" ? "success" : "mono"} className="ml-2">{STAGE_LABEL[sessionStage(i.session, now)]}</Badge>}</p>
                          <p className="text-muted-foreground text-xs">
                            {time(i.start)}{i.end ? ` – ${time(i.end)}` : ""} · {i.kind === "weekly" ? "Every week" : i.kind === "deadline" ? "Deadline" : "Live class"}{i.course ? ` · ${i.course}` : ""}
                          </p>
                        </div>
                        {i.session ? <JoinButton session={i.session} now={now} /> : i.href ? <Link href={i.href} className="text-primary-text text-xs underline">Open</Link> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </section>

          {later.length > 0 && (
            <section aria-labelledby="later">
              <h2 id="later" className="ac-display text-2xl">Coming up</h2>
              <ul className="ac-card mt-3 divide-y px-4">
                {later.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                    <div><p className="font-semibold">{s.title}</p><p className="text-muted-foreground text-xs">{s.course?.title} · {new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(s.starts_at))}</p></div>
                    <JoinButton session={s} now={now} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="mine">
            <h2 id="mine" className="ac-display text-2xl">Your courses</h2>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {courses.map((c) => (
                <li key={c.id} className="ac-card p-4 text-sm">
                  <Link href={`/academy/learn/${c.id}`} className="font-semibold hover:underline">{c.title}</Link>
                  <p className="text-muted-foreground text-xs">{DELIVERY_MODES[c.delivery_mode]?.label ?? "Recorded"}{c.timetable?.length ? ` · ${c.timetable.length} class${c.timetable.length === 1 ? "" : "es"} a week` : ""}</p>
                </li>
              ))}
            </ul>
            {live.length > 0 && <p className="text-muted-foreground mt-3 text-xs">Live classes: Google Calendar invitations are emailed to you when a class is scheduled. The Join button here opens an hour before each class.</p>}
          </section>
        </>
      )}
    </div>
  );
}
