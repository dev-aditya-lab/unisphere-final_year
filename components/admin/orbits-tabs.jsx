import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/orbits", label: "Overview & rewards" },
  { href: "/admin/orbits/questions", label: "Daily Challenge" },
  { href: "/admin/orbits/ledger", label: "Ledger & review" },
  { href: "/admin/orbits/seasons", label: "Seasons" },
];

export function OrbitsAdminTabs({ current }) {
  return (
    <nav aria-label="Orbits administration" className="bg-muted mb-5 flex w-full overflow-x-auto rounded-xl p-1 sm:w-fit">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={current === t.href ? "page" : undefined}
          className={cn("flex h-8 items-center rounded-lg px-3 text-[13px] font-semibold whitespace-nowrap transition-colors", current === t.href ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
