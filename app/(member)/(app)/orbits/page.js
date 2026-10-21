import Link from "next/link";
import { RotateCw } from "lucide-react";
import { CircleAlert } from "@/components/icons/lucide-compat";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { ActivityList, AchievementTile, BalanceCard, Section, SeeAll, StreakCard } from "@/components/orbits/cards";
import { ChallengeCard, DailyBonusCard, LeaderboardPreview } from "@/components/orbits/interactive";
import { requireProfile } from "@/lib/auth/session";
import { getAchievements, getDailyQuestion, getLeaderboard, getMyRank, getOverview } from "@/lib/services/orbits";

export const metadata = { title: "Orbits" };

export default async function OrbitsPage() {
  const { profile, user } = await requireProfile();
  const [overview, question, achievements, board, me] = await Promise.all([
    getOverview(),
    getDailyQuestion(),
    getAchievements(),
    getLeaderboard({ scope: "global", period: "weekly", limit: 5 }),
    getMyRank("global", "weekly"),
  ]);

  if (overview.error) {
    return (
      <>
        <PageHeader eyebrow="Rewards" title="Orbits" description="Earn Orbits for learning and contributing." />
        <div role="alert" className="surface flex flex-col items-center gap-3 px-6 py-12 text-center">
          <CircleAlert className="text-destructive-text size-8" aria-hidden="true" />
          <p className="font-semibold">Orbits could not be loaded.</p>
          <p className="text-muted-foreground max-w-sm text-sm">Nothing was lost. Your Orbit Balance is safe; it just could not be read right now.</p>
          <Button asChild variant="outline"><Link href="/orbits"><RotateCw /> Try again</Link></Button>
        </div>
      </>
    );
  }

  const o = overview.data;
  const earned = (achievements.data ?? []).filter((a) => a.earned.length > 0);
  const recentBadges = earned.flatMap((a) => a.earned.map((e) => ({ ...a, earned: [e] }))).sort((x, y) => new Date(y.earned[0].earned_at) - new Date(x.earned[0].earned_at)).slice(0, 4);

  return (
    <>
      <PageHeader eyebrow="Rewards" title="Orbits" description="Earn Orbits by learning and contributing. Orbits are recognition for being part of the community: they cannot be bought, sold or exchanged." />
      {/* One column on a phone, in this order: the challenge and the daily bonus, then streak, balance, rank. Two flowing columns from lg. */}
      <div className="space-y-4 lg:block lg:columns-2 lg:gap-4 lg:space-y-0 [&>*]:break-inside-avoid lg:[&>*]:mb-4">
        <DailyBonusCard checkin={o.checkin} />
        <ChallengeCard question={question.data} />
        <StreakCard overview={o} />
        <BalanceCard overview={o} />
        <LeaderboardPreview key={`${me.data?.score ?? 0}-${board.data?.[0]?.user_id ?? "none"}`} initial={{ rows: board.data ?? [], me: me.data }} meId={user.id} />
        <Section title="Orbit Badges" eyebrow="Achievements" action={<SeeAll href="/orbits/achievements">All badges</SeeAll>}>
          {recentBadges.length ? (
            <ul className="grid grid-cols-2 gap-3">
              {recentBadges.map((a) => (
                <AchievementTile key={`${a.id}-${a.earned[0].earned_at}`} a={a} />
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">No badges yet. Answer today&rsquo;s challenge or share something useful to earn your first one.</p>
          )}
        </Section>
        <Section title="Recent activity" action={<SeeAll href="/orbits/history">Full history</SeeAll>}>
          <ActivityList rows={o.recent} />
        </Section>
      </div>
      <p className="text-muted-foreground mt-2 text-xs">
        Orbit Streak days and weeks follow India Standard Time. <Link href="/settings/privacy" className="text-primary-text font-semibold hover:underline">Orbits privacy</Link> ·{" "}
        {profile.orbits_on_leaderboard === false ? "You are hidden from leaderboards." : "You appear on leaderboards."}
      </p>
    </>
  );
}
