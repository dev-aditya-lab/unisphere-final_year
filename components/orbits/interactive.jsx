"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleAlert, Loader2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BoardRows } from "@/components/orbits/leaderboard-list";
import { RewardIcon } from "@/components/orbits/reward-icon";
import { Section, SeeAll } from "@/components/orbits/cards";
import { claimCheckinAction, loadLeaderboardAction, submitAnswerAction } from "@/lib/actions/orbits";
import { CATEGORY_LABEL, SCOPES } from "@/lib/orbits/icons";
import { cn } from "@/lib/utils";

/** Daily Orbit Bonus: the reward is shown before claiming; the server decides, and repeated clicks cannot pay twice. */
export function DailyBonusCard({ checkin }) {
  const router = useRouter();
  const [claimed, setClaimed] = useState(checkin.claimed_today);
  const [gain, setGain] = useState(null);
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();

  function claim() {
    setError(null);
    startTransition(async () => {
      let res;
      try {
        res = await claimCheckinAction();
      } catch {
        res = { ok: false, error: "We could not reach UniSphere. Check your connection and try again." };
      }
      if (res.ok) {
        setClaimed(true);
        if (res.data.claimed) {
          setGain(res.data.amount);
          toast.success(`You earned +${res.data.amount} Orbits!`);
        }
        router.refresh();
      } else setError(res.error);
    });
  }

  return (
    <Section aria-label="Daily Orbit Bonus" className="flex items-center gap-4">
      <RewardIcon name="calendar-check" size={64} alt="Daily check-in" />
      <div className="min-w-0 flex-1">
        <p className="eyebrow">Daily Orbit Bonus</p>
        {claimed ? (
          <p className="text-sm font-semibold" role="status">
            {gain ? `You earned +${gain} Orbits!` : "Claimed today."} <span className="text-muted-foreground font-normal">Come back tomorrow.</span>
          </p>
        ) : (
          <p className="text-sm">
            <span className="font-semibold">+{checkin.reward} Orbits</span> <span className="text-muted-foreground">waiting for you today.</span>
          </p>
        )}
        {error && (
          <p role="alert" className="text-destructive-text mt-1 flex items-center gap-1.5 text-xs">
            <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" /> {error}
          </p>
        )}
      </div>
      <Button onClick={claim} disabled={claimed || pending} aria-busy={pending} className="shrink-0">
        {pending ? <Loader2 className="animate-spin" /> : null}
        {claimed ? "Claimed" : pending ? "Claiming…" : "Claim"}
      </Button>
    </Section>
  );
}

/**
 * Daily Challenge. The answer key never reaches the browser until the server has recorded this member's answer; the
 * result (correct or not, the explanation and the Orbit breakdown) is whatever the server returns.
 */
