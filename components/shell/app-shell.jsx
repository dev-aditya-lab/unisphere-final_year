import Link from "next/link";
import { PenLine, Search } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { NavLinks } from "@/components/shell/nav-links";
import { BottomNav, MobileDrawer } from "@/components/shell/mobile-nav";
import { UserMenu } from "@/components/shell/user-menu";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { InstallBanner } from "@/components/pwa/install-banner";
import { CelebrationListener } from "@/components/motion/celebrate";
import { Button } from "@/components/ui/button";
import { visibleNav } from "@/lib/nav";
import { getFlags } from "@/lib/settings";
import { hasPermission } from "@/lib/auth/session";

/**
 * Authenticated application frame: sidebar (lg+), top bar, mobile drawer and bottom navigation.
 * Pages render inside <main>; contextual right-hand panels are laid out by each page.
 * Safe-area insets keep everything clear of notches and the home indicator in the installed app.
 */
export async function AppShell({ profile, children, counts = {}, bellCount = 0 }) {
  const flags = await getFlags();
  const items = visibleNav(flags);
  const isStaff =
    (await hasPermission("reports.view")) ||
    (await hasPermission("verification.review")) ||
    (await hasPermission("users.view")) ||
    (await hasPermission("settings.view")) ||
    (await hasPermission("contact.manage"));

  return (
    <div className="min-h-dvh">
      <aside className="bg-sidebar pl-safe pt-safe fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r lg:flex">
        <div className="flex h-16 items-center px-5">
          <Logo href="/" />
        </div>
        <div className="px-3 pb-2">
          <Button asChild variant="hot" className="w-full">
            <Link href="/feed#compose">
              <PenLine /> Share something
            </Link>
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <NavLinks items={items} counts={counts} />
        </div>
        <div className="flex items-center justify-between gap-2 border-t p-3 text-xs">
          <Link href="/guidelines" prefetch={false} className="text-muted-foreground hover:text-foreground font-medium">
            Community guidelines
          </Link>
          <Link href="/changelog" prefetch={false} className="text-muted-foreground hover:text-foreground font-medium">
            What&rsquo;s new
          </Link>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="bg-background/90 supports-[backdrop-filter]:bg-background/80 pt-safe pl-safe pr-safe sticky top-0 z-20 border-b backdrop-blur-md">
          <div className="flex h-14 items-center gap-1.5 px-2 sm:gap-2 sm:px-5">
            <MobileDrawer items={items} counts={counts} />
            <Logo href="/" showWordmark={false} className="lg:hidden" />
            <form action="/search" role="search" className="mx-auto w-full max-w-xl min-w-0 flex-1">
              <label htmlFor="global-search" className="sr-only">
                Search UniSphere
              </label>
              <div className="relative">
                <Search aria-hidden="true" className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <input
                  id="global-search"
                  name="q"
                  type="search"
                  enterKeyHint="search"
                  placeholder="Search people, posts, projects…"
                  className="border-input bg-card placeholder:text-faint hover:border-foreground/40 focus-visible:border-ring focus-visible:ring-ring/35 h-10 w-full min-w-0 rounded-lg border pr-3 pl-9 text-sm outline-none focus-visible:ring-[3px]"
                />
              </div>
            </form>
            <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
              <ThemeToggle className="hidden sm:inline-flex" />
              <NotificationBell key={bellCount} userId={profile.id} initialCount={bellCount} />
              <UserMenu profile={profile} isStaff={isStaff} />
            </div>
          </div>
        </header>

        <InstallBanner />

        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl py-6 pr-[max(1rem,env(safe-area-inset-right))] pb-28 pl-[max(1rem,env(safe-area-inset-left))] outline-none sm:px-6 lg:pb-10">
          {children}
        </main>
      </div>
      <BottomNav items={items} counts={counts} />
      <CelebrationListener />
    </div>
  );
}
