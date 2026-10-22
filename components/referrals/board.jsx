import Link from "next/link";
import { RankBadge } from "@/components/orbits/reward-icon";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";

const plural = (n) => `${Number(n).toLocaleString("en-IN")} ${Number(n) === 1 ? "referral" : "referrals"}`;

/**
 * Rows of the referral leaderboard. Shows only what the database function returned: rank, display name, username, avatar and
 * the number of successful referrals. Never an email address, a referral code, or who was invited.
 */
export function ReferralBoardRows({ rows, meId, size = 40 }) {
  return (
    <ol className="divide-y" aria-label="Referral leaderboard">
      {rows.map((r) => (
        <li key={r.user_id} data-me={r.user_id === meId} className={cn("hover:bg-accent/60 -mx-2 flex items-center gap-3 rounded-lg px-2 py-2 transition-colors", r.user_id === meId && "bg-primary-soft/60 hover:bg-primary-soft")}>
          <RankBadge rank={Number(r.rank)} size={size} />
          <Link href={`/u/${r.username}`} className="flex min-w-0 flex-1 items-center gap-2.5 rounded hover:underline">
            <UserAvatar name={r.full_name} avatarKey={r.avatar_key} size="sm" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{r.full_name}{r.user_id === meId ? " (you)" : ""}</span>
              <span className="text-muted-foreground block truncate text-xs">@{r.username}</span>
            </span>
          </Link>
          <span className="shrink-0 text-right text-sm font-bold tabular-nums">{plural(r.score)}</span>
        </li>
      ))}
    </ol>
  );
}

/** The top three as a podium (first in the middle). Shown only when three people are ranked. */
export function Podium({ rows, meId }) {
  const top = rows.filter((r) => Number(r.rank) <= 3);
  // a podium needs a podium's worth of people; fewer than three are shown in the list below
  if (top.length < 3) return null;
  const byRank = (n) => top.find((r) => Number(r.rank) === n);
  const slots = [
    { rank: 2, row: byRank(2), h: "h-20" },
    { rank: 1, row: byRank(1), h: "h-28" },
    { rank: 3, row: byRank(3), h: "h-14" },
  ];
  return (
    <ol className="mb-4 grid grid-cols-3 items-end gap-2 sm:gap-4" aria-label="Top three">
      {slots.map(({ rank, row, h }) => (
        <li key={rank} className="flex flex-col items-center text-center">
          {row ? (
            <>
              <Link href={`/u/${row.username}`} className="group flex flex-col items-center gap-1 rounded-lg p-1 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/45">
                <UserAvatar name={row.full_name} avatarKey={row.avatar_key} size={rank === 1 ? "lg" : "md"} />
                <span className={cn("max-w-full truncate text-[13px] font-semibold group-hover:underline", row.user_id === meId && "text-primary-text")}>{row.full_name}{row.user_id === meId ? " (you)" : ""}</span>
                <span className="text-muted-foreground text-xs tabular-nums">{plural(row.score)}</span>
              </Link>
              <div className={cn("bg-primary-soft border-[var(--orbit-line)] mt-1 grid w-full place-items-end justify-items-center rounded-t-xl border border-b-0 pb-1", h)}>
                <RankBadge rank={rank} size={rank === 1 ? 44 : 36} />
              </div>
            </>
          ) : (
            <div className={cn("bg-muted/50 mt-auto grid w-full place-items-center rounded-t-xl text-xs font-semibold text-muted-foreground", h)} aria-hidden="true">{rank}</div>
          )}
        </li>
      ))}
    </ol>
  );
}
