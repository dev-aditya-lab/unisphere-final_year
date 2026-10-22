import Link from "next/link";
import { RotateCw } from "lucide-react";
import { CircleAlert, Users } from "@/components/icons/lucide-compat";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Section, SeeAll } from "@/components/orbits/cards";
import { ReferralIllustration } from "@/components/referrals/referral-illustration";
import { SharePanel } from "@/components/referrals/share-panel";
import { ReferralCardPanel } from "@/components/referrals/referral-card";
import { ReferralBoardRows } from "@/components/referrals/board";
import { PromptPreference } from "@/components/referrals/prompt-preference";
import { requireProfile } from "@/lib/auth/session";
import { getMyCode, getMyReferralRank, getOverview, getPromptPreference, getReferralBoard } from "@/lib/services/referrals";
import { REFERRAL_REWARD, REFERRAL_STATUS_LABEL, buildReferralUrl, qualificationRules } from "@/lib/referrals/core";
import { publicEnv } from "@/lib/env-public";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Refer & Earn" };

function Stat({ label, value, hint }) {
  return (
    <div className="surface p-4">
      <p className="eyebrow">{label}</p>
      <p className="font-heading mt-1 text-3xl font-extrabold tabular-nums" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>{Number(value).toLocaleString("en-IN")}</p>
      {hint && <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>}
    </div>
  );
}

