import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/admin/ui";
import { CollegeDirectoryRow, CollegeReportRow } from "@/components/admin/college-directory";
import { Button } from "@/components/ui/button";
import { getMyPermissions } from "@/lib/auth/session";
import { PAGE_SIZE, listCollegeDirectory, listCollegeReports } from "@/lib/services/admin";

export const metadata = { title: "Colleges" };

const FILTERS = [
  ["all", "All"],
  ["community", "Community-added"],
  ["verified", "Verified"],
  ["hidden", "Hidden"],
  ["merged", "Merged"],
];

export default async function CollegesPage({ searchParams }) {
  const sp = await searchParams;
  const status = FILTERS.some(([v]) => v === sp.status) ? sp.status : "all";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const onlyReported = sp.reported === "1";
  const page = Math.max(1, Number.parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1);

  const perms = await getMyPermissions();
  const canMerge = perms.some((p) => p.permission === "colleges.manage");
  const canVerify = canMerge;

  const [directory, reports] = await Promise.all([
    listCollegeDirectory({ status, q: q || null, onlyReported, page }),
    listCollegeReports({ status: "open" }),
  ]);
  const total = Number(directory?.[0]?.total_count ?? 0);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (patch) => {
    const next = { status, ...(q ? { q } : {}), ...(onlyReported ? { reported: "1" } : {}), ...patch };
    if (next.status === "all") delete next.status;
    if (!next.page || next.page === 1) delete next.page;
    return `/admin/colleges?${new URLSearchParams(Object.fromEntries(Object.entries(next).map(([k, val]) => [k, String(val)]))).toString()}`;
  };

  return (
    <>
      <PageHeader
        eyebrow="Community"
        title="College directory"
        description="Members add colleges by name, so the list grows as people join. Nothing here needs approval before it appears. Use this page to fix mistakes, merge duplicates and handle reports."
      />

      <div className="space-y-5">
        <Panel title={`Open reports (${reports.length})`} description="Corrections, duplicates and abuse reports from members.">
          {reports.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nothing waiting.</p>
          ) : (
            <ul className="space-y-3">
              {reports.map((r) => (
                <CollegeReportRow key={r.id} report={r} />
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={`Directory (${total.toLocaleString()})`}>
          <form action="/admin/colleges" className="mb-4 flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <label htmlFor="dir-q" className="text-[13px] font-semibold">Search</label>
              <input id="dir-q" name="q" defaultValue={q} placeholder="Name or slug" className="border-input bg-card h-10 w-64 rounded-lg border px-3 text-sm" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="dir-status" className="text-[13px] font-semibold">Show</label>
              <select id="dir-status" name="status" defaultValue={status}>
                {FILTERS.map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 pb-2.5 text-sm">
              <input type="checkbox" name="reported" value="1" defaultChecked={onlyReported} /> Only with open reports
            </label>
            <Button type="submit" size="sm">Filter</Button>
          </form>

          {directory.length === 0 ? (
            <p className="text-muted-foreground text-sm">No colleges match.</p>
          ) : (
            <ul className="space-y-2.5">
              {directory.map((c) => (
                <li key={c.id}>
                  <CollegeDirectoryRow college={c} canVerify={canVerify} canMerge={canMerge} />
                </li>
              ))}
            </ul>
          )}

          {pages > 1 && (
            <nav aria-label="Pages" className="mt-4 flex items-center justify-between">
              <Button asChild variant="outline" size="sm" className={page <= 1 ? "pointer-events-none opacity-50" : ""}>
                <Link href={qs({ page: page - 1 })}>Previous</Link>
              </Button>
              <span className="text-muted-foreground text-sm">Page {page} of {pages}</span>
              <Button asChild variant="outline" size="sm" className={page >= pages ? "pointer-events-none opacity-50" : ""}>
                <Link href={qs({ page: page + 1 })}>Next</Link>
              </Button>
            </nav>
          )}
        </Panel>
      </div>
    </>
  );
}
