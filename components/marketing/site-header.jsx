import Link from "next/link";
import { Menu } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { getAuthUser } from "@/lib/auth/session";

export const MARKETING_LINKS = [
  { href: "/features", label: "Features" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/about", label: "About" },
  { href: "/guidelines", label: "Guidelines" },
];

export async function SiteHeader() {
  const user = await getAuthUser();
  return (
    <header className="mkt-header bg-background pt-safe sticky top-0 z-40 border-b">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:gap-8 sm:px-6">
        <Logo wordmarkClassName="font-display text-[1.5rem] font-bold tracking-[-0.04em]" />
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {MARKETING_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-muted-foreground hover:text-foreground after:bg-signal relative rounded-md px-3 py-2 text-[15px] font-medium transition-colors after:absolute after:inset-x-3 after:bottom-1 after:h-px after:origin-left after:scale-x-0 after:transition-transform after:duration-300 hover:after:scale-x-100 motion-reduce:after:transition-none"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          {user ? (
            <Button asChild size="sm" className="rounded-full px-4">
              <Link href="/feed">Open UniSphere</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <Link href="/login">Log in</Link>
              </Button>
              <Button asChild size="sm" variant="hot" className="rounded-full px-4">
                <Link href="/register">Join UniSphere</Link>
              </Button>
            </>
          )}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
                <SheetDescription className="sr-only">Site navigation</SheetDescription>
              </SheetHeader>
              <nav aria-label="Mobile" className="flex flex-col gap-1 px-4">
                {MARKETING_LINKS.map((l) => (
                  <SheetClose asChild key={l.href}>
                    <Link href={l.href} className="hover:bg-accent rounded-md px-3 py-3 text-base font-medium">
                      {l.label}
                    </Link>
                  </SheetClose>
                ))}
                {!user && (
                  <SheetClose asChild>
                    <Link href="/login" className="hover:bg-accent rounded-md px-3 py-3 text-base font-medium">
                      Log in
                    </Link>
                  </SheetClose>
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
      <span aria-hidden="true" className="scroll-progress" />
    </header>
  );
}
