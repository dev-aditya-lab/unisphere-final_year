import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { BlueTick } from "@/components/ui/blue-tick";
import { UserAvatar } from "@/components/user-avatar";
import { timeAgo } from "@/lib/format";

const TYPE_LABEL = { student: "Student", alumni: "Alumni", faculty: "Faculty", staff: "Staff" };

/** Avatar + name + @username + time. Used on posts, comments and quoted originals. */
export function AuthorLine({ name, username, avatarKey, verified, blueTick, accountType, createdAt, edited, size = "md", showType = true }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Link prefetch={false} href={`/u/${username}`} aria-label={`${name}'s profile`} className="shrink-0">
        <UserAvatar name={name} avatarKey={avatarKey} size={size} />
      </Link>
      <div className="min-w-0 leading-tight">
        <p className="flex min-w-0 items-center gap-1 text-sm font-semibold">
          <Link prefetch={false} href={`/u/${username}`} className="truncate hover:underline">
            {name}
          </Link>
          {blueTick && <BlueTick className="size-3.5" />}
          {verified && <BadgeCheck className="text-teal-text size-3.5 shrink-0" aria-label="Verified member" />}
          {showType && accountType && accountType !== "student" && (
            <span className="text-muted-foreground bg-muted rounded px-1.5 py-px text-[10px] font-semibold tracking-wide uppercase">{TYPE_LABEL[accountType]}</span>
          )}
        </p>
        <p className="text-muted-foreground truncate text-xs">
          @{username}
          {createdAt && (
            <>
              {" · "}
              <time dateTime={new Date(createdAt).toISOString()} suppressHydrationWarning>
                {timeAgo(createdAt)}
              </time>
              {edited && " · edited"}
            </>
          )}
        </p>
      </div>
    </div>
  );
}
