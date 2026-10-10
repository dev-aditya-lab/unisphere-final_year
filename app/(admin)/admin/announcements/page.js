import { PageHeader } from "@/components/shell/page-header";
import { Panel, StatusBadge, fmtDateTime } from "@/components/admin/ui";
import { ActionDialog } from "@/components/admin/action-dialog";
import { AnnouncementForm } from "@/components/admin/announcement-form";
import { getMyPermissions } from "@/lib/auth/session";
import { archiveAnnouncementByIdAction } from "@/lib/actions/admin";
import { createClient } from "@/lib/supabase/server";
import { listColleges } from "@/lib/services/admin";

export const metadata = { title: "Announcements" };

export default async function AnnouncementsPage() {
  const perms = (await getMyPermissions()).filter((p) => p.permission === "announcements.manage");
  const colleges = await listColleges();
  const global = perms.some((p) => p.college_id === null);
  const allowed = colleges.filter((c) => c.is_active && (global || perms.some((p) => p.college_id === c.id)));

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("college_announcements")
    .select("id, college_id, title, body, pinned, status, published_at, expires_at")
    .in("college_id", allowed.map((c) => c.id))
    .order("published_at", { ascending: false })
    .limit(40);
  const nameOf = (id) => colleges.find((c) => c.id === id)?.name ?? "";

  return (
    <>
      <PageHeader
        eyebrow="Community" title="Announcements"
        description="Official messages to everyone in a college. Each member gets an in-app notification (and an email if they opted in), so use them sparingly."
      />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_24rem]">
        <section aria-label="Published announcements" className="space-y-3">
          {(rows ?? []).length === 0 && <div className="surface text-muted-foreground p-8 text-center text-sm">No announcements yet.</div>}
          {(rows ?? []).map((a) => (
            <Panel
              key={a.id} title={a.title}
              description={`${nameOf(a.college_id)} · ${fmtDateTime(a.published_at)}${a.expires_at ? ` · until ${fmtDateTime(a.expires_at)}` : ""}`}
              actions={<span className="flex gap-1.5">{a.pinned && <StatusBadge value="pinned" />}<StatusBadge value={a.status} /></span>}
            >
              <p className="text-sm break-words whitespace-pre-wrap">{a.body}</p>
              {a.status === "published" && (
                <div className="mt-3">
                  <ActionDialog label="Archive" askReason={false} title="Archive this announcement?" description="It stops showing in members' feeds. Notifications already sent stay." action={archiveAnnouncementByIdAction} args={{ id: a.id }} confirmLabel="Archive" />
                </div>
              )}
            </Panel>
          ))}
        </section>
        <Panel title="Publish an announcement">
          {allowed.length === 0 ? <p className="text-muted-foreground text-sm">No active college to publish to.</p> : <AnnouncementForm colleges={allowed.map((c) => ({ id: c.id, name: c.name }))} />}
        </Panel>
      </div>
    </>
  );
}
