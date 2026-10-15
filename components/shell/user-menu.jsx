"use client";

import { useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bug, LogOut, Monitor, Moon, Settings, ShieldCheck, Sparkles, Sun, User, BadgeCheck } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/user-avatar";
import { logoutAction } from "@/lib/actions/auth";
import { clearUserCaches } from "@/components/pwa/pwa-provider";
import { useTheme } from "@/components/theme-provider";

export function UserMenu({ profile, isStaff }) {
  const [, startTransition] = useTransition();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="focus-visible:ring-ring/45 press rounded-full outline-none focus-visible:ring-[3px]"
        aria-label="Open account menu"
      >
        <UserAvatar name={profile.full_name} avatarKey={profile.avatar_key} size="sm" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <p className="flex items-center gap-1 truncate text-sm font-semibold">
            {profile.full_name}
            {profile.verification_status === "verified" && <BadgeCheck className="text-teal-text size-4 shrink-0" aria-label="Verified" />}
          </p>
          <p className="text-muted-foreground truncate text-xs">@{profile.username}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link prefetch={false} href={`/u/${profile.username}`}>
            <User /> View profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings /> Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/feedback?kind=bug&from=${encodeURIComponent(pathname || "/")}`}>
            <Bug /> Report a problem
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/changelog">
            <Sparkles /> What&rsquo;s new
          </Link>
        </DropdownMenuItem>
        {isStaff && (
          <DropdownMenuItem asChild>
            <Link href="/admin">
              <ShieldCheck /> Admin console
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        {/* Appearance lives here too so it is reachable on phones, where the top bar has no room for it. */}
        <DropdownMenuLabel className="text-muted-foreground text-xs font-semibold">Appearance</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light"><Sun /> Light</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark"><Moon /> Dark</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system"><Monitor /> Match device</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        {/* Run the action directly: a <form> inside the menu would unmount before it could submit. */}
        <DropdownMenuItem onSelect={() => startTransition(async () => { await clearUserCaches(); await logoutAction(); })}>
          <LogOut /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
