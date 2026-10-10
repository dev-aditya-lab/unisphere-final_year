import { notFound, redirect } from "next/navigation";
import { EventForm } from "@/components/campus/event-parts";
import { PageHeader } from "@/components/shell/page-header";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getEventBySlug } from "@/lib/services/campus";
import { isValidSlug } from "@/lib/slug";

export const metadata = { title: "Edit event", robots: { index: false, follow: false } };

export default async function EditEventPage({ params }) {
  const { eventSlug } = await params;
  if (!isValidSlug(eventSlug)) notFound();
  await requireProfile();
  const card = await getEventBySlug(eventSlug);
  if (!card) notFound();
  if (!card.can_manage || card.status === "cancelled") redirect(`/events/${eventSlug}`);
  const { data: event } = await (await createClient()).from("events").select("*").eq("id", card.id).single();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow="Events" title={`Edit ${event.title}`} />
      <EventForm event={event} communities={card.community_id ? [{ id: card.community_id, name: card.community_name }] : []} />
    </div>
  );
}
