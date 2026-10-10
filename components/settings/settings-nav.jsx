"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/settings/profile", label: "Profile" },
  { href: "/settings/privacy", label: "Privacy" },
  { href: "/settings/notifications", label: "Notifications" },
  { href: "/settings/verification", label: "Verification" },
  { href: "/settings/security", label: "Security" },
];

export function SettingsNav({ extra = [] }) {
  const pathname = usePathname();
  const links = [...LINKS, ...extra];
  return (
    <nav aria-label="Settings" className="-mx-1 mb-6 overflow-x-auto border-b">
      <ul className="flex min-w-max gap-1 px-1">
        {links.map((l) => {
          const active = pathname === l.href;
          return (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative block px-3 py-2.5 text-sm font-medium transition-colors",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {l.label}
                {active && <span aria-hidden="true" className="bg-primary absolute inset-x-3 -bottom-px h-0.5 rounded-full" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
