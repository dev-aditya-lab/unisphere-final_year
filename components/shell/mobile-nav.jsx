"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from "@/components/ui/sheet";
import { Logo } from "@/components/brand/logo";
import { NavLinks } from "@/components/shell/nav-links";
import { NavIcon } from "@/components/shell/nav-icons";
import { MOBILE_BOTTOM_HREFS } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function MobileDrawer({ items, counts }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation menu">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 overflow-y-auto p-0">
        <SheetHeader className="border-b p-4 text-left">
          <SheetTitle asChild>
            <div>
              <Logo href="/" />
            </div>
          </SheetTitle>
          <SheetDescription className="sr-only">Site navigation</SheetDescription>
        </SheetHeader>
        <div className="p-3">
          <NavLinks items={items} counts={counts} onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function BottomNav({ items, counts = {} }) {
  const pathname = usePathname();
  const bottom = MOBILE_BOTTOM_HREFS.map((href) => items.find((i) => i.href === href)).filter(Boolean);
  if (bottom.length < 2) return null;
  return (
    <nav
      aria-label="Quick navigation"
      className="bg-card/95 supports-[backdrop-filter]:bg-card/85 fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="mx-auto grid max-w-lg" style={{ gridTemplateColumns: `repeat(${bottom.length}, minmax(0, 1fr))` }}>
        {bottom.map(({ href, label, icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          const count = counts[href];
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <NavIcon name={icon} className="size-5" aria-hidden="true" />
                {label}
                {count > 0 && (
                  <span className="bg-primary text-primary-foreground absolute top-1 left-1/2 ml-2 min-w-4 rounded-full px-1 text-center text-[10px] leading-4 font-semibold">
                    {count > 9 ? "9+" : count}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
