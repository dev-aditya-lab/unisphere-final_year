import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/components/shell/page-header";
import { Panel, StatusBadge, fmtDateTime } from "@/components/admin/ui";
import { ActionDialog } from "@/components/admin/action-dialog";
import { UserAvatar } from "@/components/user-avatar";
import { hasPermission } from "@/lib/auth/session";
import { moderateUserAction, revokeRoleAction } from "@/lib/actions/admin";
import { getUserDetail } from "@/lib/services/admin";

export const metadata = { title: "Member" };

const ACTION_LABEL = { warn: "Warned", remove_content: "Content removed", restore_content: "Content restored", restrict: "Restricted", suspend: "Suspended", reinstate: "Reinstated", dismiss: "Report dismissed", note: "Note" };
const ROLE_LABEL = { global_admin: "Global admin", college_admin: "College admin", moderator: "Moderator", verification_staff: "Verification staff", support_agent: "Support agent" };

export default async function MemberPage({ params }) {
  const { userId } = await params;
  if (!z.uuid().safeParse(userId).success) notFound();
  const d = await getUserDetail(userId);
  const p = d.profile;
  const college = p.college_id;
  const [canWarn, canRestrict, canSuspend, canReinstate, canRoles] = await Promise.all([
    hasPermission("moderation.warn", college), hasPermission("users.restrict", college), hasPermission("users.suspend", college),
    hasPermission("users.reinstate", college), hasPermission("roles.manage_limited", college),
  ]);
  const admin = d.roles.some((r) => r.role === "global_admin" || r.role === "college_admin");
  const restricted = p.status === "restricted" || p.status === "suspended";

  return (
    <>
      <Link href="/admin/users" className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1.5 text-sm">
        <ArrowLeft className="size-4" aria-hidden="true" /> All members
      </Link>
      <PageHeader
        eyebrow={d.college_name ?? "No college"}
        title={p.full_name}
        description={`@${p.username} · ${d.email}`}
        actions={<><StatusBadge value={p.status} /><StatusBadge value={p.verification_status} /></>}
      />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-5">
          <Panel title="Account">
            <div className="flex items-start gap-4">
              <UserAvatar name={p.full_name} avatarKey={p.avatar_key} size="lg" />
              <dl className="grid grid-cols-1 flex-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <div><dt className="eyebrow">Account type</dt><dd className="capitalize">{p.account_type}</dd></div>
                <div><dt className="eyebrow">Joined</dt><dd>{fmtDateTime(p.created_at)}</dd></div>
                <div><dt className="eyebrow">Email confirmed</dt><dd>{d.email_confirmed_at ? fmtDateTime(d.email_confirmed_at) : "Not yet"}</dd></div>
                <div><dt className="eyebrow">Last sign-in</dt><dd>{fmtDateTime(d.last_sign_in_at)}</dd></div>
                <div><dt className="eyebrow">Onboarded</dt><dd>{p.onboarded_at ? fmtDateTime(p.onboarded_at) : "No"}</dd></div>
                <div><dt className="eyebrow">Profile</dt><dd><Link prefetch={false} href={`/u/${p.username}`} className="text-blue-text font-semibold hover:underline">View public profile</Link></dd></div>
              </dl>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t pt-4 text-sm sm:grid-cols-5">
              {Object.entries({ Posts: d.counts.posts, Comments: d.counts.comments, Projects: d.counts.projects, "Reports against": d.counts.reports_against, "Reports filed": d.counts.reports_filed }).map(([k, n]) => (
                <div key={k}><dt className="eyebrow">{k}</dt><dd className="font-heading text-xl font-bold tabular-nums">{n}</dd></div>
              ))}
            </dl>
            {d.deletion_request && (
              <p className="bg-warning/10 text-warning-text mt-4 rounded-md px-3 py-2 text-[13px]">
                Deletion {d.deletion_request.status}, scheduled for {fmtDateTime(d.deletion_request.scheduled_for)}. <Link href="/admin/deletions" className="font-semibold underline">Manage</Link>
              </p>
            )}
          </Panel>

          <Panel title="Moderation history" description="Every decision about this member, newest first.">
            {d.actions.length === 0 ? (
              <p className="text-muted-foreground text-sm">No moderation history. A clean record.</p>
            ) : (
              <ol className="divide-y">
                {d.actions.map((a) => (
                  <li key={a.id} className="py-2.5 text-sm">
                    <p>
                      <span className="font-semibold">{ACTION_LABEL[a.action] ?? a.action}</span>
                      <span className="text-muted-foreground"> · {a.actor ?? "staff"} · {fmtDateTime(a.created_at)}</span>
                      {a.appeal_status && <span className="ml-2"><StatusBadge value={`appeal ${a.appeal_status}`} /></span>}
                    </p>
                    {a.reason && <p className="text-muted-foreground mt-0.5 break-words whitespace-pre-wrap">{a.reason}</p>}
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>

        <aside className="space-y-5">
          <Panel title="Actions">
            {admin && <p className="text-muted-foreground mb-3 text-xs">This member holds an administrator role; only a global administrator can act on them.</p>}
            <div className="grid gap-2">
              {canWarn && p.status !== "suspended" && (
                <ActionDialog label="Send a warning" title="Warn this member" description="They get a notification with your reason." action={moderateUserAction} args={{ userId: p.id, action: "warn" }} reasonLabel="Reason shown to the member" />
              )}
              {canRestrict && p.status === "active" && (
                <ActionDialog label="Restrict account" destructive title="Restrict this account" description="Their profile is hidden and they cannot post or message. They can still sign in, read and appeal." action={moderateUserAction} args={{ userId: p.id, action: "restrict" }} reasonLabel="Reason shown to the member" />
              )}
              {canSuspend && (p.status === "active" || p.status === "restricted") && (
                <ActionDialog label="Suspend account" destructive title="Suspend this account" description="They can only read the decision and appeal it." action={moderateUserAction} args={{ userId: p.id, action: "suspend" }} reasonLabel="Reason shown to the member" />
              )}
              {canReinstate && restricted && (
                <ActionDialog label="Reinstate account" variant="default" title="Reinstate this account" description="Full access returns and any open appeal is closed as upheld." action={moderateUserAction} args={{ userId: p.id, action: "reinstate" }} reasonLabel="Note to the member" />
              )}
              {!canWarn && !canRestrict && !canSuspend && !canReinstate && <p className="text-muted-foreground text-sm">Your role cannot take action on members.</p>}
            </div>
          </Panel>

          <Panel title="Staff roles">
            {d.roles.length === 0 ? (
              <p className="text-muted-foreground text-sm">No staff roles.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {d.roles.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2">
                    <span>{ROLE_LABEL[r.role]}{r.college_name ? ` · ${r.college_name}` : " · platform"}</span>
                    {canRoles && (
                      <ActionDialog
                        label="Remove" size="sm" destructive askReason={false} title={`Remove ${ROLE_LABEL[r.role]}?`}
                        description="They lose this staff access immediately. This is recorded in the audit log."
                        action={revokeRoleAction} args={{ id: r.id }} confirmLabel="Remove role"
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs"><Link href="/admin/roles" className="text-blue-text font-semibold hover:underline">Manage staff &amp; roles</Link></p>
          </Panel>
        </aside>
      </div>
    </>
  );
}
