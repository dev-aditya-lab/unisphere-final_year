import Link from "next/link";
import { Menu } from "lucide-react";
import { AcademyLogo } from "@/components/academy/brand/academy-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { getAuthUser } from "@/lib/auth/session";
import { NavLinks } from "@/components/academy/shell/nav-links";

export const ACADEMY_LINKS = [
  { href: "/academy/courses", label: "Courses" },
  { href: "/academy/programs", label: "Programs" },
  { href: "/academy/internships", label: "Internships" },
  { href: "/academy/mentorship", label: "Mentorship" },
  { href: "/academy/pricing", label: "Pricing" },
  { href: "/academy/verify", label: "Verify a certificate" },
];

/** The Academy's own header. It is always dark (ink), whatever the colour mode, so the hero and the header read as one surface. */
export async function AcademyHeader() {
  const user = await getAuthUser();
  return (
    <header className="pt-safe ac-noprint sticky top-0 z-40 border-b border-border bg-background text-foreground">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:gap-6 sm:px-6">
        <AcademyLogo />
        <NavLinks links={ACADEMY_LINKS.slice(0, 5)} className="ml-4 hidden items-center gap-0.5 lg:flex" />
        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle />
          {user ? (
            <Button asChild size="sm" className="rounded-full px-4"><Link href="/academy/dashboard">My learning</Link></Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex"><Link href="/login?next=%2Facademy%2Fdashboard">Sign in</Link></Button>
              <Button asChild size="sm" className="rounded-full px-4"><Link href="/register?next=%2Facademy%2Fdashboard">Join free</Link></Button>
            </>
          )}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu"><Menu /></Button>
            </SheetTrigger>
            <SheetContent side="right" className="academy w-72">
              <SheetHeader>
                <SheetTitle>Academy</SheetTitle>
                <SheetDescription className="sr-only">Academy navigation</SheetDescription>
              </SheetHeader>
              <nav aria-label="Mobile" className="flex flex-col gap-1 px-4">
                {ACADEMY_LINKS.map((l) => (
                  <SheetClose asChild key={l.href}>
                    <Link href={l.href} className="hover:bg-accent rounded-lg px-3 py-2.5 text-[15px] font-medium">{l.label}</Link>
                  </SheetClose>
                ))}
                <SheetClose asChild><Link href="/feed" className="text-muted-foreground hover:bg-accent mt-2 rounded-lg px-3 py-2.5 text-sm font-medium">Back to UniSphere</Link></SheetClose>
                {!user && <SheetClose asChild><Link href="/login?next=%2Facademy%2Fdashboard" className="hover:bg-accent rounded-lg px-3 py-2.5 text-[15px] font-medium">Sign in</Link></SheetClose>}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
