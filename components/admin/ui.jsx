import Link from "next/link";
import { ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { Inbox } from "@/components/icons/lucide-compat";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PAGE_SIZE } from "@/lib/admin/paging";

/** Small server-rendered building blocks shared across the admin console. */

const STATUS_VARIANT = {
  open: "warning", in_review: "soft", resolved: "success", dismissed: "mono",
  pending: "warning", needs_info: "warning", approved: "success", rejected: "danger", cancelled: "mono",
  upheld: "success", denied: "danger",
  active: "success", restricted: "warning", suspended: "danger", deactivated: "mono", deleted: "mono",
  published: "success", removed: "danger", new: "warning", in_progress: "soft", spam: "mono", processing: "soft", completed: "success",
  low: "mono", medium: "warning", high: "danger", critical: "danger",
  verified: "success", unverified: "mono",
  paid: "success", created: "warning", failed: "danger", refunded: "mono", awaiting_document: "warning", pending_review: "warning",
};

export function StatusBadge({ value, className }) {
  if (!value) return null;
  return (
    <Badge variant={STATUS_VARIANT[value] ?? "mono"} className={className}>
      {String(value).replace(/_/g, " ")}
    </Badge>
  );
}

export function StatCard({ label, value, hint, href, tone }) {
  const attention = tone === "warn" && Number(String(value).replace(/,/g, "")) > 0;
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="eyebrow">{label}</p>
        {href && <ArrowUpRight className="text-muted-foreground size-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true" />}
      </div>
      <p className={cn("font-heading mt-1.5 text-3xl font-extrabold tabular-nums", attention && "text-warning-text")}>{value}</p>
      {hint && <p className="text-muted-foreground mt-1 text-xs leading-snug">{hint}</p>}
    </>
  );
  const frame = cn("surface relative block p-4", attention && "border-warning/40 bg-warning-soft/40");
  return href ? (
    <Link href={href} className={cn(frame, "group hover:border-ring transition-colors")}>
      {body}
    </Link>
  ) : (
    <div className={frame}>{body}</div>
  );
}

export function Panel({ title, description, actions, children, className }) {
  return (
    <section className={cn("surface p-4 sm:p-5", className)}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            {title && <h2 className="font-heading text-base font-bold">{title}</h2>}
            {description && <p className="text-muted-foreground mt-0.5 text-[13px]">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

/** Link-based filter tabs: state lives in the URL, so views are shareable and work without JS. */
export function FilterTabs({ label, basePath, param = "status", current, options, extra = {} }) {
  const href = (value) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(extra)) if (v) sp.set(k, v);
    sp.set(param, value);
    return `${basePath}?${sp}`;
  };
  return (
    <nav aria-label={label} className="mb-4 flex flex-wrap gap-1 rounded-lg border bg-muted/50 p-1 sm:w-fit">
      {options.map((o) => (
        <Link
          key={o.value}
          href={href(o.value)}
          aria-current={current === o.value ? "page" : undefined}
          className={cn(
            "rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors",
            current === o.value ? "bg-card text-foreground shadow-sm ring-1 ring-border font-semibold" : "text-muted-foreground hover:bg-card/70 hover:text-foreground",
          )}
        >
          {o.label}
        </Link>
      ))}
    </nav>
  );
}

export function Pager({ basePath, page, total, params = {} }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages <= 1) return null;
  const href = (p) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    sp.set("page", String(p));
    return `${basePath}?${sp}`;
  };
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
      <p className="text-muted-foreground">
        Page {page} of {pages} · {total} total
      </p>
      <div className="flex gap-2">
        {page > 1 && (
          <Link href={href(page - 1)} className="bg-card hover:bg-muted inline-flex items-center gap-1 rounded-md border px-3 py-1.5 font-medium transition-colors">
            <ChevronLeft className="size-4" aria-hidden="true" /> Previous
          </Link>
        )}
        {page < pages && (
          <Link href={href(page + 1)} className="bg-card hover:bg-muted inline-flex items-center gap-1 rounded-md border px-3 py-1.5 font-medium transition-colors">
            Next <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        )}
      </div>
    </nav>
  );
}

/**
 * Responsive table: scrolls horizontally inside its card on small screens instead of breaking the page.
 * `relative` matters: visually hidden text (sr-only) is absolutely positioned, and without a positioned ancestor the
 * scroll container does not clip it, so a link in the last column made the whole page scroll sideways on a phone.
 */
export function DataTable({ caption, columns, children, empty }) {
  return (
    <div className="surface relative overflow-x-auto">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-muted/60 text-muted-foreground border-b text-[11px] tracking-wide uppercase">
          <tr>
            {columns.map((c) => (
              <th key={c.label ?? c} scope="col" className={cn("px-4 py-2.5 font-semibold whitespace-nowrap", c.className)}>
                {c.label ?? c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&_tr]:transition-colors [&_tr:hover]:bg-muted/40 divide-y">{children}</tbody>
      </table>
      {empty}
    </div>
  );
}

export function EmptyRow({ children = "Nothing here." }) {
  return (
    <div className="text-muted-foreground flex flex-col items-center gap-2 px-4 py-12 text-center text-sm">
      <span className="bg-muted grid size-10 place-items-center rounded-full" aria-hidden="true">
        <Inbox className="size-5" />
      </span>
      <p>{children}</p>
    </div>
  );
}

export const fmtDateTime = (iso) =>
  iso ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(iso)) : "—";
export const fmtDate = (iso) => (iso ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(new Date(iso)) : "—");
export const fmtNumber = (n) => new Intl.NumberFormat("en-IN").format(Number(n) || 0);
