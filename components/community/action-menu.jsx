"use client";

import { useState, useSyncExternalStore } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const QUERY = "(max-width: 767px), (pointer: coarse)";
const subscribe = (cb) => {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
/** A touch screen or a narrow window gets a bottom sheet; a pointer and a wide window get a menu next to the button. */
export function useTouchMenu() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
}

/**
 * One list of actions, shown the way the device wants it:
 *  - desktop: a menu anchored to the button. Radix keeps it inside the window (it flips and shifts), opens with Enter/Space/Arrow keys
 *    and is operated with the arrow keys, Home/End, typeahead and Escape. Right-click on the item it belongs to opens the same menu;
 *  - phone or tablet: a bottom sheet with large rows. Nothing needs hover or a secondary click, and a long press also opens it.
 *
 * items: [{ id, label, icon, onSelect, href, destructive, hidden, disabled, separatorBefore }]. `href` renders a real link (so
 * "Open" and "Download" work with the browser's own behaviour), `onSelect` runs a function.
 *
 * Which actions exist is the caller's decision, from the member's role; the server checks every one again. A hidden button is a
 * courtesy, never the protection.
 */
export function ActionMenu({ trigger, items, title = "Actions", description, align = "end", open: controlledOpen, onOpenChange }) {
  const touch = useTouchMenu();
  const [innerOpen, setInnerOpen] = useState(false);
  const open = controlledOpen ?? innerOpen;
  const setOpen = (value) => {
    setInnerOpen(value);
    onOpenChange?.(value);
  };
  const visible = items.filter((i) => !i.hidden);
  if (visible.length === 0) return null;

  if (touch) {
    return (
      <>
        <span onClick={() => setOpen(true)} className="contents">
          {trigger}
        </span>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="max-h-[85dvh] gap-0 overflow-y-auto p-0">
            <SheetHeader className="pb-2">
              <SheetTitle className="text-base">{title}</SheetTitle>
              <SheetDescription className={description ? undefined : "sr-only"}>{description ?? "Choose what to do."}</SheetDescription>
            </SheetHeader>
            <ul className="px-2 pb-3">
              {visible.map((item) => {
                const Icon = item.icon;
                const row = cn(
                  "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] font-medium outline-none active:bg-accent focus-visible:bg-accent disabled:opacity-50",
                  item.destructive ? "text-destructive-text" : "text-foreground",
                );
                return (
                  <li key={item.id} className={item.separatorBefore ? "mt-1 border-t pt-1" : undefined}>
                    {item.href ? (
                      <a href={item.href} target={item.external ? "_blank" : undefined} rel={item.external ? "noopener noreferrer" : undefined} className={row} onClick={() => setOpen(false)}>
                        {Icon && <Icon className="size-5 shrink-0" aria-hidden="true" />}
                        {item.label}
                      </a>
                    ) : (
                      <button
                        type="button"
                        disabled={item.disabled}
                        className={row}
                        onClick={() => {
                          setOpen(false);
                          // after the sheet has started closing, so a dialog opened by the action is not closed with it
                          setTimeout(() => item.onSelect?.(), 0);
                        }}
                      >
                        {Icon && <Icon className="size-5 shrink-0" aria-hidden="true" />}
                        {item.label}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} collisionPadding={8} className="min-w-52">
        {visible.map((item) => {
          const Icon = item.icon;
          return (
            <span key={item.id}>
              {item.separatorBefore && <DropdownMenuSeparator />}
              {item.href ? (
                <DropdownMenuItem asChild variant={item.destructive ? "destructive" : "default"}>
                  <a href={item.href} target={item.external ? "_blank" : undefined} rel={item.external ? "noopener noreferrer" : undefined}>
                    {Icon && <Icon aria-hidden="true" />}
                    {item.label}
                  </a>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem variant={item.destructive ? "destructive" : "default"} disabled={item.disabled} onSelect={() => setTimeout(() => item.onSelect?.(), 0)}>
                  {Icon && <Icon aria-hidden="true" />}
                  {item.label}
                </DropdownMenuItem>
              )}
            </span>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
