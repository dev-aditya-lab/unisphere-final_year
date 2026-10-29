"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { ADMIN_GROUPS, ADMIN_NAV, findAdminNavItem } from "@/lib/admin/nav";

/** Where you are: Group › Page (› Details on a record). Derived from the menu, so it can never drift from it. */
export function AdminCrumbs() {
  const pathname = usePathname();
  const item = findAdminNavItem(pathname, ADMIN_NAV);
  if (!item) return <p className="font-heading truncate text-sm font-bold">Admin console</p>;
  const group = ADMIN_GROUPS.find((g) => g.id === item.group);
  const deeper = pathname !== item.href;
  const leaf = pathname.split("/").filter(Boolean).pop();
  const deepLabel = leaf === "new" ? "New" : "Details";
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        {group && item.href !== "/admin" && (
          <li className="text-muted-foreground hidden items-center gap-1.5 sm:flex">
            {group.label}
            <ChevronRight className="size-3.5" aria-hidden="true" />
          </li>
        )}
        <li className="min-w-0 truncate">
          {deeper ? (
            <Link href={item.href} className="text-muted-foreground hover:text-foreground transition-colors">{item.label}</Link>
          ) : (
            <span aria-current="page" className="font-heading font-bold">{item.label}</span>
          )}
        </li>
        {deeper && (
          <li className="flex shrink-0 items-center gap-1.5">
            <ChevronRight className="text-muted-foreground size-3.5" aria-hidden="true" />
            <span aria-current="page" className="font-heading font-bold">{deepLabel}</span>
          </li>
        )}
      </ol>
    </nav>
  );
}
