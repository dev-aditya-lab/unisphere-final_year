import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { DataTable, EmptyRow, Panel, fmtDateTime } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Privacy team" };

/**
 * Where a global administrator learns how privacy access works. Privacy requests, grievances and breach records are open
 * only to privacy officers, so this page shows who they are (names only) and how to appoint one; it never shows the records.
 */
export default async function PrivacyTeamPage() {
  await requirePermission("roles.manage");
  const { data } = await createAdminClient()
    .from("user_roles")
    .select("created_at, profiles!user_roles_user_id_fkey(username, full_name)")
    .eq("role", "privacy_officer")
    .order("created_at");
  const rows = data ?? [];
  return (
    <>
      <PageHeader eyebrow="Privacy" title="Privacy team" description="Privacy requests, grievances and data-breach records are visible only to named privacy officers. Global administrators cannot open them, on purpose." />
      {rows.length < 2 && (
        <p role="alert" className="text-warning-text mb-4 text-sm font-semibold">
          {rows.length === 0 ? "Nobody is a privacy officer yet, so nobody can answer privacy requests." : "Only one privacy officer exists. Appoint a second so nobody handles their own request or approves their own breach notice."}
        </p>
      )}
      <DataTable caption="Privacy officers" columns={["Member", "Since"]} empty={rows.length === 0 && <EmptyRow>No privacy officers.</EmptyRow>}>
        {rows.map((r) => (
          <tr key={r.profiles?.username}>
            <td className="px-4 py-3"><span className="font-medium">{r.profiles?.full_name}</span><span className="text-muted-foreground block text-xs">@{r.profiles?.username}</span></td>
            <td className="text-muted-foreground px-4 py-3">{fmtDateTime(r.created_at)}</td>
          </tr>
        ))}
      </DataTable>
      <Panel title="Appoint a privacy officer" className="mt-6">
        <p className="text-muted-foreground text-sm leading-relaxed">
          Go to <Link href="/admin/roles" className="text-blue-text underline">Staff &amp; roles</Link>, enter their exact username, and choose &ldquo;Privacy officer&rdquo;. You cannot give the role to yourself: ask another global administrator, or run <code className="font-mono text-xs">npm run privacy:grant-officer -- their@email</code> on the server. They then see the <strong>Privacy</strong> section of this console.
        </p>
      </Panel>
    </>
  );
}
