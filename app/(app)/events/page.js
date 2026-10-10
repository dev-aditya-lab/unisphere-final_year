import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, MapPin, Plus, Video } from "lucide-react";
import { EventStatusChip } from "@/components/campus/event-parts";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth/session";
import { listEvents } from "@/lib/services/campus";
import { isFlagEnabled } from "@/lib/settings";
import { formatEventRange, tzLabel } from "@/lib/time";
import { EVENT_KINDS } from "@/lib/validators/campus";
import { cn } from "@/lib/utils";

export const metadata = { title: "Events", robots: { index: false, follow: false } };
const selectCls = "border-input bg-card focus-visible:border-ring focus-visible:ring-ring/40 h-9 rounded-md border px-2.5 text-sm outline-none focus-visible:ring-[3px]";
const TABS = [["upcoming", "Upcoming"], ["mine", "My events"], ["past", "Past"]];

export default async function EventsPage({ searchParams }) {
  if (!(await isFlagEnabled("events"))) notFound();
  const { user } = await requireProfile();
  const sp = await searchParams;
  const scope = TABS.some(([id]) => id === sp.tab) ? sp.tab : "upcoming";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const kind = EVENT_KINDS.some((k) => k.value === sp.kind) ? sp.kind : null;
  const mode = ["in_person", "online", "hybrid"].includes(sp.mode) ? sp.mode : null;
  const events = await listEvents({ scope: scope === "mine" ? "upcoming" : scope, query: q || null, kind, mode, userId: user.id }).then((rows) =>
    scope === "mine" ? rows.filter((e) => e.my_status || e.organizer_id === user.id) : rows,
  );

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader eyebrow="Campus" title="Events" description="Workshops, hackathons, talks and meetups. Times are shown in each event's own timezone."
        actions={<Button asChild variant="hot"><Link href="/events/new"><Plus /> Create event</Link></Button>} />
      <nav aria-label="Event lists" className="mb-5 flex gap-1 border-b">
        {TABS.map(([id, label]) => (
          <Link key={id} href={id === "upcoming" ? "/events" : `/events?tab=${id}`} aria-current={scope === id ? "page" : undefined}
            className={cn("relative px-3 py-2.5 text-sm font-medium", scope === id ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
            {label}{scope === id && <span aria-hidden="true" className="bg-primary absolute inset-x-3 -bottom-px h-0.5 rounded-full" />}
          </Link>
        ))}
      </nav>
      <form method="get" action="/events" role="search" className="surface mb-5 flex flex-wrap gap-2 p-3">
        {scope !== "upcoming" && <input type="hidden" name="tab" value={scope} />}
        <label htmlFor="e-q" className="sr-only">Search events</label>
        <input id="e-q" name="q" defaultValue={q} placeholder="Search events" maxLength={80} className="border-input bg-card focus-visible:border-ring focus-visible:ring-ring/40 h-9 min-w-48 flex-1 rounded-md border px-3 text-sm outline-none focus-visible:ring-[3px]" />
        <select name="kind" defaultValue={kind ?? ""} className={selectCls} aria-label="Type"><option value="">All types</option>{EVENT_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</select>
        <select name="mode" defaultValue={mode ?? ""} className={selectCls} aria-label="Format"><option value="">Any format</option><option value="in_person">In person</option><option value="online">Online</option><option value="hybrid">Hybrid</option></select>
        <Button type="submit">Filter</Button>
      </form>
      {events.length === 0 ? (
        <EmptyState icon={CalendarDays} title={scope === "past" ? "No past events" : scope === "mine" ? "You have no events yet" : "No upcoming events"} action={<Button asChild><Link href="/events/new">Create an event</Link></Button>}>
          {scope === "mine" ? "RSVP to an event or create your own and it will show up here." : "Check back soon, or organise something yourself."}
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {events.map((e) => (
            <li key={e.id}>
              <article className={cn("surface flex gap-4 p-4", e.status === "cancelled" && "opacity-70")}>
                <div className="bg-accent text-accent-foreground flex size-14 shrink-0 flex-col items-center justify-center rounded-lg text-center leading-tight" aria-hidden="true">
                  <span className="text-[10px] font-bold uppercase">{new Intl.DateTimeFormat("en", { month: "short", timeZone: e.timezone }).format(new Date(e.starts_at))}</span>
                  <span className="font-heading text-xl font-extrabold">{new Intl.DateTimeFormat("en", { day: "numeric", timeZone: e.timezone }).format(new Date(e.starts_at))}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="mono">{EVENT_KINDS.find((k) => k.value === e.kind)?.label}</Badge>
                    {e.status === "cancelled" && <Badge variant="danger">Cancelled</Badge>}
                    {e.community_name && <Badge variant="soft">{e.community_name}</Badge>}
                    <EventStatusChip my_status={e.my_status} />
                  </div>
                  <h2 className="font-heading mt-1 text-lg font-bold"><Link href={`/events/${e.slug}`} className="hover:underline">{e.title}</Link></h2>
                  <p className="text-muted-foreground mt-0.5 text-sm">{formatEventRange(e.starts_at, e.ends_at, e.timezone)} <span className="text-xs">({tzLabel(e.timezone, new Date(e.starts_at))})</span></p>
                  <p className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-3 text-xs">
                    {e.location && <span className="flex items-center gap-1"><MapPin className="size-3.5" aria-hidden="true" />{e.location}</span>}
                    {e.mode !== "in_person" && <span className="flex items-center gap-1"><Video className="size-3.5" aria-hidden="true" />Online</span>}
                    <span>{e.going_count} going{e.capacity ? ` · ${e.capacity} seats` : ""}</span>
                  </p>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
