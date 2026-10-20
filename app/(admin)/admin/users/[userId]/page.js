import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, History } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/components/shell/page-header";
import { Panel, StatusBadge, fmtDateTime } from "@/components/admin/ui";
import { ActionDialog } from "@/components/admin/action-dialog";
import { EditProfileDialog, TimedModerationDialog, UserNoteForm } from "@/components/admin/user-tools";
import { UserAvatar } from "@/components/user-avatar";
import { hasPermission } from "@/lib/auth/session";
import { moderateUserAction, revokeRoleAction, revokeUserSessionsAction, sendRecoveryAction } from "@/lib/actions/admin";
import { getUserDetail, getUserPosts } from "@/lib/services/admin";

export const metadata = { title: "Member" };

const ACTION_LABEL = { warn: "Warned", remove_content: "Content removed", restore_content: "Content restored", restrict: "Restricted", suspend: "Suspended", reinstate: "Reinstated", dismiss: "Report dismissed", note: "Internal note" };
const ROLE_LABEL = { global_admin: "Global admin", college_admin: "College admin", moderator: "Moderator", verification_staff: "Verification staff", support_agent: "Support agent" };

export default async function MemberPage({ params }) {
  const { userId } = await params;
  if (!z.uuid().safeParse(userId).success) notFound();
  const d = await getUserDetail(userId);
  const p = d.profile;
  const college = p.college_id;
  const [canWarn, canRestrict, canSuspend, canReinstate, canRoles, canEdit, canSessions, canExport, posts] = await Promise.all([
    hasPermission("moderation.warn", college), hasPermission("users.restrict", college), hasPermission("users.suspend", college),
    hasPermission("users.reinstate", college), hasPermission("roles.manage_limited", college),
    hasPermission("users.edit", college), hasPermission("users.sessions", college), hasPermission("users.export", college),
    getUserPosts(userId),
  ]);
  const postTotal = Number(posts[0]?.total_count ?? 0);
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
                {p.restricted_until && <div><dt className="eyebrow">{p.status === "suspended" ? "Suspension ends" : "Restriction ends"}</dt><dd>{fmtDateTime(p.restricted_until)}</dd></div>}
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

          <Panel title="Recent posts" description="Public and college posts only; private posts are never shown here.">
            {posts.length === 0 ? (
              <p className="text-muted-foreground text-sm">No public posts.</p>
            ) : (
              <ul className="divide-y">
                {posts.map((x) => (
                  <li key={x.id} className="py-2.5 text-sm">
                    <p className="flex flex-wrap items-center gap-2">
                      <Link prefetch={false} href={`/${x.category === "ideas" ? "ideas" : "posts"}/${x.slug}`} className="text-blue-text font-semibold hover:underline">{x.title || "Untitled post"}</Link>
                      <StatusBadge value={x.status} />
                      <span className="text-muted-foreground text-xs">{fmtDateTime(x.created_at)} · {x.visibility}</span>
                    </p>
                    <p className="text-muted-foreground mt-0.5 line-clamp-2 break-words">{x.snippet}</p>
                  </li>
                ))}
              </ul>
            )}
            {postTotal > posts.length && <p className="text-muted-foreground mt-2 text-xs">Showing the latest {posts.length} of {postTotal}. <Link href={`/admin/posts?q=${p.username}`} className="text-blue-text font-semibold hover:underline">Search all posts</Link></p>}
          </Panel>

          <Panel title="Moderation history" description="Every decision and internal note about this member, newest first.">
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
          {canWarn && (
            <Panel title="Internal note">
              <UserNoteForm userId={p.id} />
            </Panel>
          )}

          <Panel title="Actions">
            {admin && <p className="text-muted-foreground mb-3 text-xs">This member holds an administrator role; only a global administrator can act on them.</p>}
            <div className="grid gap-2">
              {canWarn && p.status !== "suspended" && (
                <ActionDialog label="Send a warning" title="Warn this member" description="They get a notification with your reason." action={moderateUserAction} args={{ userId: p.id, action: "warn" }} reasonLabel="Reason shown to the member" />
              )}
              {canRestrict && p.status === "active" && (
                <TimedModerationDialog userId={p.id} kind="restrict" label="Restrict account" title="Restrict this account" description="Their profile is hidden and they cannot post or message. They can still sign in, read and appeal." />
              )}
              {canSuspend && (p.status === "active" || p.status === "restricted") && (
                <TimedModerationDialog userId={p.id} kind="suspend" label="Suspend account" title="Suspend this account" description="They can only read the decision and appeal it." />
              )}
              {canReinstate && restricted && (
                <ActionDialog label="Reinstate account" variant="default" title="Reinstate this account" description="Full access returns and any open appeal is closed as upheld." action={moderateUserAction} args={{ userId: p.id, action: "reinstate" }} reasonLabel="Note to the member" />
              )}
              {!canWarn && !canRestrict && !canSuspend && !canReinstate && !canEdit && !canSessions && <p className="text-muted-foreground text-sm">Your role cannot take action on members.</p>}
            </div>
          </Panel>

          {(canEdit || canSessions || canExport) && (
            <Panel title="Account tools" description="Each of these is recorded in the audit log.">
              <div className="grid gap-2">
                {canEdit && <EditProfileDialog member={p} />}
                {canSessions && (
                  <ActionDialog label="Sign out everywhere" destructive title="Sign this member out everywhere?" description="Their sessions are ended and they must sign in again. A device that already holds a short-lived access token can keep working for up to an hour; restricted and suspended accounts are blocked on every request regardless." action={revokeUserSessionsAction} args={{ userId: p.id }} reasonLabel="Reason (kept in the audit log)" confirmLabel="Sign out" />
                )}
                {canSessions && (
                  <ActionDialog label="Send recovery email" title="Send a password-reset email?" description="The member receives the normal reset link at their address. You never see the link." action={sendRecoveryAction} args={{ userId: p.id }} askReason={false} confirmLabel="Send email" />
                )}
                {canExport && (
                  <a href={`/api/admin/users/${p.id}/export`} className="border-border-strong hover:bg-accent inline-flex h-9 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold">
                    <Download className="size-4" aria-hidden="true" /> Export member data
                  </a>
                )}
                <Link href={`/admin/audit?target=${p.id}`} className="text-blue-text inline-flex items-center gap-1.5 text-sm font-semibold hover:underline">
                  <History className="size-4" aria-hidden="true" /> Audit history for this member
                </Link>
              </div>
            </Panel>
          )}

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