export default async function ReferralsPage() {
  const { profile, user } = await requireProfile();
  // The code is created on first use; the other reads need it to exist.
  const code = await getMyCode();
  const [overview, board, rank, pref] = await Promise.all([
    getOverview(),
    getReferralBoard({ period: "weekly", limit: 5 }),
    getMyReferralRank("weekly"),
    getPromptPreference(),
  ]);

  const url = code.error ? null : buildReferralUrl(code.data, publicEnv.appUrl);
  // no usable link (the code could not be read, or it is in a format this build does not know): a retry panel, never a broken page
  if (code.error || overview.error || !url) {
    return (
      <>
        <PageHeader eyebrow="Rewards" title="Refer & Earn" description="Invite friends to UniSphere and earn Orbits when they become active members." />
        <div role="alert" className="surface flex flex-col items-center gap-3 px-6 py-12 text-center">
          <CircleAlert className="text-destructive-text size-8" aria-hidden="true" />
          <p className="font-semibold">Refer &amp; Earn could not be loaded.</p>
          <p className="text-muted-foreground max-w-sm text-sm">Nothing was lost. Your referrals and Orbits are safe; they just could not be read right now.</p>
          <Button asChild variant="outline"><Link href="/referrals"><RotateCw /> Try again</Link></Button>
        </div>
      </>
    );
  }

  const o = overview.data;
  const rules = qualificationRules(o);
  const rows = board.data ?? [];
  const myRank = rank.data?.rank ? Number(rank.data.rank) : null;

  return (
    <>
      <PageHeader eyebrow="Rewards" title="Refer & Earn" description={`Invite friends. Earn ${REFERRAL_REWARD} Orbits for each friend who joins and becomes an active member.`} />

      {!o.enabled && (
        <div role="status" className="border-warning/50 bg-warning-soft text-warning-text mb-4 rounded-xl border px-4 py-3 text-sm font-medium">
          Refer &amp; Earn is paused right now. New invites are not counted and no new rewards are paid. Your earlier referrals are kept.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-4">
          <section className="surface overflow-hidden" aria-labelledby="invite-heading">
            <ReferralIllustration className="max-h-64 w-full object-cover sm:max-h-none" decorative />
            <div className="space-y-4 p-4 sm:p-5">
              <div>
                <h2 id="invite-heading" className="font-heading text-xl font-extrabold sm:text-2xl">Invite friends. Earn {REFERRAL_REWARD} Orbits.</h2>
                <p className="text-muted-foreground mt-1 text-sm">Share your link. When a friend signs up and becomes an active member, {REFERRAL_REWARD} Orbits are added to your balance. Once per friend.</p>
              </div>
              <SharePanel url={url} disabled={!o.enabled} />
              <p className="text-muted-foreground text-xs">Your code: <span className="text-foreground font-mono font-semibold tracking-wider" data-testid="invite-code">{code.data}</span>. Opening or sharing the link earns nothing by itself.</p>
            </div>
          </section>

          <div className="grid grid-cols-3 gap-3" aria-label="Your referral totals">
            <Stat label="Successful" value={o.successful} hint="Friends who qualified" />
            <Stat label="Pending" value={o.pending} hint="Joined, not active yet" />
            <Stat label="Orbits earned" value={o.orbits_earned} hint="From referrals" />
          </div>

          <Section title="How it works" eyebrow="The rules">
            <ol className="space-y-2.5 text-sm">
              {rules.map((r, i) => (
                <li key={r} className="flex gap-3">
                  <span aria-hidden="true" className="bg-primary-soft text-primary-text grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold">{i + 1}</span>
                  <span className="pt-0.5">{r}</span>
                </li>
              ))}
            </ol>
            <ul className="text-muted-foreground mt-4 list-disc space-y-1 border-t pt-3 pl-5 text-xs">
              <li>You earn {REFERRAL_REWARD} Orbits once for each friend. A link that is only opened, shared or installed pays nothing.</li>
              <li>Your link is remembered on a friend&rsquo;s device for {o.attribution_days} days. A friend can only have one inviter, and you cannot invite yourself.</li>
              <li>Referral Orbits count toward your balance and the weekly and all-time Orbit leaderboards. They do not count toward badges, streaks or the Daily Challenge.</li>
              <li>If many friends qualify within a day, extra rewards wait for a quick review. A reward that turns out to be invalid can be reversed.</li>
              <li>Orbits are recognition for taking part. They cannot be bought, sold or exchanged for money.</li>
            </ul>
          </Section>

          <Section title="Your referrals" eyebrow="Recent activity">
            {o.recent.length ? (
              <ul className="divide-y" data-testid="recent-referrals">
                {o.recent.map((r) => {
                  const s = REFERRAL_STATUS_LABEL[r.status] ?? REFERRAL_STATUS_LABEL.registered;
                  return (
                    <li key={r.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <span className="flex min-w-0 items-center gap-2.5">
                        <Users className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
                        <span className="min-w-0">
                          <span className="block font-semibold">A friend · {s.label}</span>
                          <span className="text-muted-foreground block text-xs">{s.detail}</span>
                        </span>
                      </span>
                      <span className="text-muted-foreground shrink-0 text-xs">{formatDate(r.at)}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="py-6 text-center" data-testid="referrals-empty">
                <p className="text-sm font-semibold">No referrals yet</p>
                <p className="text-muted-foreground mx-auto mt-1 max-w-sm text-sm">Copy your link above and send it to a friend. You will see their progress here. Names are never shown.</p>
              </div>
            )}
          </Section>
        </div>

        <div className="space-y-4">
          <Section title="Your invite card" eyebrow="Share it">
            <ReferralCardPanel code={code.data} url={url} name={profile.orbits_cards_public ? profile.full_name : null} />
          </Section>

          <Section title="This week's top referrers" action={<SeeAll href="/referrals/leaderboard">Leaderboard</SeeAll>}>
            {rows.length ? (
              <ReferralBoardRows rows={rows} meId={user.id} size={32} />
            ) : (
              <p className="text-muted-foreground py-3 text-center text-sm">Nobody has a successful referral this week yet. You could be first.</p>
            )}
            <p className="mt-3 border-t pt-3 text-sm">
              {rank.error ? (
                <span className="text-muted-foreground">Your position could not be loaded.</span>
              ) : !rank.data?.participating ? (
                <span className="text-muted-foreground">You are hidden from leaderboards. <Link href="/settings/privacy" className="text-primary-text font-semibold hover:underline">Change this</Link>.</span>
              ) : myRank ? (
                <span>You are <Badge variant="soft">#{myRank}</Badge> this week with {Number(rank.data.score)} {Number(rank.data.score) === 1 ? "referral" : "referrals"}.</span>
              ) : (
                <span className="text-muted-foreground">You are not on this week&rsquo;s board yet.</span>
              )}
            </p>
          </Section>

          <Section>
            <PromptPreference initialOptedOut={pref.data?.opted_out} />
          </Section>
        </div>
      </div>
    </>
  );
}
