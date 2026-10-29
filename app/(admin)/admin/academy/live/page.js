import { PageHeader } from "@/components/shell/page-header";
import { Panel, StatusBadge, fmtDateTime } from "@/components/admin/ui";
import { ActionDialog } from "@/components/admin/action-dialog";
import { EntityForm } from "@/components/academy/admin/entity-form";
import { deleteEntityAction, postAnnouncementAction, saveLiveSessionAction } from "@/lib/actions/academy-admin";
import { ANNOUNCEMENT_FIELDS, LIVE_FIELDS } from "@/lib/academy/forms";
import { can, courseOptions, mentorsAll, needAcademy } from "@/lib/services/academy-admin";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Academy live classes and announcements" };

export default async function LiveAndNews() {
  await needAcademy("academy.live.manage", "academy.announce");
  const [live, announce] = await Promise.all([can("academy.live.manage"), can("academy.announce")]);
  const supabase = await createClient();
  const [courses, mentors, sessions, links, announcements] = await Promise.all([
    courseOptions(), mentorsAll(),
    supabase.from("academy_live_sessions").select("*, course:academy_courses(code, title)").order("starts_at", { ascending: false }).limit(40),
    supabase.from("academy_live_session_links").select("*"),
    supabase.from("academy_announcements").select("id, title, recipients, created_at, course:academy_courses(code)").order("created_at", { ascending: false }).limit(15),
  ]);
  const linkBy = new Map((links.data ?? []).map((l) => [l.session_id, l]));
  const active = courses.filter((c) => c.status !== "draft");

  return (
    <>
      <PageHeader eyebrow="Academy" title="Live classes and announcements" description="Classes run on a meeting service you choose (Google Meet or similar): create the meeting there and paste its link. The Academy does not create meetings itself." />
      {live && (
        <>
          <Panel title="Schedule a class" description="Reminders go to enrolled students automatically (see Academy settings for the times). The link is shown only to eligible students, from an hour before the start." className="mb-6">
            <EntityForm fields={LIVE_FIELDS(active, mentors)} initial={{ status: "scheduled" }} action={saveLiveSessionAction.bind(null, null)} submitLabel="Schedule" resetOnSuccess />
          </Panel>
          <Panel title="Classes" className="mb-8">
            <ul className="divide-y text-sm">
              {(sessions.data ?? []).map((s) => {
                const l = linkBy.get(s.id);
                return (
                  <li key={s.id} className="py-3"><details>
                    <summary className="flex cursor-pointer flex-wrap items-center gap-2"><strong>{s.title}</strong><span className="font-mono text-xs">{s.course?.code}</span><StatusBadge value={s.status === "scheduled" ? "pending" : s.status} /><span className="text-muted-foreground text-xs">{fmtDateTime(s.starts_at)}</span></summary>
                    <div className="mt-4 space-y-3">
                      <EntityForm fields={LIVE_FIELDS(active, mentors)} initial={{ ...s, meeting_url: l?.meeting_url ?? "", recording_url: l?.recording_url ?? "" }} action={saveLiveSessionAction.bind(null, s.id)} />
                      <ActionDialog label="Delete class" destructive askReason={false} title="Delete this class?" action={deleteEntityAction.bind(null, "live_session", s.id)} args={{}} confirmLabel="Delete" />
                    </div>
                  </details></li>
                );
              })}
              {(sessions.data ?? []).length === 0 && <li className="text-muted-foreground py-3">No classes scheduled.</li>}
            </ul>
          </Panel>
        </>
      )}
      {announce && (
        <Panel title="Announce to students" description="Everyone enrolled in the course (or every active student) is notified in the app, on their phone and by email, according to their own Academy notification settings.">
          <EntityForm fields={ANNOUNCEMENT_FIELDS(active)} action={postAnnouncementAction} submitLabel="Send announcement" resetOnSuccess />
          <h3 className="mt-6 mb-2 text-sm font-bold">Recent</h3>
          <ul className="divide-y text-sm">{(announcements.data ?? []).map((a) => <li key={a.id} className="flex justify-between gap-3 py-2"><span>{a.title} <span className="text-muted-foreground text-xs">{a.course?.code ?? "everyone"}</span></span><span className="text-muted-foreground text-xs">{a.recipients} told · {fmtDateTime(a.created_at)}</span></li>)}{(announcements.data ?? []).length === 0 && <li className="text-muted-foreground py-2">None yet.</li>}</ul>
        </Panel>
      )}
    </>
  );
}
