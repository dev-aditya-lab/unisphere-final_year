import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CircleAlert } from "@/components/icons/lucide-compat";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/orbits/cards";
import { Podium, ReferralBoardRows } from "@/components/referrals/board";
import { requireProfile } from "@/lib/auth/session";
import { getMyReferralRank, getReferralBoard } from "@/lib/services/referrals";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Referral leaderboard" };
const PAGE = 20;
const PERIODS = [
  { value: "weekly", label: "This week" },
  { value: "alltime", label: "All time" },
];

const href = (period, page = 1) => `/referrals/leaderboard?period=${period}${page > 1 ? `&page=${page}` : ""}`;

export default async function ReferralLeaderboardPage({ searchParams }) {
  const { user } = await requireProfile();
  const sp = await searchParams;
  const period = PERIODS.some((p) => p.value === sp.period) ? sp.period : "weekly";
  const page = Math.max(1, Math.min(200, Number(sp.page) || 1));
  const [board, me] = await Promise.all([getReferralBoard({ period, page, limit: PAGE }), getMyReferralRank(period)]);
  const rows = board.data ?? [];
  const info = rows[0];
  const total = Number(info?.total ?? me.data?.total ?? 0);
  const myRank = me.data?.rank ? Number(me.data.rank) : null;
  const myScore = Number(me.data?.score ?? 0);

  return (
    <>
      <PageHeader
        eyebrow="Refer & Earn"
        title="Referral leaderboard"
        description="Ranked by successful referrals: friends who joined and became active members. Referrals that were reversed after a review do not count. Ties go to whoever reached the number first."
        actions={<Button asChild variant="outline" size="sm"><Link href="/referrals"><ArrowLeft /> Refer &amp; Earn</Link></Button>}
      />

      <nav aria-label="Leaderboard period" className="bg-muted mb-4 flex max-w-xs rounded-xl p-1">
        {PERIODS.map((p) => (
          <Link key={p.value} href={href(p.value)} scroll={false} aria-current={period === p.value ? "true" : undefined}
            className={cn("flex h-8 flex-1 items-center justify-center rounded-lg px-2 text-[13px] font-semibold whitespace-nowrap transition-colors", period === p.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            {p.label}
          </Link>
        ))}
      </nav>
      {info?.in_progress && <p className="text-muted-foreground mb-3 text-xs">In progress: {formatDate(info.period_start)} to {formatDate(info.period_end)} (India Standard Time). Ranks can still change.</p>}

      {board.error || me.error ? (
        <div role="alert" className="surface flex flex-col items-center gap-3 px-6 py-12 text-center">
          <CircleAlert className="text-destructive-text size-7" aria-hidden="true" />
          <p className="font-semibold">The leaderboard could not be loaded.</p>
          <Button asChild variant="outline"><Link href={href(period, page)}>Try again</Link></Button>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          <Section aria-label="Rankings">
            {rows.length ? (
              <>
                {page === 1 && <Podium rows={rows} meId={user.id} />}
                <ReferralBoardRows rows={rows} meId={user.id} size={44} />
              </>
            ) : (
              <div className="py-10 text-center" data-testid="board-empty">
                <p className="text-sm font-semibold">{period === "weekly" ? "No successful referrals this week yet" : "No successful referrals yet"}</p>
                <p className="text-muted-foreground mx-auto mt-1 max-w-sm text-sm">Invite a friend and be the first on the board.</p>
                <Button asChild className="mt-4"><Link href="/referrals">Get my invite link</Link></Button>
              </div>
            )}
            <nav aria-label="Pages" className="mt-3 flex items-center justify-between border-t pt-3 text-sm">
              {page > 1 ? <Link href={href(period, page - 1)} className="text-primary-text font-semibold hover:underline">Previous</Link> : <span />}
              {rows.length === PAGE && page * PAGE < total ? <Link href={href(period, page + 1)} className="text-primary-text font-semibold hover:underline">Next</Link> : <span />}
            </nav>
          </Section>

          <Section title="Your position" aria-label="Your position">
            {!me.data?.participating ? (
              <p className="text-muted-foreground text-sm">You are not on leaderboards. Change this in <Link href="/settings/privacy" className="text-primary-text font-semibold hover:underline">privacy settings</Link>.</p>
            ) : myRank ? (
              <div className="space-y-1">
                <p className="text-3xl font-extrabold" data-testid="my-rank">#{myRank}</p>
                <p className="text-muted-foreground text-sm">of {total.toLocaleString("en-IN")} · {myScore.toLocaleString("en-IN")} {myScore === 1 ? "referral" : "referrals"}</p>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">Your first successful referral puts you on this board.</p>
            )}
            <p className="text-muted-foreground mt-3 border-t pt-3 text-xs">The board shows names, usernames and photos you already show on the Orbit leaderboard, and a count. It never shows who was invited.</p>
          </Section>
        </div>
      )}
    </>
  );
}
