import { PageHeader } from "@/components/shell/page-header";
import { ActionDialog } from "@/components/admin/action-dialog";
import { DataTable, EmptyRow, StatusBadge, fmtDate, fmtDateTime } from "@/components/admin/ui";
import { OrbitsAdminTabs } from "@/components/admin/orbits-tabs";
import { SeasonDialog } from "@/components/admin/orbits-admin";
import { finalizeSeasonAction } from "@/lib/actions/orbits-admin";
import { read } from "@/lib/services/admin";

export const metadata = { title: "Orbit seasons" };

export default async function AdminSeasonsPage() {
  const [seasons, today] = await Promise.all([read("orbit_admin_seasons"), read("orbit_today")]);
  return (
    <>
      <PageHeader
        eyebrow="Insights & system"
        title="Orbit seasons"
        description="Ranking badges (Orbit Elite) come only from a finalised season: the top 10 by Orbits earned between its dates, in all of UniSphere, within each college that has enough members, and among each member's connections. A season ends on its last day and is then finalised automatically by the background worker, or by you here."
        actions={<SeasonDialog />}
      />
      <OrbitsAdminTabs current="/admin/orbits/seasons" />
      <DataTable caption="Seasons" columns={["Season", "Dates (IST)", "Status", "Finalised", ""]} empty={seasons.length === 0 && <EmptyRow>No seasons yet. Create one to start awarding ranking badges.</EmptyRow>}>
        {seasons.map((s) => {
          const ended = s.ends_on < today;
          return (
            <tr key={s.id}>
              <td className="px-4 py-3 font-medium">{s.name}</td>
              <td className="px-4 py-3 whitespace-nowrap">{fmtDate(s.starts_on)} to {fmtDate(s.ends_on)}</td>
              <td className="px-4 py-3"><StatusBadge value={s.status === "finalized" ? "completed" : ended ? "pending" : "active"} className="capitalize" /><span className="sr-only"> {s.status}{ended ? ", ended" : ""}</span></td>
              <td className="text-muted-foreground px-4 py-3">{s.finalized_at ? fmtDateTime(s.finalized_at) : "—"}</td>
              <td className="flex justify-end gap-2 px-4 py-3">
                {s.status === "active" && <SeasonDialog season={s} />}
                {s.status === "active" && ended && (
                  <ActionDialog label="Finalise" title={`Finalise ${s.name}?`} description="This records the real top 10s from the ledger and awards each badge once. It cannot be repeated or undone." action={finalizeSeasonAction} args={{ id: s.id }} askReason={false} confirmLabel="Finalise season" variant="default" />
                )}
              </td>
            </tr>
          );
        })}
      </DataTable>
    </>
  );
}
