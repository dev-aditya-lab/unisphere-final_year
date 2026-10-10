import Link from "next/link";
import { Search, ShieldAlert } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { NavLinks } from "@/components/shell/nav-links";
import { BottomNav, MobileDrawer } from "@/components/shell/mobile-nav";
import { UserMenu } from "@/components/shell/user-menu";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { InstallBanner } from "@/components/pwa/install-banner";
import { visibleNav } from "@/lib/nav";
import { getFlags } from "@/lib/settings";
import { hasPermission } from "@/lib/auth/session";

/**
 * Authenticated application frame: sidebar (lg+), top bar, mobile drawer and bottom navigation.
 * Pages render inside <main>; contextual right-hand panels are laid out by each page.
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

  const needsVerification = profile.verification_status === "unverified" || profile.verification_status === "rejected";

  return (
    <div className="min-h-dvh">
      <aside className="bg-sidebar fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r lg:flex">
        <div className="flex h-14 items-center px-5">
          <Logo href="/" />
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <NavLinks items={items} counts={counts} />
        </div>
        <div className="border-t p-3 text-xs">
          <Link href="/guidelines" className="text-muted-foreground hover:text-foreground">
            Community guidelines
          </Link>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="bg-background/90 supports-[backdrop-filter]:bg-background/75 sticky top-0 z-20 flex h-14 items-center gap-2 border-b px-3 backdrop-blur sm:px-5">
          <MobileDrawer items={items} counts={counts} />
          <Logo href="/" showWordmark={false} className="lg:hidden" />
          <form action="/search" role="search" className="mx-auto w-full max-w-xl">
            <label htmlFor="global-search" className="sr-only">
              Search UniSphere
            </label>
            <div className="relative">
              <Search aria-hidden="true" className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <input
                id="global-search"
                name="q"
                type="search"
                placeholder="Search people, posts, projects, skills…"
                className="border-input bg-card placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/40 h-9 w-full rounded-md border pr-3 pl-9 text-sm outline-none focus-visible:ring-[3px]"
              />
            </div>
          </form>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <NotificationBell key={bellCount} userId={profile.id} initialCount={bellCount} />
            <UserMenu profile={profile} isStaff={isStaff} />
          </div>
        </header>

        <InstallBanner />

        {needsVerification && (
          <div className="bg-accent text-accent-foreground flex items-center gap-2 border-b px-4 py-2 text-[13px]">
            <ShieldAlert className="size-4 shrink-0" aria-hidden="true" />
            <p className="min-w-0">
              {profile.verification_status === "rejected" ? "Your last verification request was not approved. " : "Verify your college to earn a badge and unlock the full community. "}
              <Link href="/settings/verification" className="font-semibold underline underline-offset-2">
                Verify now
              </Link>
            </p>
          </div>
        )}

        <main id="main" className="mx-auto w-full max-w-6xl px-4 py-6 pb-24 sm:px-6 lg:pb-10">
          {children}
        </main>
      </div>
      <BottomNav items={items} counts={counts} />
    </div>
  );
}
