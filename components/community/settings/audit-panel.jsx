const fmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" });

const LABEL = {
  "settings.updated": "Changed community settings", "branding.icon_set": "Set the icon", "branding.icon_removed": "Removed the icon", "branding.banner_set": "Set the banner",
  "branding.banner_removed": "Removed the banner", "category.created": "Created a category", "category.renamed": "Renamed a category", "category.archived": "Archived a category",
  "category.restored": "Restored a category", "category.reordered": "Reordered categories", "channel.created": "Created a channel", "channel.updated": "Changed a channel",
  "channel.archived": "Archived a channel", "channel.restored": "Restored a channel", "channel.reordered": "Reordered channels", "channel.moved": "Moved a channel",
  "role.changed": "Changed a role", "owner.transferred": "Transferred ownership", "member.joined": "Member joined", "member.requested": "Join request", "member.approved": "Approved a request",
  "member.declined": "Declined a request", "member.left": "Member left", "member.joined_invite": "Joined with an invitation", "member.warn": "Warned a member", "member.timeout": "Timed out a member",
  "member.clear_timeout": "Ended a timeout", "member.remove": "Removed a member", "member.ban": "Banned a member", "member.unban": "Lifted a ban", "member.note": "Added a private note",
  "message.removed": "Removed a message", "message.pinned": "Pinned a message", "message.unpinned": "Unpinned a message", "invite.created": "Created an invitation", "invite.revoked": "Revoked an invitation",
  "report.reviewing": "Started reviewing a report", "report.dismissed": "Dismissed a report", "report.action_taken": "Closed a report with action", "report.escalated": "Escalated a report",
  "appeal.upheld": "Upheld an appeal", "appeal.denied": "Denied an appeal",
};

/** Who changed what, newest first. Never contains message text. Append-only: nobody, including the owner, can edit or delete it. */
export function AuditPanel({ entries }) {
  if (entries.length === 0) return <p className="text-muted-foreground text-sm">Nothing recorded yet.</p>;
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-xs">Permission changes, moderation and settings are recorded here. The log cannot be edited or erased.</p>
      <ul className="divide-y text-sm">
        {entries.map((e) => (
          <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2">
            <strong>{LABEL[e.action] ?? e.action}</strong>
            <span className="text-muted-foreground text-xs">by {e.actor?.full_name ?? "a former member or the system"} · {fmt.format(new Date(e.created_at))}</span>
            {e.action === "role.changed" && e.details?.from && <span className="text-muted-foreground text-xs">{e.details.from} → {e.details.to}</span>}
            {e.action === "channel.updated" && e.details?.post && <span className="text-muted-foreground text-xs">post: {String(e.details.post[0])} → {String(e.details.post[1])}, read: {String(e.details.view?.[0])} → {String(e.details.view?.[1])}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
