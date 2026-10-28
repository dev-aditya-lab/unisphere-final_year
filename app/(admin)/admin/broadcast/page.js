import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { Panel, StatusBadge, fmtDateTime } from "@/components/admin/ui";
import { BroadcastForm } from "@/components/admin/broadcast-form";
import { getMyPermissions } from "@/lib/auth/session";
import { listColleges } from "@/lib/services/admin";
import { listBroadcasts } from "@/lib/services/broadcast";

export const metadata = { title: "Broadcast" };

/** A short sentence for who a past broadcast went to. */
function describeAudience(a, nameOf) {
  const parts = [];
  if (a?.everyone) parts.push("everyone");
  if (a?.colleges?.length) parts.push(a.colleges.length === 1 ? nameOf(a.colleges[0]) || "1 college" : `${a.colleges.length} colleges`);
  if (a?.communities?.length) parts.push(`${a.communities.length} ${a.communities.length === 1 ? "community" : "communities"}`);
  if (a?.usernames?.length) parts.push(a.usernames.length === 1 ? `@${a.usernames[0]}` : `${a.usernames.length} people`);
  const types = a?.account_types?.length ? ` (${a.account_types.join(", ")} only)` : "";
  return (parts.join(" + ") || "—") + types;
}

export default async function BroadcastPage() {
  const perms = (await getMyPermissions()).filter((p) => p.permission === "announcements.manage");
  // Other staff (a moderator, say) have the admin console but not this: the database would refuse them anyway, so do not show a dead form.
  if (perms.length === 0) redirect("/forbidden");
  const colleges = await listColleges();
  const global = perms.some((p) => p.college_id === null);
  // College staff can choose among their own colleges; global staff among all of them.
  const reachable = colleges.filter((c) => global || perms.some((p) => p.college_id === c.id));
  const past = await listBroadcasts();
  const nameOf = (id) => colleges.find((c) => c.id === id)?.name ?? "";

  return (
    <>
      <PageHeader
        eyebrow="Community" title="Broadcast"
        description="Send an official notification to everyone, to colleges, to communities, or to named people. Each member's own notification settings still apply, and it cannot be unsent."
      />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_24rem]">
        <Panel title="New broadcast" description={global ? "You can reach anyone on UniSphere." : "You can reach members of your own colleges."}>
          <BroadcastForm colleges={reachable.map((c) => ({ id: c.id, name: c.name }))} canReachEveryone={global} />
        </Panel>
        <section aria-label="Past broadcasts" className="space-y-3">
          <h2 className="font-heading text-base font-bold">Sent so far</h2>
          {past.length === 0 && <div className="surface text-muted-foreground p-6 text-center text-sm">Nothing sent yet.</div>}
          {past.map((b) => (
            <Panel key={b.id} title={b.title} description={`${fmtDateTime(b.created_at)} · ${describeAudience(b.audience, nameOf)}`} actions={<StatusBadge value={b.push ? "push + bell" : "bell only"} />}>
              <p className="line-clamp-3 text-sm break-words whitespace-pre-wrap">{b.body}</p>
              <p className="text-muted-foreground mt-2 text-xs">Reached {b.delivered.toLocaleString("en-IN")} of {b.targeted.toLocaleString("en-IN")} targeted{b.href ? ` · opens ${b.href}` : ""}</p>
            </Panel>
          ))}
        </section>
      </div>
    </>
  );
}
