"use client";

import { useId, useState } from "react";
import { useLiveMessageCount } from "@/lib/chat/unread-store";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { m } from "motion/react";
import { Menu, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from "@/components/ui/sheet";
import { Logo } from "@/components/brand/logo";
import { NavLinks } from "@/components/shell/nav-links";
import { NavIcon } from "@/components/shell/nav-icons";
import { CountBadge } from "@/components/motion/count-badge";
import { MOBILE_BOTTOM_HREFS, shouldPrefetch } from "@/lib/nav";
import { NavPending } from "@/components/shell/nav-pending";
import { EASE } from "@/lib/motion";
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
      <SheetContent side="left" className="bg-sidebar w-[19rem] overflow-y-auto p-0">
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

function Tab({ item, count, active, indicatorId }) {
  const { href, label, icon } = item;
  return (
    <Link
      href={href}
      prefetch={shouldPrefetch(href) ? undefined : false}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors",
        active ? "text-foreground" : "text-muted-foreground",
      )}
    >
      {active && (
        <m.span
          layoutId={indicatorId}
          aria-hidden="true"
          transition={EASE.spring}
          className="bg-coral absolute top-0 h-[3px] w-8 rounded-b-full"
        />
      )}
      <span className="relative">
        <NavIcon name={icon} className={cn("size-[22px] transition-transform duration-150", active && "scale-110")} aria-hidden="true" />
        <CountBadge value={count ?? 0} label="unread" className="absolute -top-2 -right-3 h-4 min-w-4 px-1 text-[10px]" />
      </span>
      {label}
      <NavPending className="absolute top-1.5 right-3" />
    </Link>
  );
}

/** Phone navigation: four destinations and a raised "post" button in the middle, clear of the home indicator. */
export function BottomNav({ items, counts = {} }) {
  const pathname = usePathname();
  const indicatorId = useId();
  const liveMessages = useLiveMessageCount(counts["/messages"]);
  const countFor = (href) => (href === "/messages" ? liveMessages : counts[href]);
  const bottom = MOBILE_BOTTOM_HREFS.map((href) => items.find((i) => i.href === href)).filter(Boolean);
  if (bottom.length < 2) return null;
  const mid = Math.ceil(bottom.length / 2);
  const left = bottom.slice(0, mid);
  const right = bottom.slice(mid);
  const isActive = (href) => pathname === href || pathname.startsWith(`${href}/`);
  return (
    <nav
      aria-label="Quick navigation"
      className="bg-card/95 supports-[backdrop-filter]:bg-card/90 pl-safe pr-safe fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur-md lg:hidden"
    >
      <div className="pb-safe">
        <ul className="mx-auto grid h-16 max-w-lg grid-cols-5">
          {left.map((item) => (
            <li key={item.href}>
              <Tab item={item} count={countFor(item.href)} active={isActive(item.href)} indicatorId={indicatorId} />
            </li>
          ))}
          <li className="relative">
            <Link
              href="/feed#compose"
              aria-label="Write a post"
              className="border-foreground bg-accent-hot text-accent-hot-foreground absolute -top-5 left-1/2 grid size-14 -translate-x-1/2 place-items-center rounded-2xl border shadow-[2px_2px_0_0_var(--hard)] transition-transform duration-150 active:translate-x-[calc(-50%+2px)] active:translate-y-0.5 active:shadow-none"
            >
              <Plus className="size-7" strokeWidth={2.75} aria-hidden="true" />
            </Link>
          </li>
          {right.map((item) => (
            <li key={item.href}>
              <Tab item={item} count={countFor(item.href)} active={isActive(item.href)} indicatorId={indicatorId} />
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
