import { notFound } from "next/navigation";
import { EventForm } from "@/components/campus/event-parts";
import { PageHeader } from "@/components/shell/page-header";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { isFlagEnabled } from "@/lib/settings";

export const metadata = { title: "Create event", robots: { index: false, follow: false } };

export default async function NewEventPage() {
  if (!(await isFlagEnabled("events"))) notFound();
  const { user } = await requireProfile();
  // Only communities this member administers can host an event.
  const supabase = await createClient();
  const { data: admin } = await supabase.from("community_members").select("community_id").eq("user_id", user.id).eq("status", "active").in("role", ["owner", "admin"]);
  const ids = (admin ?? []).map((a) => a.community_id);
  const { data: communities } = ids.length ? await supabase.from("community_cards").select("id, name").in("id", ids) : { data: [] };
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow="Events" title="Create an event" />
      <EventForm communities={communities ?? []} />
    </div>
  );
}
