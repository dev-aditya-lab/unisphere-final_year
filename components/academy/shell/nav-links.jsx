"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** A row of links that marks the current section. `variant="dark"` is for the always-dark header. */
export function NavLinks({ links, className, linkClassName, label = "Main", exact = false }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className={className}>
      {links.map((l) => {
        const active = exact || l.exact ? pathname === l.href : pathname === l.href || pathname.startsWith(`${l.href}/`);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cn("relative rounded-md px-3 py-2 text-sm font-medium transition-colors", active ? "text-foreground" : "text-muted-foreground hover:text-foreground", linkClassName)}
          >
            {l.label}
            <span aria-hidden className={cn("bg-primary absolute inset-x-3 -bottom-px h-0.5 origin-left rounded-full transition-transform duration-300", active ? "scale-x-100" : "scale-x-0")} />
          </Link>
        );
      })}
    </nav>
  );
}
