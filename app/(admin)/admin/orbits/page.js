import { PageHeader } from "@/components/shell/page-header";
import { Panel, StatCard, fmtNumber } from "@/components/admin/ui";
import { TimeSeriesChart } from "@/components/admin/charts";
import { OrbitsAdminTabs } from "@/components/admin/orbits-tabs";
import { AchievementDialog, ConfigRow } from "@/components/admin/orbits-admin";
import { RewardIcon } from "@/components/orbits/reward-icon";
import { read } from "@/lib/services/admin";

export const metadata = { title: "Orbits" };

const LABELS = {
  checkin: ["Daily Orbit Bonus", "Orbits for the daily check-in."],
  challenge_participation: ["Challenge participation", "Orbits for answering the Daily Challenge."],
  challenge_correct: ["Correct answer bonus", "Extra Orbits for a correct answer."],
  post: ["Eligible post", "Orbits for the first eligible original post of the day."],
  post_min_chars: ["Post minimum length", "Characters a post needs to be eligible."],
  helpful_answer: ["Helpful answer", "Orbits when the author of a question likes an answer."],
  helpful_daily_cap: ["Helpful answers per day", "Most helpful answers rewarded per member per day."],
  helpful_min_chars: ["Helpful answer minimum length", "Characters an answer needs to be eligible."],
  streak_bonus: ["Streak milestone bonuses", 'Bonus Orbits when a streak reaches each length, as JSON such as {"7":10}. Paid once per length per member.'],
  min_group_size: ["Smallest Top 10 group", "A college or connections group needs this many members to award a Top 10 badge."],
  auto_question_draft: ["AI drafts tomorrow's question at 16:00", "1 = the worker asks the AI for a draft each afternoon (IST), 0 = off. It is only ever a draft."],
  auto_question_publish: ["Publish an unapproved AI draft at 02:00", "1 = an AI draft nobody approved goes live at 02:00 IST on its day if nothing else is live, 0 = off. Approve or archive a draft to stop it."],
  suspicious_daily_orbits: ["Review threshold", "Orbits earned in one day above which a member is listed for review."],
};

export default async function AdminOrbitsPage() {
  const [metrics, config, achievements] = await Promise.all([read("orbit_admin_metrics", { p_days: 30 }), read("orbit_admin_config"), read("orbit_admin_achievements")]);
  const ret = metrics.returned_7d;
  const series = (key) => metrics.daily.map((d) => ({ day: d.day, value: d[key] }));

  return (
    <>
      <PageHeader eyebrow="Insights & system" title="Orbits" description="Rewards, the Daily Challenge, the ledger and seasons. Every change here is written to the audit log." />
      <OrbitsAdminTabs current="/admin/orbits" />

      <section aria-label="Last 30 days" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Participants" value={fmtNumber(metrics.participants)} hint="Checked in, answered or contributed (30 days)" />
        <StatCard label="Challenge answers" value={fmtNumber(metrics.challenge_answers)} hint={metrics.challenge_answers ? `${Math.round((metrics.challenge_correct / metrics.challenge_answers) * 100)}% correct` : "None yet"} />
        <StatCard label="Contribution days" value={fmtNumber(metrics.contribution_days)} hint="Posts and helpful answers, one per member per day" />
        <StatCard label="Orbits issued" value={fmtNumber(metrics.orbits_issued)} hint={`${fmtNumber(metrics.orbits_reversed)} taken back`} />
        <StatCard label="Check-ins" value={fmtNumber(metrics.checkins)} />
        <StatCard label="Active streaks (3+)" value={fmtNumber(metrics.active_streaks)} hint="Alive today or yesterday" />
        <StatCard label="Badges awarded" value={fmtNumber(metrics.badges_awarded)} />
        <StatCard
          label="Came back within 7 days"
          value={ret.cohort ? `${Math.round((ret.returned / ret.cohort) * 100)}%` : "Not enough data"}
          hint={ret.cohort ? `${ret.returned} of ${ret.cohort} members whose first Orbit activity was 8 to 30 days ago` : "Needs members whose first activity was 8+ days ago"}
        />
      </section>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TimeSeriesChart title="Challenge answers per day" series={series("answers")} />
        <TimeSeriesChart title="Contribution days per day" series={series("contributions")} color="var(--chart-2)" />
      </div>

      <Panel title="Reward values" description="Whole numbers from 0 to 1000. A change applies to rewards earned from now on; past entries are never rewritten.">
        <div className="divide-y">
          {config.map((c) => (
            <ConfigRow key={c.key} name={c.key} label={LABELS[c.key]?.[0] ?? c.key} hint={LABELS[c.key]?.[1] ?? c.description} value={c.value} />
          ))}
        </div>
      </Panel>

      <div className="mt-6">
        <Panel title="Badges" description="Earned from trusted records only. Ranking badges are awarded by finalising a season.">
          <ul className="divide-y">
            {achievements.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-2.5">
                <RewardIcon name={a.icon} imageKey={a.image_key} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {a.title} {!a.active && <span className="text-muted-foreground font-normal">(off)</span>}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {a.id} · {a.tier} · bonus {a.bonus}
                  </p>
                </div>
                <AchievementDialog a={a} />
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}
