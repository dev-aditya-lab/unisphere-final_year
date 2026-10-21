import { Suspense } from "react";
import Link from "next/link";
import { PenLine, Search } from "@/components/icons/lucide-compat";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { ComposeLink } from "@/components/shell/compose-link";
import { NavLinks } from "@/components/shell/nav-links";
import { BottomNav } from "@/components/shell/mobile-nav";
import { UserMenu } from "@/components/shell/user-menu";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { InstallBanner } from "@/components/pwa/install-banner";
import { CelebrationListener } from "@/components/motion/celebrate";
import { MotionFeatures } from "@/components/motion/motion-features";
import { Button } from "@/components/ui/button";
import { OrbitHeaderPill } from "@/components/orbits/glance-server";
import { OrbitPillSkeleton } from "@/components/orbits/header-pill";
import { OrbitCelebrations } from "@/components/orbits/celebrations";
import { publicEnv } from "@/lib/env-public";
import { visibleNav } from "@/lib/nav";
import { getFlags } from "@/lib/settings";
import { hasPermission } from "@/lib/auth/session";

/**
 * Authenticated application frame: sidebar (lg+), a compact top bar, and bottom navigation with a More sheet on phones.
 * Pages render inside <main>; contextual right-hand panels are laid out by each page.
 * Safe-area insets keep everything clear of notches and the home indicator in the installed app.
 */
export async function AppShell({ profile, children, counts = {}, bellCount = 0 }) {
  const flags = await getFlags();
  const items = visibleNav(flags);
  const isStaff =
    (await hasPermission("reports.view")) ||
    (await hasPermission("users.view")) ||
    (await hasPermission("settings.view")) ||
    (await hasPermission("contact.manage"));

  return (
    <MotionFeatures>
    <div className="min-h-dvh">
      <aside className="bg-sidebar pl-safe pt-safe fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r lg:flex">
        <div className="flex h-14 shrink-0 items-center px-5">
          <Logo href="/" />
        </div>
        <div className="shrink-0 px-3 pb-2">
          <Button asChild className="w-full">
            <ComposeLink>
              <PenLine /> Share something
            </ComposeLink>
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
          <NavLinks items={items} counts={counts} />
        </div>
        <div className="flex shrink-0 items-center justify-between gap-2 border-t px-4 py-3 text-xs">
          <Link href="/guidelines" prefetch={false} className="text-muted-foreground hover:text-foreground font-medium">
            Community guidelines
          </Link>
          <Link href="/changelog" prefetch={false} className="text-muted-foreground hover:text-foreground font-medium">
            What&rsquo;s new
          </Link>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="bg-card/90 supports-[backdrop-filter]:bg-card/80 pt-safe pl-safe pr-safe sticky top-0 z-20 border-b backdrop-blur-md">
          <div className="flex h-14 items-center gap-2 px-3 sm:gap-3 sm:px-6">
            <Logo href="/" showWordmark={false} className="lg:hidden" />
            <form action="/search" role="search" className="w-full max-w-md min-w-0 flex-1">
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
                  className="bg-muted placeholder:text-faint hover:bg-accent focus-visible:bg-card focus-visible:border-ring focus-visible:ring-ring/25 h-9 w-full min-w-0 rounded-full border border-transparent pr-3 pl-9 text-sm outline-none focus-visible:ring-[3px]"
                />
              </div>
            </form>
            <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
              <Suspense fallback={<OrbitPillSkeleton />}>
                <OrbitHeaderPill />
              </Suspense>
              <ThemeToggle className="hidden sm:inline-flex" />
              <NotificationBell key={bellCount} userId={profile.id} initialCount={bellCount} />
              <UserMenu profile={profile} isStaff={isStaff} />
            </div>
          </div>
        </header>

        <InstallBanner />

        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl py-4 pr-[max(0.75rem,env(safe-area-inset-right))] pb-[calc(5.5rem+env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] outline-none sm:px-6 sm:py-6 lg:pb-10">
          {children}
        </main>
      </div>
      <BottomNav items={items} counts={counts} />
      <CelebrationListener />
      <OrbitCelebrations
        who={profile.orbits_cards_public ? { name: profile.full_name, username: profile.username } : null}
        url={profile.orbits_cards_public ? `${publicEnv.appUrl}/u/${profile.username}/orbits` : null}
      />
    </div>
    </MotionFeatures>
  );
}
