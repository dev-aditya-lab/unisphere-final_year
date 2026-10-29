"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/academy/dashboard", label: "Overview" },
  { href: "/academy/my-learning", label: "My learning" },
  { href: "/academy/schedule", label: "Schedule" },
  { href: "/academy/assignments", label: "Assignments" },
  { href: "/academy/certificates", label: "Certificates" },
  { href: "/academy/payments", label: "Payments" },
  { href: "/academy/courses", label: "Browse", external: true },
];

/** Section tabs for the signed-in Academy pages, inside the normal UniSphere app (same sidebar, bell, profile and settings). */
export function AcademyTabs({ teacher = false }) {
  const pathname = usePathname();
  const links = teacher ? [...LINKS.slice(0, 2), { href: "/academy/teach", label: "Teaching" }, ...LINKS.slice(2)] : LINKS;
  return (
    <nav aria-label="Academy" className="border-b">
      <div className="flex gap-1 overflow-x-auto px-1">
        {links.map((l) => {
          const active = !l.external && (pathname === l.href || pathname.startsWith(`${l.href}/`));
          return (
            <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined} className={cn("relative shrink-0 px-3 py-3 text-sm font-medium whitespace-nowrap transition-colors", active ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {l.label}
              <span aria-hidden className={cn("bg-foreground absolute inset-x-3 bottom-0 h-0.5 origin-left rounded-full transition-transform duration-300", active ? "scale-x-100" : "scale-x-0")} />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