export function ChallengeCard({ question }) {
  const router = useRouter();
  const [selected, setSelected] = useState(question?.result?.selected ?? null);
  const [result, setResult] = useState(question?.result ? { ...question.result, earnedParticipation: null } : null);
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();
  const radios = useRef([]);

  if (!question) {
    return (
      <Section aria-label="Daily Challenge" className="flex items-center gap-4">
        <RewardIcon name="brain" size={64} />
        <div className="min-w-0 flex-1">
          <p className="eyebrow">Daily Challenge</p>
          <p className="text-sm font-semibold">No challenge is open right now.</p>
          <p className="text-muted-foreground text-sm">A new question appears each day. Meanwhile, look back at what you have learned.</p>
        </div>
        <Link href="/orbits/learning" className="text-primary-text shrink-0 text-sm font-semibold hover:underline">Learning history</Link>
      </Section>
    );
  }

  const answered = Boolean(result);

  function submit() {
    if (selected === null) return;
    setError(null);
    startTransition(async () => {
      let res;
      try {
        res = await submitAnswerAction({ questionId: question.id, selected });
      } catch {
        res = { ok: false, error: "We could not reach UniSphere. Your choice is still here: try again." };
      }
      if (!res.ok) return setError(res.error);
      const d = res.data;
      setSelected(d.selected);
      setResult({ selected: d.selected, is_correct: d.is_correct, correct_index: d.correct_index, explanation: d.explanation, earnedParticipation: d.earned_participation, earnedCorrect: d.earned_correct, already: d.already_answered });
      if (!d.already_answered) toast.success(d.is_correct ? `Correct answer! +${d.earned_participation + d.earned_correct} Orbits.` : `Thanks for answering. +${d.earned_participation} Orbits.`);
      router.refresh();
    });
  }

  function onKey(e, i) {
    if (answered) return;
    const move = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (move === undefined) return;
    e.preventDefault();
    const next = (i + move + 4) % 4;
    setSelected(next);
    radios.current[next]?.focus();
  }

  const earned = result ? (result.earnedParticipation ?? 0) + (result.earnedCorrect ?? 0) || result.earned || 0 : 0;

  return (
    <Section aria-label="Daily Challenge" className="space-y-4">
      <div className="flex items-start gap-3">
        <RewardIcon name="brain" size={56} className="mt-0.5" />
        <div className="min-w-0">
          <p className="eyebrow">Daily Challenge · {CATEGORY_LABEL[question.category] ?? question.category}</p>
          <h3 id="challenge-q" className="mt-0.5 text-base leading-snug font-bold">{question.question}</h3>
          {question.fallback && <p className="text-muted-foreground mt-1 text-xs">This is the latest question you have not answered. It earns Orbits but does not count toward your streak.</p>}
        </div>
      </div>

      <div role="radiogroup" aria-labelledby="challenge-q" className="grid gap-2">
        {question.options.map((opt, i) => {
          const chosen = selected === i;
          const isCorrect = answered && result.correct_index === i;
          const isWrongChoice = answered && chosen && !result.is_correct;
          return (
            <button
              key={i}
              ref={(el) => (radios.current[i] = el)}
              type="button"
              role="radio"
              aria-checked={chosen}
              tabIndex={chosen || (selected === null && i === 0) ? 0 : -1}
              disabled={answered || pending}
              onClick={() => setSelected(i)}
              onKeyDown={(e) => onKey(e, i)}
              className={cn(
                "focus-visible:ring-ring/40 flex min-h-12 items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left text-sm font-medium transition-colors outline-none focus-visible:ring-[3px]",
                !answered && (chosen ? "border-primary bg-primary-soft text-primary-text" : "bg-card hover:bg-accent"),
                isCorrect && "border-success bg-success-soft text-success-text",
                isWrongChoice && "border-destructive bg-destructive-soft text-destructive-text",
                answered && !isCorrect && !isWrongChoice && "bg-muted/50 text-muted-foreground",
              )}
            >
              <span className={cn("grid size-6 shrink-0 place-items-center rounded-full border text-xs font-bold", chosen && !answered && "border-primary bg-primary text-primary-foreground")} aria-hidden="true">
                {"ABCD"[i]}
              </span>
              <span className="min-w-0 flex-1">{opt}</span>
              {isCorrect && <span className="flex items-center gap-1 text-xs font-bold"><RewardIcon name="circle-check" size={22} />Correct</span>}
              {isWrongChoice && <span className="flex items-center gap-1 text-xs font-bold"><RewardIcon name="circle-x" size={22} />Your answer</span>}
            </button>
          );
        })}
      </div>

      {error && (
        <p role="alert" className="text-destructive-text flex items-center gap-1.5 text-sm">
          <CircleAlert className="size-4 shrink-0" aria-hidden="true" /> {error}
        </p>
      )}

      {!answered ? (
        <Button onClick={submit} disabled={selected === null || pending} aria-busy={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          {pending ? "Checking…" : "Submit answer"}
        </Button>
      ) : (
        <div className="bg-muted/50 space-y-2 rounded-xl p-3.5 text-sm" role="status">
          <p className="flex items-center gap-2 font-bold">
            <RewardIcon name={result.is_correct ? "circle-check" : "circle-x"} size={28} />
            {result.is_correct ? "Correct answer!" : "Not quite."}
            {earned > 0 && <span className="text-success-text ml-auto">+{earned} Orbits</span>}
          </p>
          <p className="text-muted-foreground leading-relaxed">{result.explanation}</p>
          {result.earnedParticipation != null && (
            <p className="text-muted-foreground text-xs">
              Participation +{result.earnedParticipation}
              {result.earnedCorrect > 0 ? ` · correct answer +${result.earnedCorrect}` : ""}
            </p>
          )}
          <Link href="/orbits/learning" className="text-primary-text inline-block text-xs font-semibold hover:underline">See previous questions</Link>
        </div>
      )}
    </Section>
  );
}

/** Leaderboard preview with the three scopes. The first board comes from the server; switching loads another. */
export function LeaderboardPreview({ initial, meId }) {
  const [scope, setScope] = useState("global");
  const [state, setState] = useState({ status: "ready", ...initial });
  const [pending, startTransition] = useTransition();
  const first = useRef(true);
  const [tick, setTick] = useState(0);
  const period = "weekly";

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    let live = true;
    startTransition(async () => {
      let res;
      try {
        res = await loadLeaderboardAction({ scope, period });
      } catch {
        res = { ok: false };
      }
      if (!live) return;
      setState(res.ok ? { status: "ready", rows: res.data.rows, me: res.data.me } : { status: "error" });
    });
    return () => {
      live = false;
    };
  }, [scope, tick]);

  const me = state.me;
  return (
    <Section aria-label="Leaderboard" title="Orbit Leaderboard" eyebrow="This week" action={<SeeAll href={`/orbits/leaderboard?scope=${scope}`}>Full leaderboard</SeeAll>}>
      <div role="tablist" aria-label="Leaderboard scope" className="bg-muted mb-3 flex rounded-xl p-1">
        {SCOPES.map((s) => (
          <button
            key={s.value}
            role="tab"
            type="button"
            aria-selected={scope === s.value}
            onClick={() => setScope(s.value)}
            className={cn("focus-visible:ring-ring/40 h-8 flex-1 rounded-lg px-2 text-[13px] font-semibold transition-colors outline-none focus-visible:ring-[3px]", scope === s.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="min-h-40" aria-busy={pending}>
        {state.status === "error" ? (
          <div role="alert" className="flex flex-col items-center gap-2 py-8 text-center text-sm">
            <p className="text-destructive-text">Could not load this leaderboard.</p>
            <Button size="sm" variant="outline" onClick={() => setTick((t) => t + 1)}><RotateCw /> Try again</Button>
          </div>
        ) : pending && !state.rows ? (
          <div className="space-y-2" aria-hidden="true">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-9" />)}</div>
        ) : state.rows?.length ? (
          <BoardRows rows={state.rows} meId={meId} />
        ) : (
          <p className="text-muted-foreground py-8 text-center text-sm">
            {scope === "college" && me && !me.has_college
              ? "Add your college in your profile to see this leaderboard. It is self-reported, never verified."
              : scope === "connections"
                ? "Connect with people and earn Orbits together: your connections appear here."
                : "Nobody has earned Orbits here yet this week. Be the first."}
          </p>
        )}
      </div>

      {me && (
        <p className="mt-3 border-t pt-3 text-sm" aria-live="polite">
          {!me.participating ? (
            <span className="text-muted-foreground">You are not on leaderboards. You can change that in your privacy settings.</span>
          ) : me.rank ? (
            <>
              Your rank: <span className="font-bold">#{me.rank}</span> of {Number(me.total).toLocaleString("en-IN")} · <span className="font-semibold tabular-nums">{Number(me.score).toLocaleString("en-IN")} Orbits</span>
              {me.prev_rank && Number(me.prev_rank) !== Number(me.rank) ? <span className={Number(me.prev_rank) > Number(me.rank) ? "text-success-text" : "text-destructive-text"}> · {Number(me.prev_rank) > Number(me.rank) ? `up ${Number(me.prev_rank) - Number(me.rank)}` : `down ${Number(me.rank) - Number(me.prev_rank)}`} since yesterday</span> : null}
            </>
          ) : (
            <span className="text-muted-foreground">Earn your first Orbits this week to appear here.</span>
          )}
        </p>
      )}
      <p className="text-muted-foreground mt-1 text-xs">Weekly boards are in progress until Sunday. College is self-reported, not verified.</p>
    </Section>
  );
}
