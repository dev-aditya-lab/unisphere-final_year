import { PageHeader } from "@/components/shell/page-header";
import { DataTable, EmptyRow, Panel, fmtDate } from "@/components/admin/ui";
import { ActionDialog } from "@/components/admin/action-dialog";
import { GrantRoleForm } from "@/components/admin/grant-role-form";
import { getMyPermissions } from "@/lib/auth/session";
import { revokeRoleAction } from "@/lib/actions/admin";
import { listColleges, listRoleAssignments } from "@/lib/services/admin";

export const metadata = { title: "Staff & roles" };

const ROLE_LABEL = { global_admin: "Global admin", college_admin: "College admin", moderator: "Moderator", verification_staff: "Verification staff", support_agent: "Support agent" };
const ROLE_HELP = [
  ["Global admin", "Everything, across every college. Keep this list short."],
  ["College admin", "Runs one college: members, moderation, announcements, events, analytics."],
  ["Moderator", "Reviews reports and appeals, removes content, warns and restricts."],
  ["Verification staff", "Reviews college verification requests only."],
  ["Support agent", "Answers the contact inbox only. No access to member data."],
];

export default async function RolesPage() {
  const [rows, perms, colleges] = await Promise.all([listRoleAssignments(), getMyPermissions(), listColleges()]);
  const full = perms.some((p) => p.permission === "roles.manage" && p.college_id === null);
  const limited = [...new Set(perms.filter((p) => p.permission === "roles.manage_limited").map((p) => p.college_id))];
  const options = full ? colleges : colleges.filter((c) => limited.includes(c.id));

  return (
    <>
      <PageHeader eyebrow="Community" title="Staff & roles" description="Who can do what. Every grant and removal is recorded in the audit log, and you cannot grant a role to yourself." />
      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <DataTable
          caption="Staff role assignments"
          columns={["Person", "Role", "Scope", "Since", ""]}
          empty={rows.length === 0 && <EmptyRow>No staff yet.</EmptyRow>}
        >
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="px-4 py-3"><p className="font-medium">{r.full_name}</p><p className="text-muted-foreground text-xs">@{r.username}</p></td>
              <td className="px-4 py-3">{ROLE_LABEL[r.role] ?? r.role}</td>
              <td className="text-muted-foreground px-4 py-3">{r.college_name ?? "Platform-wide"}</td>
              <td className="text-muted-foreground px-4 py-3 whitespace-nowrap">{fmtDate(r.created_at)}{r.granted_by_name ? ` · by ${r.granted_by_name}` : ""}</td>
              <td className="px-4 py-3 text-right">
                <ActionDialog
                  label="Remove" destructive askReason={false} title={`Remove ${r.full_name}'s ${ROLE_LABEL[r.role]} role?`}
                  description="They lose this access immediately."
                  action={revokeRoleAction} args={{ id: r.id }} confirmLabel="Remove role"
                />
              </td>
            </tr>
          ))}
        </DataTable>
        <div className="space-y-5">
          <Panel title="Add a staff member" description="They must already have a UniSphere account in the college.">
            <GrantRoleForm colleges={options.map((c) => ({ id: c.id, name: c.name }))} canGrantAdmin={full} />
          </Panel>
          <Panel title="What each role can do">
            <dl className="space-y-2 text-[13px]">
              {ROLE_HELP.map(([k, v]) => (
                <div key={k}><dt className="font-semibold">{k}</dt><dd className="text-muted-foreground">{v}</dd></div>
              ))}
            </dl>
          </Panel>
        </div>
      </div>
    </>
  );
}
