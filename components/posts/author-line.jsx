import Link from "next/link";
import { BlueTick } from "@/components/ui/blue-tick";
import { UserAvatar } from "@/components/user-avatar";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

const TYPE_LABEL = { student: "Student", alumni: "Alumni", faculty: "Faculty", staff: "Staff" };

/**
 * Avatar + name + @username + time. Used on posts, comments and quoted originals.
 * Badges only appear when the account data says so: the blue tick or a non-student role.
 * `children` renders after the timestamp (for example the audience icon on a post).
 */
export function AuthorLine({ name, username, avatarKey, blueTick, accountType, createdAt, edited, size = "md", showType = true, prominent = false, children }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Link href={`/u/${username}`} aria-label={`${name}'s profile`} className="shrink-0 rounded-full">
        <UserAvatar name={name} avatarKey={avatarKey} size={size} />
      </Link>
      <div className="min-w-0 leading-tight">
        <p className={cn("flex min-w-0 items-center gap-1 font-semibold", prominent ? "text-[15px] font-bold" : "text-sm")}>
          <Link href={`/u/${username}`} className="truncate rounded-sm hover:underline">
            {name}
          </Link>
          {blueTick && <BlueTick className="size-3.5" />}
          {showType && accountType && accountType !== "student" && (
            <span className="text-muted-foreground bg-muted shrink-0 rounded px-1.5 py-px text-[10px] font-semibold tracking-wide uppercase">{TYPE_LABEL[accountType]}</span>
          )}
        </p>
        <p className={cn("text-muted-foreground mt-0.5 flex min-w-0 items-center gap-1", prominent ? "text-[13px]" : "text-xs")}>
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
