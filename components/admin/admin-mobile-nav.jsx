"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { AdminNav } from "@/components/admin/admin-nav";

export function AdminMobileNav({ items, counts }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open admin menu">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 overflow-y-auto p-0">
        <SheetHeader className="border-b p-4 text-left">
          <SheetTitle>Admin console</SheetTitle>
          <SheetDescription className="sr-only">Administration navigation</SheetDescription>
        </SheetHeader>
        <div className="p-3">
          <AdminNav items={items} counts={counts} onNavigate={() => setOpen(false)} />
        </div>
        <div className="border-t p-3 text-sm">
          <Link href="/feed" onClick={() => setOpen(false)} className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex w-full items-center gap-2 rounded-md px-2 py-2">
            <ArrowLeft className="size-4" aria-hidden="true" /> Back to UniSphere
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
