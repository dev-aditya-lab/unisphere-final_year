import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ActionDialog } from "@/components/admin/action-dialog";
import { DataTable, EmptyRow, Panel, StatCard, StatusBadge, fmtDate, fmtDateTime, fmtNumber } from "@/components/admin/ui";
import { PageHeader } from "@/components/shell/page-header";
import { setCommunityOfficialAction } from "@/lib/actions/campus";
import { ROLE_LABEL, channelTypeLabel } from "@/lib/community/rules";
import * as ws from "@/lib/services/community-workspace";

export const metadata = { title: "Community" };

const LABEL = { "settings.updated": "Changed settings", "role.changed": "Changed a role", "owner.transferred": "Transferred ownership", "member.ban": "Banned a member", "member.timeout": "Timed out a member", "member.remove": "Removed a member", "message.removed": "Removed a message", "channel.created": "Created a channel", "channel.archived": "Archived a channel", "channel.updated": "Changed a channel", "invite.created": "Created an invitation", "invite.revoked": "Revoked an invitation" };

/** One community as the platform sees it: who runs it, how it is set up, who is restricted, and what its staff have done. No message text. */
export default async function AdminCommunityDetail({ params }) {
  const { communityId } = await params;
  if (!z.uuid().safeParse(communityId).success) notFound();
  const res = await ws.adminDetail(communityId);
  if (!res.ok) notFound();
  const d = res.data;
  const c = d.community;
  return (
    <>
      <PageHeader eyebrow="Community safety" title={c.name} description={`${c.visibility} · ${c.join_policy} · created ${fmtDate(c.created_at)}${c.deleted_at ? " · removed" : ""}`}
        actions={<Link href="/admin/community-safety" className="text-muted-foreground hover:text-foreground text-sm">All communities</Link>} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Members" value={fmtNumber(c.member_count)} />
        <StatCard label="Channels" value={fmtNumber(d.channels.filter((x) => !x.archived).length)} hint={`${d.channels.filter((x) => x.archived).length} archived`} />
        <StatCard label="Active invitations" value={fmtNumber(d.invites.active)} hint={`${d.invites.created_30d} created in 30 days`} />
        <StatCard label="Restricted people" value={fmtNumber(d.restricted.length)} tone="warn" />
      </div>
      <div className="space-y-5">
        <Panel title="Owner and staff" actions={<ActionDialog label={c.is_official ? "Remove official badge" : "Mark as official"} title={c.is_official ? "Remove the official badge" : "Mark as official"} description="Official communities carry a badge. This is recorded in the audit log." action={setCommunityOfficialAction} args={{ communityId: c.id, official: !c.is_official }} askReason={false} />}>
          {d.staff.length === 0 ? <EmptyRow>No staff.</EmptyRow> : (
            <ul className="divide-y text-sm">{d.staff.map((s) => <li key={s.user_id} className="flex items-center gap-3 py-2"><span className="flex-1 font-medium">{s.name}{s.username ? <span className="text-muted-foreground"> @{s.username}</span> : null}</span><StatusBadge value={s.role === "owner" ? "published" : "active"} className="hidden" /><span className="text-muted-foreground text-xs">{ROLE_LABEL[s.role]}</span></li>)}</ul>
          )}
        </Panel>
        <Panel title="Channels and who can use them" description="Read and post levels are the minimum role. Message counts are of messages not deleted.">
          <DataTable caption="Channels" columns={["Channel", "Kind", "Read", "Post", "Messages", "State"]} empty={d.channels.length === 0 ? <EmptyRow>No channels.</EmptyRow> : null}>
            {d.channels.map((ch) => (
              <tr key={ch.id}>
                <td className="px-4 py-2.5 font-medium">#{ch.name}</td>
                <td className="px-4 py-2.5">{channelTypeLabel(ch.type)}</td>
                <td className="px-4 py-2.5">{ch.min_view_role}</td>
                <td className="px-4 py-2.5">{ch.min_post_role}</td>
                <td className="px-4 py-2.5 tabular-nums">{fmtNumber(ch.messages)}</td>
                <td className="px-4 py-2.5">{ch.archived ? <StatusBadge value="removed" /> : <StatusBadge value="active" />}</td>
              </tr>
            ))}
          </DataTable>
        </Panel>
        <Panel title="Banned and timed-out members">
          {d.restricted.length === 0 ? <EmptyRow>No one is restricted.</EmptyRow> : (
            <ul className="divide-y text-sm">{d.restricted.map((r) => <li key={r.user_id} className="flex items-center gap-3 py-2"><span className="flex-1 font-medium">{r.name}</span><span className="text-muted-foreground text-xs">{r.status === "banned" ? "Banned" : `Timed out until ${fmtDateTime(r.muted_until)}`}</span></li>)}</ul>
          )}
        </Panel>
        <Panel title="Recent staff activity" description="Permission changes and settings are in the community's audit log; message text is never recorded there.">
          {d.audit.length === 0 ? <EmptyRow>Nothing recorded.</EmptyRow> : (
            <ul className="divide-y text-sm">{d.audit.map((a) => <li key={a.id} className="flex flex-wrap gap-x-3 py-2"><span className="font-medium">{LABEL[a.action] ?? a.action}</span><span className="text-muted-foreground text-xs">{a.actor ?? "system"} · {fmtDateTime(a.at)}</span></li>)}</ul>
          )}
        </Panel>
      </div>
    </>
  );
}
