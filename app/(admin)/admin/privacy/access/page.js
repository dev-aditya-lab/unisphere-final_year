import { PageHeader } from "@/components/shell/page-header";
import { DataTable, EmptyRow, Panel, fmtDateTime } from "@/components/admin/ui";
import { AccessReviewForm } from "@/components/admin/privacy-admin";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Access review" };

export default async function AccessReviewPage() {
  await requirePermission("privacy.manage");
  const supabase = await createClient();
  const [{ data: staff }, { data: reviews }] = await Promise.all([
    supabase.rpc("privacy_access_snapshot"),
    supabase.from("privacy_access_reviews").select("id, reviewed_at, notes, snapshot").order("reviewed_at", { ascending: false }).limit(10),
  ]);
  const rows = staff ?? [];
  const officers = rows.filter((r) => r.role === "privacy_officer");

  return (
    <>
      <PageHeader eyebrow="Privacy" title="Access review" description="Everyone who holds a staff role. Only privacy officers can open privacy requests and breach records; global administrators cannot, unless they are also named privacy officers." />
      {officers.length < 2 && <p role="alert" className="text-warning-text mb-4 text-sm font-semibold">{officers.length === 0 ? "No privacy officer exists." : "Only one privacy officer exists."} Two are needed so nobody approves their own breach notice or handles their own request. Grant the role in Staff &amp; roles.</p>}
      <DataTable caption="Staff roles" columns={["Member", "Role", "Scope", "Granted", "Granted by", "Last sign-in", "Privacy permissions"]} empty={rows.length === 0 && <EmptyRow>No staff.</EmptyRow>}>
        {rows.map((r, i) => (
          <tr key={`${r.user_id}-${r.role}-${i}`} className="align-top">
            <td className="px-4 py-3"><span className="font-medium">{r.full_name}</span><span className="text-muted-foreground block text-xs">@{r.username}</span></td>
            <td className="px-4 py-3 whitespace-nowrap">{r.role.replace(/_/g, " ")}</td>
            <td className="text-muted-foreground px-4 py-3">{r.college_name ?? "Platform-wide"}</td>
            <td className="text-muted-foreground px-4 py-3 whitespace-nowrap">{fmtDateTime(r.granted_at)}</td>
            <td className="text-muted-foreground px-4 py-3">{r.granted_by_username ? `@${r.granted_by_username}` : "—"}</td>
            <td className="text-muted-foreground px-4 py-3 whitespace-nowrap">{fmtDateTime(r.last_sign_in_at)}</td>
            <td className="px-4 py-3 text-xs">{r.permissions?.length ? r.permissions.join(", ") : "none"}</td>
          </tr>
        ))}
      </DataTable>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Panel title="Record a review" description="Do this regularly (for example quarterly), and whenever someone leaves the team.">
          <AccessReviewForm />
        </Panel>
        <Panel title="Past reviews">
          {(reviews ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm">None recorded yet.</p>
          ) : (
            <ul className="divide-y text-sm">
              {reviews.map((r) => (
                <li key={r.id} className="py-2.5"><strong>{fmtDateTime(r.reviewed_at)}</strong> · {r.snapshot?.length ?? 0} role(s) at the time{r.notes && <span className="text-muted-foreground block text-xs">{r.notes}</span>}</li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
