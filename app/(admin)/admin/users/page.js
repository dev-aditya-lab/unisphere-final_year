import Link from "next/link";
import { Search } from "@/components/icons/lucide-compat";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { DataTable, EmptyRow, Pager, StatusBadge, fmtDate } from "@/components/admin/ui";
import { UserAvatar } from "@/components/user-avatar";
import { listUsers } from "@/lib/services/admin";

export const metadata = { title: "Members" };

const STATUSES = ["active", "restricted", "suspended", "deactivated"];
const ROLES = ["global_admin", "college_admin", "moderator", "verification_staff", "support_agent"];
const ROLE_LABEL = { global_admin: "Global admin", college_admin: "College admin", moderator: "Moderator", verification_staff: "Verification", support_agent: "Support", privacy_officer: "Privacy officer" };
const SORTS = [
  ["created", "Newest or oldest joined"],
  ["last_seen", "Last sign-in"],
  ["name", "Name"],
];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const field = "border-input bg-card h-9 rounded-md border px-2 text-sm";

export default async function UsersPage({ searchParams }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").toString().trim().slice(0, 80) || null;
  const status = STATUSES.includes(sp.status) ? sp.status : null;
  const role = ROLES.includes(sp.role) ? sp.role : null;
  const from = DATE.test(sp.from ?? "") ? sp.from : null;
  const to = DATE.test(sp.to ?? "") ? sp.to : null;
  const sort = SORTS.some(([v]) => v === sp.sort) ? sp.sort : "created";
  const dir = sp.dir === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number(sp.page) || 1);
  const rows = await listUsers({ q, status, role, from, to, sort, dir, page });
  const total = Number(rows[0]?.total_count ?? 0);

  return (
    <>
      <PageHeader eyebrow="Community" title="Members" description="Find a member by name, @username, email or user ID. Only members of colleges you administer appear here." />
      <form method="get" className="surface mb-5 flex flex-wrap items-end gap-3 p-3" role="search" aria-label="Find members">
        <label className="min-w-56 flex-1 text-[13px]">
          <span className="text-muted-foreground mb-1 block text-xs font-medium">Search</span>
          <span className="relative block">
            <Search aria-hidden="true" className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <input name="q" defaultValue={q ?? ""} placeholder="Name, @username, email or ID" className="border-input bg-card h-9 w-full rounded-md border pr-3 pl-9 text-sm" />
          </span>
        </label>
        <label className="text-[13px]">
          <span className="text-muted-foreground mb-1 block text-xs font-medium">Status</span>
          <select name="status" defaultValue={status ?? ""} className={field}>
            <option value="">Any</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="text-[13px]">
          <span className="text-muted-foreground mb-1 block text-xs font-medium">Staff role</span>
          <select name="role" defaultValue={role ?? ""} className={field}>
            <option value="">Any</option>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </label>
        <label className="text-[13px]">
          <span className="text-muted-foreground mb-1 block text-xs font-medium">Joined from</span>
          <input type="date" name="from" defaultValue={from ?? ""} className={field} />
        </label>
        <label className="text-[13px]">
          <span className="text-muted-foreground mb-1 block text-xs font-medium">Joined to</span>
          <input type="date" name="to" defaultValue={to ?? ""} className={field} />
        </label>
        <label className="text-[13px]">
          <span className="text-muted-foreground mb-1 block text-xs font-medium">Sort by</span>
          <select name="sort" defaultValue={sort} className={field}>
            {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="text-[13px]">
          <span className="text-muted-foreground mb-1 block text-xs font-medium">Order</span>
          <select name="dir" defaultValue={dir} className={field}>
            <option value="desc">Newest / Z-A first</option>
            <option value="asc">Oldest / A-Z first</option>
          </select>
        </label>
        <Button type="submit" size="sm" variant="secondary">Search</Button>
      </form>

      <p className="text-muted-foreground mb-2 text-xs" aria-live="polite">{total.toLocaleString()} member{total === 1 ? "" : "s"} match.</p>
      <DataTable
        caption="Members"
        columns={["Member", "College", "Status", "Staff", "Joined", "Last sign-in", ""]}
        empty={rows.length === 0 && <EmptyRow>No members match.</EmptyRow>}
      >
        {rows.map((u) => (
          <tr key={u.id} className="hover:bg-muted/40">
            <td className="px-4 py-3">
              <div className="flex items-center gap-3">
                <UserAvatar name={u.full_name} avatarKey={u.avatar_key} size="sm" />
                <div className="min-w-0">
                  <p className="truncate font-medium">{u.full_name}</p>
                  <p className="text-muted-foreground truncate text-xs">@{u.username} · {u.email}</p>
                </div>
              </div>
            </td>
            <td className="text-muted-foreground px-4 py-3">{u.college_name ?? "—"}</td>
            <td className="px-4 py-3">
              <StatusBadge value={u.status} />
              {u.restricted_until && <p className="text-muted-foreground mt-0.5 text-xs">until {fmtDate(u.restricted_until)}</p>}
            </td>
            <td className="text-muted-foreground px-4 py-3 text-xs">{u.roles.length ? u.roles.map((r) => ROLE_LABEL[r] ?? r).join(", ") : "—"}</td>
            <td className="text-muted-foreground px-4 py-3 whitespace-nowrap">{fmtDate(u.created_at)}</td>
            <td className="text-muted-foreground px-4 py-3 whitespace-nowrap">{u.last_sign_in_at ? fmtDate(u.last_sign_in_at) : "Never"}</td>
            <td className="px-4 py-3 text-right">
              <Link href={`/admin/users/${u.id}`} className="text-blue-text font-semibold hover:underline">
                Open<span className="sr-only"> {u.full_name}</span>
              </Link>
            </td>
          </tr>
        ))}
      </DataTable>
      <Pager basePath="/admin/users" page={page} total={total} params={{ q, status, role, from, to, sort, dir }} />
    </>
  );
}
