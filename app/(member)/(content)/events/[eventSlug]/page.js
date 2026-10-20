import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarPlus, ExternalLink, MapPin, Users, Video } from "lucide-react";
import { EventManagePanel, RsvpPanel } from "@/components/campus/event-parts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { UserAvatar } from "@/components/user-avatar";
import { getAuthUser } from "@/lib/auth/session";
import { getEventAttendees, getEventBySlug } from "@/lib/services/campus";
import { isFlagEnabled } from "@/lib/settings";
import { publicEnv } from "@/lib/env-public";
import { formatEventRange, tzLabel } from "@/lib/time";
import { isValidSlug } from "@/lib/slug";
import { excerpt } from "@/lib/text";
import { EVENT_KINDS } from "@/lib/validators/campus";

export async function generateMetadata({ params }) {
  const { eventSlug } = await params;
  const e = isValidSlug(eventSlug) ? await getEventBySlug(eventSlug) : null;
  if (!e) return { title: "Event not found", robots: { index: false, follow: false } };
  const isPublic = false; // closed network: member content is never indexed or given a public preview
  const description = excerpt(e.description || `${e.title}, ${formatEventRange(e.starts_at, e.ends_at, e.timezone)}`, 160);
  return { title: e.title, description, alternates: { canonical: `/events/${e.slug}` }, robots: isPublic ? { index: true, follow: true } : { index: false, follow: false }, openGraph: isPublic ? { type: "article", title: e.title, description } : undefined };
}

export default async function EventPage({ params }) {
  if (!(await isFlagEnabled("events"))) notFound();
  const { eventSlug } = await params;
  if (!isValidSlug(eventSlug)) notFound();
  const event = await getEventBySlug(eventSlug);
  if (!event) notFound();
  const user = await getAuthUser();
  const attendees = event.can_manage ? await getEventAttendees(event.id) : [];
  const over = new Date(event.ends_at ?? new Date(event.starts_at).getTime() + 3 * 3600_000) < new Date();

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink asChild><Link href={user ? "/events" : "/"}>{user ? "Events" : "Home"}</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>{event.title}</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <header className="surface p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="mono">{EVENT_KINDS.find((k) => k.value === event.kind)?.label}</Badge>
          {event.status === "cancelled" && <Badge variant="danger">Cancelled</Badge>}
          {over && event.status !== "cancelled" && <Badge variant="mono">Past event</Badge>}
          {event.community_name && <Badge variant="soft"><Link href={`/communities/${event.community_slug}`}>{event.community_name}</Link></Badge>}
        </div>
        <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">{event.title}</h1>
        <dl className="mt-4 space-y-2 text-sm">
          <div><dt className="sr-only">When</dt><dd><strong>{formatEventRange(event.starts_at, event.ends_at, event.timezone)}</strong> <span className="text-muted-foreground">({tzLabel(event.timezone, new Date(event.starts_at))})</span></dd></div>
          {event.location && <div className="flex items-center gap-1.5"><dt className="sr-only">Where</dt><MapPin className="text-muted-foreground size-4" aria-hidden="true" /><dd>{event.location}</dd></div>}
          {event.mode !== "in_person" && event.online_url && (
            <div className="flex items-center gap-1.5"><dt className="sr-only">Online</dt><Video className="text-muted-foreground size-4" aria-hidden="true" />
              <dd>{user ? <a href={event.online_url} target="_blank" rel="noopener noreferrer nofollow" className="text-blue-text font-medium hover:underline">Join link <ExternalLink className="inline size-3" /></a> : <Link prefetch={false} href={`/login?next=/events/${event.slug}`} className="text-blue-text font-medium hover:underline">Log in to see the join link</Link>}</dd></div>
          )}
          <div className="flex items-center gap-1.5"><dt className="sr-only">Attendance</dt><Users className="text-muted-foreground size-4" aria-hidden="true" /><dd>{event.going_count} going{event.capacity ? ` of ${event.capacity} seats` : ""}{event.interested_count ? ` · ${event.interested_count} interested` : ""}</dd></div>
        </dl>
        <p className="mt-4 flex items-center gap-2 text-sm"><UserAvatar name={event.organizer_name} avatarKey={event.organizer_avatar_key} size="xs" />Organised by <Link href={`/u/${event.organizer_username}`} className="font-semibold hover:underline">{event.organizer_name}</Link></p>
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t pt-4">
          <RsvpPanel event={event} viewerId={user?.id ?? null} over={over} />
          <Button asChild variant="ghost" size="sm"><a href={`/events/${event.slug}/calendar.ics`}><CalendarPlus /> Add to calendar</a></Button>
        </div>
      </header>
      {event.description && <section className="surface p-5"><h2 className="eyebrow mb-3">About</h2><p className="text-[15px] leading-relaxed whitespace-pre-wrap">{event.description}</p></section>}
      {event.can_manage && <section className="surface p-5"><h2 className="eyebrow mb-3">Organiser tools</h2><EventManagePanel event={event} attendees={attendees} /></section>}
    </div>
  );
}
