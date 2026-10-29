import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserAvatar } from "@/components/user-avatar";
import { AdminNav } from "@/components/admin/admin-nav";
import { AdminMobileNav } from "@/components/admin/admin-mobile-nav";
import { AdminFinder } from "@/components/admin/admin-finder";
import { AdminCrumbs } from "@/components/admin/admin-crumbs";

/** Frame for the admin console: a deliberately separate layout from the member app. */
export function AdminShell({ profile, items, counts, roleLabels, children }) {
  return (
    <div className="min-h-dvh">
      <aside className="bg-sidebar fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r lg:flex">
        <div className="flex h-14 shrink-0 items-center gap-2 border-b px-5">
          <Logo href="/admin" showWordmark={false} />
          <div className="leading-tight">
            <p className="font-heading text-[15px] font-extrabold">UniSphere</p>
            <p className="eyebrow !text-[10px]">Admin console</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-3">
          <AdminNav items={items} counts={counts} />
        </div>
        <div className="shrink-0 border-t p-3 text-xs">
          <Link href="/feed" className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 transition-colors">
            <ArrowLeft className="size-3.5" aria-hidden="true" /> Back to UniSphere
          </Link>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="bg-background/90 supports-[backdrop-filter]:bg-background/75 sticky top-0 z-20 flex h-14 items-center gap-2 border-b px-3 backdrop-blur sm:px-5">
          <AdminMobileNav items={items} counts={counts} />
          <div className="min-w-0 flex-1">
            <AdminCrumbs />
          </div>
          <AdminFinder items={items} counts={counts} className="md:w-60" />
          <ThemeToggle />
          <div className="flex items-center gap-2 pl-1">
            <UserAvatar name={profile.full_name} avatarKey={profile.avatar_key} size="sm" />
            <div className="hidden text-xs leading-tight xl:block">
              <p className="font-semibold">{profile.full_name}</p>
              <p className="text-muted-foreground max-w-48 truncate">{roleLabels}</p>
            </div>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-7xl px-4 py-6 pb-16 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
