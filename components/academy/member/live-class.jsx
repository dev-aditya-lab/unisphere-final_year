import Link from "next/link";
import { CalendarClock, Radio, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { STAGE_LABEL, canJoin, sessionStage, startsIn } from "@/lib/academy/live";

const when = (iso) => new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(iso));
const STAGE_BADGE = { live: "success", soon: "warning", today: "default", upcoming: "mono", ended: "mono", cancelled: "mono" };

/** The Join button: a link through our own route, which records the join and sends the person to the meeting. */
export function JoinButton({ session, now, size = "sm", className }) {
  const open = canJoin(session, now);
  const stage = sessionStage(session, now);
  if (stage === "cancelled" || stage === "ended") return null;
  return open ? (
    <Button asChild size={size} className={className}>
      <a href={`/api/academy/live/${session.id}/join`} target="_blank" rel="noopener noreferrer"><Video aria-hidden />{stage === "live" ? "Join now" : "Join"}</a>
    </Button>
  ) : (
    <Button size={size} variant="outline" disabled className={className} title="The link opens an hour before the class">Opens {startsIn(new Date(new Date(session.starts_at).getTime() - 3600_000).toISOString(), now)}</Button>
  );
}

/** One class as a row: what it is, when, the stage, and the way in. `now` is passed in so a page shows one consistent moment. */
export function LiveClassRow({ session, now, showCourse = true }) {
  const stage = sessionStage(session, now);
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 font-semibold">{session.title}<Badge variant={STAGE_BADGE[stage]}>{stage === "live" && <Radio className="mr-1 size-3" aria-hidden />}{STAGE_LABEL[stage]}</Badge></p>
        <p className="text-muted-foreground mt-0.5">
          {showCourse && session.course?.title ? `${session.course.title} · ` : ""}
          <time dateTime={session.starts_at}>{when(session.starts_at)} IST</time>
          {session.instructor?.display_name ? ` · with ${session.instructor.display_name}` : ""}
        </p>
        {stage !== "live" && stage !== "ended" && stage !== "cancelled" && <p className="text-muted-foreground text-xs">Starts {startsIn(session.starts_at, now)}</p>}
      </div>
      <JoinButton session={session} now={now} />
    </li>
  );
}

/** The big card at the top of the dashboard for a class that is on now or about to start. */
export function NowCard({ session, now }) {
  const stage = sessionStage(session, now);
  return (
    <section aria-label="Live class" className="ac-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: "var(--primary)" }}>
      <div className="flex items-start gap-3">
        <span className="bg-primary text-primary-foreground grid size-11 shrink-0 place-items-center rounded-full"><CalendarClock className="size-5" aria-hidden /></span>
        <div>
          <p className="ac-kicker">{stage === "live" ? "Live now" : stage === "soon" ? "Starting soon" : "Next class"}</p>
          <h2 className="ac-display text-xl">{session.title}</h2>
          <p className="text-muted-foreground text-sm">{session.course?.title} · <time dateTime={session.starts_at}>{when(session.starts_at)} IST</time>{stage !== "live" ? ` · ${startsIn(session.starts_at, now)}` : ""}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <JoinButton session={session} now={now} size="lg" className="rounded-full" />
        <Button asChild variant="outline" size="lg" className="rounded-full"><Link href="/academy/schedule">My schedule</Link></Button>
      </div>
    </section>
  );
}
