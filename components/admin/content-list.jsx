import Link from "next/link";
import { Search } from "@/components/icons/lucide-compat";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { DataTable, EmptyRow, Pager, StatusBadge, fmtDate } from "@/components/admin/ui";
import { ActionDialog } from "@/components/admin/action-dialog";
import { moderatePostAction, setListingRemovedAction } from "@/lib/actions/admin";
import { listContent } from "@/lib/services/admin";

const COPY = {
  post: { title: "Posts", path: "/admin/posts", eyebrow: "Community", description: "Every post in your colleges, including removed ones. To act on a post that was reported, open the report so the decision is recorded against it.", statuses: ["published", "removed"], href: (r) => `/posts/${r.slug}` },
  community: { title: "Communities", path: "/admin/communities", eyebrow: "Community", description: "Clubs and communities. Removing one hides it for everyone and tells its creator why; it can be restored.", statuses: ["active", "removed"], href: (r) => `/communities/${r.slug}` },
  event: { title: "Events", path: "/admin/events", eyebrow: "Community", description: "All events. Removing one hides it and tells the organiser why; it can be restored.", statuses: ["published", "cancelled", "removed"], href: (r) => `/events/${r.slug}` },
};

/** Shared server component for /admin/posts, /admin/communities and /admin/events. */
export async function ContentList({ kind, searchParams }) {
  const sp = await searchParams;
  const copy = COPY[kind];
  const q = (sp.q ?? "").toString().trim().slice(0, 80) || null;
  const status = copy.statuses.includes(sp.status) ? sp.status : null;
  const page = Math.max(1, Number(sp.page) || 1);
  const rows = await listContent({ kind, q, status, page });
  const total = Number(rows[0]?.total_count ?? 0);

  return (
    <>
      <PageHeader eyebrow={copy.eyebrow} title={copy.title} description={copy.description} />
      <form method="get" className="surface mb-5 flex flex-wrap items-end gap-3 p-3" role="search" aria-label={`Find ${copy.title.toLowerCase()}`}>
        <label className="min-w-56 flex-1 text-[13px]">
          <span className="text-muted-foreground mb-1 block text-xs font-medium">Search</span>
          <span className="relative block">
            <Search aria-hidden="true" className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <input name="q" defaultValue={q ?? ""} className="border-input bg-card h-9 w-full rounded-md border pr-3 pl-9 text-sm" />
          </span>
        </label>
        <label className="text-[13px]">
          <span className="text-muted-foreground mb-1 block text-xs font-medium">Status</span>
          <select name="status" defaultValue={status ?? ""} className="border-input bg-card h-9 rounded-md border px-2 text-sm">
            <option value="">Any</option>
            {copy.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <Button type="submit" size="sm" variant="secondary">Filter</Button>
      </form>

      <DataTable caption={copy.title} columns={["Title", "Owner", "College", "Status", "Created", ""]} empty={rows.length === 0 && <EmptyRow>Nothing matches.</EmptyRow>}>
        {rows.map((r) => (
          <tr key={r.id} className="align-top">
            <td className="max-w-xs px-4 py-3">
              <Link href={copy.href(r)} target="_blank" className="font-medium hover:underline">{r.title}</Link>
              <p className="text-muted-foreground text-xs">{r.detail}</p>
            </td>
            <td className="px-4 py-3">{r.owner_name ?? "—"}{r.owner_username && <span className="text-muted-foreground block text-xs">@{r.owner_username}</span>}</td>
            <td className="text-muted-foreground px-4 py-3">{r.college_name ?? "—"}</td>
            <td className="px-4 py-3"><StatusBadge value={r.status} /></td>
            <td className="text-muted-foreground px-4 py-3 whitespace-nowrap">{fmtDate(r.created_at)}</td>
            <td className="px-4 py-3 text-right whitespace-nowrap">
              {kind === "post" ? (
                r.status === "published" ? (
                  <ActionDialog label="Remove" destructive title="Remove this post" description="It disappears for everyone but its author, who is told why and may appeal." action={moderatePostAction} args={{ id: r.id, action: "remove" }} reasonLabel="Reason shown to the author" />
                ) : r.status === "removed" ? (
                  <ActionDialog label="Restore" title="Restore this post" description="It becomes visible again." action={moderatePostAction} args={{ id: r.id, action: "restore" }} reasonLabel="Reason (recorded)" />
                ) : null
              ) : r.status === "removed" ? (
                <ActionDialog label="Restore" title={`Restore this ${kind}`} action={setListingRemovedAction} args={{ kind, id: r.id, removed: false }} reasonLabel="Reason (recorded)" />
              ) : (
                <ActionDialog label="Remove" destructive title={`Remove this ${kind}`} description="It is hidden for everyone. The creator is told why." action={setListingRemovedAction} args={{ kind, id: r.id, removed: true }} reasonLabel="Reason shown to the creator" />
              )}
            </td>
          </tr>
        ))}
      </DataTable>
      <Pager basePath={copy.path} page={page} total={total} params={{ q, status }} />
    </>
  );
}
