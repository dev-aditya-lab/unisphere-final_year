import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { BlueTick } from "@/components/ui/blue-tick";
import { UserAvatar } from "@/components/user-avatar";
import { timeAgo } from "@/lib/format";

const TYPE_LABEL = { student: "Student", alumni: "Alumni", faculty: "Faculty", staff: "Staff" };

/**
 * Avatar + name + @username + time. Used on posts, comments and quoted originals.
 * Badges only appear when the account data says so: the blue tick, a verified student ID, or a non-student role.
 * `children` renders after the timestamp (for example the audience icon on a post).
 */
export function AuthorLine({ name, username, avatarKey, verified, blueTick, accountType, createdAt, edited, size = "md", showType = true, children }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Link href={`/u/${username}`} aria-label={`${name}'s profile`} className="shrink-0 rounded-full">
        <UserAvatar name={name} avatarKey={avatarKey} size={size} />
      </Link>
      <div className="min-w-0 leading-tight">
        <p className="flex min-w-0 items-center gap-1 text-sm font-semibold">
          <Link href={`/u/${username}`} className="truncate rounded-sm hover:underline">
            {name}
          </Link>
          {blueTick && <BlueTick className="size-3.5" />}
          {verified && <BadgeCheck className="text-teal-text size-3.5 shrink-0" aria-label="Verified member" />}
          {showType && accountType && accountType !== "student" && (
            <span className="text-muted-foreground bg-muted shrink-0 rounded px-1.5 py-px text-[10px] font-semibold tracking-wide uppercase">{TYPE_LABEL[accountType]}</span>
          )}
        </p>
        <p className="text-muted-foreground mt-0.5 flex min-w-0 items-center gap-1 text-xs">
          <span className="truncate">@{username}</span>
          {createdAt && (
            <>
              <span aria-hidden="true">·</span>
              <span className="shrink-0">
                <time dateTime={new Date(createdAt).toISOString()} suppressHydrationWarning>
                  {timeAgo(createdAt)}
                </time>
                {edited && " · edited"}
              </span>
            </>
          )}
          {children}
        </p>
      </div>
    </div>
  );
}
