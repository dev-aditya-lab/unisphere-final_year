import Link from "next/link";
import { RankBadge } from "@/components/orbits/reward-icon";
import { cn } from "@/lib/utils";

/** Rows of one leaderboard. Shows only what the database function returned: name, username, avatar key, score, rank movement. */
export function BoardRows({ rows, meId, size = 36 }) {
  return (
    <ol className="divide-y" aria-label="Leaderboard">
      {rows.map((r) => {
        const move = r.prev_rank ? Number(r.prev_rank) - Number(r.rank) : null;
        return (
          <li key={r.user_id} className={cn("hover:bg-accent/60 -mx-2 flex items-center gap-3 rounded-lg px-2 py-2 transition-colors", r.user_id === meId && "bg-primary-soft/60 hover:bg-primary-soft")} data-me={r.user_id === meId}>
            <RankBadge rank={Number(r.rank)} size={size} />
            <Link href={`/u/${r.username}`} className="min-w-0 flex-1 rounded hover:underline">
              <span className="block truncate text-sm font-semibold">
                {r.full_name}
                {r.user_id === meId ? " (you)" : ""}
              </span>
              <span className="text-muted-foreground block truncate text-xs">@{r.username}</span>
            </Link>
            {move !== null && move !== 0 && (
              <span className={cn("text-xs font-semibold", move > 0 ? "text-success-text" : "text-destructive-text")}>{move > 0 ? `Up ${move}` : `Down ${-move}`}</span>
            )}
            <span className="w-16 shrink-0 text-right text-sm font-bold tabular-nums">{Number(r.score).toLocaleString("en-IN")}</span>
          </li>
        );
      })}
    </ol>
  );
}
