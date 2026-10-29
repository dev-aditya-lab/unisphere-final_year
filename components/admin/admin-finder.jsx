"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "@/components/icons/lucide-compat";
import { adminIcon } from "@/components/admin/admin-icons";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ADMIN_GROUPS } from "@/lib/admin/nav";
import { cn } from "@/lib/utils";

/**
 * "Find a page": type a few letters, press Enter. Lists only the pages this member may open (the same list as the
 * sidebar), so it adds no access; it just removes the scrolling. Opens with Ctrl/Cmd+K or "/" outside of a text field.
 */
export function AdminFinder({ items, counts = {}, className }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName ?? "") || e.target?.isContentEditable;
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const go = useCallback(
    (href) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Find a page"
        aria-keyshortcuts="Control+K Meta+K"
        className={cn(
          "text-muted-foreground bg-muted/60 hover:bg-muted hover:text-foreground flex h-9 items-center gap-2 rounded-lg border px-2.5 text-sm transition-colors",
          className,
        )}
      >
        <Search className="size-4 shrink-0" aria-hidden="true" />
        <span className="hidden flex-1 text-left md:inline">Find a page…</span>
        <kbd className="bg-background hidden rounded border px-1.5 text-[11px] leading-5 font-medium md:inline">Ctrl K</kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen} title="Find a page" description="Search the admin pages you can open." className="sm:max-w-lg">
        <CommandInput placeholder="Find a page, e.g. reports, refunds, members…" />
        <CommandList className="max-h-[min(24rem,60dvh)]">
          <CommandEmpty>No page matches.</CommandEmpty>
          {ADMIN_GROUPS.map((group) => {
            const groupItems = items.filter((i) => i.group === group.id);
            if (groupItems.length === 0) return null;
            return (
              <CommandGroup key={group.id} heading={group.label}>
                {groupItems.map((item) => {
                  const Icon = adminIcon(item.icon);
                  const waiting = item.count ? (counts[item.count] ?? 0) : 0;
                  return (
                    <CommandItem key={item.href} value={`${item.label} ${group.label} ${item.href.replace(/[/-]/g, " ")}`} onSelect={() => go(item.href)}>
                      <Icon className="size-4" aria-hidden="true" />
                      <span className="flex-1 truncate">{item.label}</span>
                      {waiting > 0 && <span className="bg-primary text-primary-foreground rounded-full px-1.5 text-[11px] leading-5 font-semibold tabular-nums">{waiting > 99 ? "99+" : waiting}<span className="sr-only"> waiting</span></span>}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            );
          })}
        </CommandList>
      </CommandDialog>
    </>
  );
}
