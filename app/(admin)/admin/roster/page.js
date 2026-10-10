import { PageHeader } from "@/components/shell/page-header";
import { DataTable, EmptyRow, FilterTabs, Pager, Panel, StatCard, StatusBadge, fmtDateTime, fmtNumber } from "@/components/admin/ui";
import { ActionDialog } from "@/components/admin/action-dialog";
import { RosterImport } from "@/components/admin/roster-import";
import { getMyPermissions } from "@/lib/auth/session";
import { manageRosterEntryAction } from "@/lib/actions/admin";
import { getRosterStats, listColleges, listRoster } from "@/lib/services/admin";
import { redirect } from "next/navigation";

export const metadata = { title: "Student IDs" };

const VIEWS = [
  { value: "all", label: "All" },
  { value: "unclaimed", label: "Not yet claimed" },
  { value: "claimed", label: "Claimed" },
  { value: "revoked", label: "Revoked" },
];

export default async function RosterPage({ searchParams }) {
  const sp = await searchParams;
  const [perms, colleges] = await Promise.all([getMyPermissions(), listColleges()]);
  const rows = perms.filter((p) => p.permission === "roster.manage");
  if (rows.length === 0) redirect("/forbidden");
  const global = rows.some((r) => r.college_id === null);
  const allowed = colleges.filter((c) => global || rows.some((r) => r.college_id === c.id));
  const college = allowed.find((c) => c.id === sp.college) ?? allowed.find((c) => c.verification_mode === "student_id") ?? allowed[0];
  if (!college) redirect("/forbidden");

  const status = VIEWS.some((v) => v.value === sp.status) ? sp.status : "all";
  const q = (sp.q ?? "").toString().trim().slice(0, 60) || null;
  const page = Math.max(1, Number(sp.page) || 1);
  const [stats, entries] = await Promise.all([getRosterStats(college.id), listRoster({ college: college.id, status, q, page })]);
  const total = Number(entries[0]?.total_count ?? 0);

  return (
    <>
      <PageHeader
        eyebrow="Review queues" title="Student IDs"
        description={`${college.name} keeps a private list of valid student IDs. Members enter their ID once; it is matched against this list and linked to exactly one account. IDs are stored only as keyed hashes, so nobody — including administrators — can read them back.`}
      />
      {allowed.length > 1 && (
        <form method="get" className="mb-4 flex items-end gap-2 text-[13px]">
          <label>
            <span className="text-muted-foreground mb-1 block text-xs font-medium">College</span>
            <select name="college" defaultValue={college.id} className="border-input bg-card h-9 rounded-md border px-2 text-sm">
              {allowed.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <button className="border-input hover:bg-muted h-9 rounded-md border px-3 text-sm">Switch</button>
        </form>
      )}

      <section aria-label="Numbers" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Valid IDs on the list" value={fmtNumber(stats.total)} />
        <StatCard label="Claimed" value={fmtNumber(stats.claimed)} hint={stats.total ? `${Math.round((stats.claimed / stats.total) * 100)}% of the list` : "—"} />
        <StatCard label="Not yet claimed" value={fmtNumber(stats.total - stats.claimed)} />
        <StatCard label="Verified members" value={fmtNumber(stats.verified_members)} hint="By any method" />
      </section>

      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <div>
          <FilterTabs label="List views" basePath="/admin/roster" param="status" current={status} options={VIEWS} extra={{ college: college.id, q }} />
          <form method="get" className="mb-4 flex gap-2" role="search" aria-label="Search the list">
            <input type="hidden" name="college" value={college.id} />
            <input type="hidden" name="status" value={status} />
            <input name="q" defaultValue={q ?? ""} placeholder="Last 3 characters, name or username" className="border-input bg-card h-9 w-full max-w-xs rounded-md border px-3 text-sm" aria-label="Search" />
            <button className="border-input hover:bg-muted h-9 rounded-md border px-3 text-sm">Search</button>
          </form>
          <DataTable caption="Student ID list" columns={["ID", "Batch", "Status", "Linked member", "Since", ""]} empty={entries.length === 0 && <EmptyRow>No entries. Import the college&rsquo;s list to get started.</EmptyRow>}>
            {entries.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-3 font-mono text-xs">{e.id_hint ?? "—"}</td>
                <td className="text-muted-foreground px-4 py-3">{e.batch_year ?? "—"}</td>
                <td className="px-4 py-3"><StatusBadge value={e.status === "unclaimed" ? "pending" : e.status === "claimed" ? "verified" : "removed"} className="capitalize" /></td>
                <td className="px-4 py-3">{e.full_name ? <>{e.full_name}<span className="text-muted-foreground block text-xs">@{e.username}</span></> : "—"}</td>
                <td className="text-muted-foreground px-4 py-3 whitespace-nowrap">{fmtDateTime(e.claimed_at ?? e.revoked_at ?? e.created_at)}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {e.status === "claimed" && (
                    <ActionDialog label="Release" title="Release this ID from the member" description="The member loses their verified badge. The ID stays valid so its real owner can claim it. Use this if someone claimed an ID that is not theirs." action={manageRosterEntryAction} args={{ id: e.id, action: "release" }} reasonLabel="Reason (the member is told)" />
                  )}
                  {e.status !== "revoked" && (
                    <ActionDialog label="Revoke" destructive title="Revoke this ID" description="The ID can no longer be used to verify anyone, and a linked member loses their badge. Use this when a student has left the college." action={manageRosterEntryAction} args={{ id: e.id, action: "revoke" }} reasonLabel="Reason (recorded)" />
                  )}
                  {e.status === "revoked" && (
                    <ActionDialog label="Restore" title="Restore this ID" action={manageRosterEntryAction} args={{ id: e.id, action: "restore" }} reasonLabel="Reason (recorded)" />
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
          <Pager basePath="/admin/roster" page={page} total={total} params={{ college: college.id, status, q }} />
        </div>

        <Panel title="Import IDs" description="Paste IDs from the college's records: one per line, optionally followed by a comma and the batch year.">
          <RosterImport collegeId={college.id} />
          <p className="text-muted-foreground mt-3 text-xs">
            Re-importing is safe: IDs already on the list are skipped. Handle the source file as confidential and delete it after importing. Members whose ID is missing can still use manual review.
          </p>
        </Panel>
      </div>
    </>
  );
}
