"use client";

import { useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bug, LogOut, Settings, ShieldCheck, Sparkles, User, BadgeCheck } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/user-avatar";
import { logoutAction } from "@/lib/actions/auth";

export function UserMenu({ profile, isStaff }) {
  const [, startTransition] = useTransition();
  const pathname = usePathname();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="focus-visible:ring-ring/50 rounded-full outline-none focus-visible:ring-[3px]"
        aria-label="Open account menu"
      >
        <UserAvatar name={profile.full_name} avatarKey={profile.avatar_key} size="sm" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <p className="flex items-center gap-1 truncate text-sm font-semibold">
            {profile.full_name}
            {profile.verification_status === "verified" && <BadgeCheck className="text-primary size-4 shrink-0" aria-label="Verified" />}
          </p>
          <p className="text-muted-foreground truncate text-xs">@{profile.username}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={`/u/${profile.username}`}>
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
        {/* Run the action directly: a <form> inside the menu would unmount before it could submit. */}
        <DropdownMenuItem onSelect={() => startTransition(() => logoutAction())}>
          <LogOut /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
