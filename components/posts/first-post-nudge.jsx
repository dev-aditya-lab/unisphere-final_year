"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { Check, CircleHelp, Globe, Hand, PenLine, Trophy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useClientValue } from "@/hooks/use-client-value";
import { requestCompose } from "@/lib/client/compose";
import { onPostCreated } from "@/lib/client/feed-events";
import { EASE, rise, stagger } from "@/lib/motion";
import { cn } from "@/lib/utils";

// Two small, local memories (listed on the cookie page): the welcome pop-up is shown once, and "Maybe later" keeps the
// card away for a few days. Neither leaves the device.
const SEEN_KEY = "unisphere:first-post-seen";
const SNOOZE_KEY = "unisphere:first-post-snoozed";
const SNOOZE_DAYS = 3;
const WELCOME_DELAY_MS = 2400; // after the page has settled and any "welcome" confetti has played

function readFlag(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeFlag(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: the prompt may come back, nothing is lost */
  }
}
const isSnoozed = () => {
  const at = Number(readFlag(SNOOZE_KEY));
  return Boolean(at) && Date.now() - at < SNOOZE_DAYS * 86_400_000;
};

/**
 * Sentence stems, not blank boxes: the hardest part of a first post is the empty field, so each starter writes the first
 * few words and leaves the rest to the member, who can change all of it before it goes live.
 */
function startersFor(first) {
  return [
    { id: "intro", label: "Introduce myself", Icon: Hand, tone: "tone-coral", starter: { category: "general", body: `Hi everyone, I'm ${first}. Right now I'm exploring ` } },
    { id: "ask", label: "Ask a question", Icon: CircleHelp, tone: "tone-plum", starter: { category: "questions", body: "Does anyone here know how to " } },
    { id: "win", label: "Share a small win", Icon: Trophy, tone: "tone-sun", starter: { category: "achievements", body: "Small win this week: " } },
  ];
}

// ── Illustration ────────────────────────────────────────────────────────────

const LOOP_SECONDS = 7;

/**
 * A post being written, sent and welcomed: lines of text draw themselves, a paper plane leaves, then a reaction and a
 * reply pop in. That last part is the point: it shows the reward of posting before the first post exists.
 * One 7-second loop, transform and opacity only. For reduced-motion members it is a still picture of the finished scene.
 */
export function FirstPostIllustration({ className }) {
  const reduce = useReducedMotion();
  // Animate several properties through the same moments of the loop; `rest` picks the frame shown when nothing moves.
  const loop = (props, times, rest = 0.72) => {
    if (reduce) {
      const i = times.reduce((found, t, k) => (t <= rest ? k : found), 0);
      return { initial: false, animate: Object.fromEntries(Object.entries(props).map(([key, values]) => [key, values[i]])) };
    }
    return { initial: false, animate: props, transition: { duration: LOOP_SECONDS, times, repeat: Infinity, ease: "easeInOut" } };
  };
  const twinkle = (delay) =>
    reduce
      ? { initial: false, animate: { scale: 1, opacity: 0.9 } }
      : { initial: false, animate: { scale: [0.3, 1, 0.3], opacity: [0, 1, 0] }, transition: { duration: 2.6, delay, repeat: Infinity, ease: "easeInOut" } };

  return (
    <svg viewBox="0 0 280 200" fill="none" aria-hidden="true" focusable="false" className={cn("h-auto w-full", className)}>
      <circle cx="140" cy="100" r="84" fill="var(--primary-soft)" />

      {/* A slow ring of small planets: the "sphere" */}
      <g className="motion-reduce:animate-none animate-[orbit_26s_linear_infinite]" style={{ transformOrigin: "140px 100px" }}>
        <circle cx="140" cy="100" r="94" stroke="var(--border-strong)" strokeWidth="1.5" strokeDasharray="2 7" strokeLinecap="round" />
        <circle cx="234" cy="100" r="5.5" fill="var(--coral)" />
        <circle cx="46" cy="100" r="4.5" fill="var(--teal)" />
        <circle cx="140" cy="6" r="5" fill="var(--sun)" />
      </g>

      {/* The post */}
      <m.g initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={EASE.springSoft}>
        <path
          d="M86 58H194A16 16 0 0 1 210 74V130A16 16 0 0 1 194 146H112L90 166V146H86A16 16 0 0 1 70 130V74A16 16 0 0 1 86 58Z"
          fill="var(--card)"
          stroke="var(--border-strong)"
          strokeWidth="1.5"
          style={{ filter: "drop-shadow(0 8px 14px rgb(15 23 42 / 0.12))" }}
        />
        <circle cx="92" cy="80" r="8" fill="var(--coral)" />
        <path d="M108 80H146" stroke="var(--border-strong)" strokeWidth="5" strokeLinecap="round" />
        <m.path d="M90 104H190" stroke="var(--primary)" strokeWidth="6" strokeLinecap="round" {...loop({ pathLength: [0, 0, 1, 1, 0] }, [0, 0.08, 0.22, 0.88, 0.96])} />
        <m.path d="M90 118H174" stroke="var(--primary)" strokeOpacity="0.55" strokeWidth="6" strokeLinecap="round" {...loop({ pathLength: [0, 0, 1, 1, 0] }, [0, 0.18, 0.32, 0.88, 0.96])} />
        <m.path d="M90 132H146" stroke="var(--teal)" strokeWidth="6" strokeLinecap="round" {...loop({ pathLength: [0, 0, 1, 1, 0] }, [0, 0.28, 0.4, 0.88, 0.96])} />
      </m.g>

      {/* Sent: a paper plane leaves the post */}
      <m.g {...loop({ x: [0, 0, 0, 54, 62], y: [0, 0, 0, -78, -88], opacity: [0, 0, 1, 1, 0] }, [0, 0.4, 0.44, 0.6, 0.66], 0.5)}>
        <path d="M188 146 214 134 204 158 200 148Z" fill="var(--primary)" />
        <path d="M200 148 214 134" stroke="var(--card)" strokeWidth="1.5" strokeLinecap="round" />
      </m.g>

      {/* Welcomed: a reaction and a reply arrive */}
      <m.g {...loop({ scale: [0, 0, 1.3, 1, 1, 0], opacity: [0, 0, 1, 1, 1, 0] }, [0, 0.58, 0.64, 0.7, 0.92, 0.97])}>
        <circle cx="210" cy="60" r="13" fill="var(--coral)" />
        <path d="M210 67C201 61 204 53 210 58C216 53 219 61 210 67Z" fill="#fff" />
      </m.g>
      <m.g {...loop({ scale: [0, 0, 1.3, 1, 1, 0], opacity: [0, 0, 1, 1, 1, 0] }, [0, 0.66, 0.72, 0.78, 0.92, 0.97])}>
        <circle cx="72" cy="150" r="12" fill="var(--teal)" />
        <path d="M66 145H78V152H73L70 156V152H66Z" fill="#fff" />
      </m.g>

      {/* Sparkles */}
      <g transform="translate(236 40)">
        <m.path d="M0-7 2-2 7 0 2 2 0 7-2 2-7 0-2-2Z" fill="var(--sun)" {...twinkle(0)} />
      </g>
      <g transform="translate(40 52)">
        <m.path d="M0-6 1.6-1.6 6 0 1.6 1.6 0 6-1.6 1.6-6 0-1.6-1.6Z" fill="var(--primary)" {...twinkle(0.9)} />
      </g>
      <g transform="translate(246 150)">
        <m.path d="M0-5 1.4-1.4 5 0 1.4 1.4 0 5-1.4 1.4-5 0-1.4-1.4Z" fill="var(--teal)" {...twinkle(1.7)} />
      </g>
    </svg>
  );
}

// ── Shared pieces ───────────────────────────────────────────────────────────

/** Where the member is: two steps done, the third is theirs. Progress already made is a reason to finish. */
function Steps() {
  const steps = [
    { label: "Joined UniSphere", done: true },
    { label: "Set up your profile", done: true },
    { label: "First post", done: false },
  ];
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" aria-label="Your progress: 2 of 3 steps done">
      {steps.map((s, i) => (
        <li key={s.label} className="flex items-center gap-2">
          <span
            className={cn(
              "grid size-5 place-items-center rounded-full border text-[10px] font-bold",
              s.done ? "border-transparent bg-success-soft text-success-text" : "border-primary-text/60 text-primary-text relative",
            )}
          >
            {s.done ? <Check className="size-3" aria-hidden="true" /> : i + 1}
            {!s.done && <span aria-hidden="true" className="border-primary-text/50 absolute -inset-1 animate-ping rounded-full border motion-reduce:hidden" />}
          </span>
          <span className={cn(s.done ? "text-muted-foreground" : "font-semibold")}>{s.label}</span>
          {i < steps.length - 1 && <span aria-hidden="true" className="bg-border-strong hidden h-px w-4 sm:block" />}
        </li>
      ))}
    </ol>
  );
}

function Starters({ items, onPick }) {
  return (
    <m.ul variants={stagger(0.07, 0.2)} initial="hidden" animate="show" className="flex flex-wrap gap-2" aria-label="Ways to start">
      {items.map(({ id, label, Icon, tone, starter }) => (
        <m.li key={id} variants={rise}>
          <button
            type="button"
            onClick={() => onPick(starter)}
            className={cn(
              tone,
              "press bg-card hover:bg-accent border-border-strong focus-visible:ring-ring/45 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-[3px] focus-visible:outline-hidden",
            )}
          >
            <Icon className="size-4 text-[var(--tone-text)]" aria-hidden="true" />
            {label}
          </button>
        </m.li>
      ))}
    </m.ul>
  );
}

const Reassurance = () => (
  <p className="text-muted-foreground flex items-start gap-1.5 text-xs leading-relaxed">
    <Globe className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
    <span>You can edit every word before it goes live. Posts are visible to all members, and your first one can earn Orbits.</span>
  </p>
);

// ── The prompt ──────────────────────────────────────────────────────────────

/**
 * Shown on the feed to a member who has not posted yet: a card that stays (until they post, or say "Maybe later" for a
 * few days) and a welcome pop-up that appears once. Both hand the member a starter and open the editor with it.
 * Mounted by the feed page only when the member has no posts; it hides itself the moment their first post is saved.
 */
export function FirstPostPrompt({ name }) {
  const first = String(name ?? "").trim().split(/\s+/)[0] || "there";
  const items = startersFor(first);
  // Hidden for the server render and hydration, then shown: the card never flashes in for someone who snoozed it.
  const snoozedBefore = useClientValue(isSnoozed, true);
  const [snoozedNow, setSnoozedNow] = useState(false);
  const [posted, setPosted] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);

  useEffect(
    () =>
      onPostCreated(() => {
        setPosted(true);
        setWelcomeOpen(false);
      }),
    [],
  );

  useEffect(() => {
    if (readFlag(SEEN_KEY) || window.location.hash === "#compose") return;
    const t = setTimeout(() => {
      writeFlag(SEEN_KEY, "1");
      setWelcomeOpen(true);
    }, WELCOME_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  function snooze() {
    writeFlag(SNOOZE_KEY, String(Date.now()));
    setSnoozedNow(true);
  }

  function start(starter) {
    if (welcomeOpen) {
      setWelcomeOpen(false);
      // Let the pop-up finish closing so it does not take the focus back from the editor.
      setTimeout(() => requestCompose(starter), 180);
    } else {
      requestCompose(starter);
    }
  }

  const showCard = !posted && !snoozedBefore && !snoozedNow;

  return (
    <>
      <AnimatePresence initial={false}>
        {showCard && (
          <m.section
            key="first-post-card"
            aria-labelledby="first-post-title"
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.18 } }}
            transition={EASE.springSoft}
            className="surface-raised relative overflow-hidden p-4 sm:p-5"
          >
            <div aria-hidden="true" className="bg-primary-soft pointer-events-none absolute -top-16 -right-16 size-48 rounded-full opacity-70 blur-2xl" />
            <button
              type="button"
              onClick={snooze}
              className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/45 absolute top-2 right-2 z-10 grid size-8 place-items-center rounded-lg transition-colors focus-visible:ring-[3px] focus-visible:outline-hidden"
              aria-label="Maybe later"
              title="Maybe later"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
            <div className="relative grid items-center gap-4 sm:grid-cols-[10.5rem_1fr] sm:gap-6">
              <FirstPostIllustration className="mx-auto max-w-44 sm:max-w-none" />
              <div className="space-y-3 pr-6">
                <Steps />
                <div>
                  <h2 id="first-post-title" className="font-heading text-xl leading-tight font-extrabold tracking-tight">
                    {first === "there" ? "Say hello" : `Say hello, ${first}`}. Your first post takes 30 seconds.
                  </h2>
                  <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">New voices get noticed. Pick a starter, finish the sentence, and you are in the conversation.</p>
                </div>
                <Starters items={items} onPick={start} />
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
                  <Button onClick={() => start(null)}>
                    <PenLine /> Write my first post
                  </Button>
                  <button type="button" onClick={snooze} className="text-muted-foreground hover:text-foreground rounded text-sm font-medium underline-offset-2 hover:underline">
                    Maybe later
                  </button>
                </div>
                <Reassurance />
              </div>
            </div>
          </m.section>
        )}
      </AnimatePresence>

      <Dialog open={welcomeOpen && !posted} onOpenChange={setWelcomeOpen}>
        <DialogContent className="gap-5 overflow-hidden sm:max-w-md">
          <div className="bg-primary-soft/60 -mx-5 -mt-5 px-6 pt-6 sm:-mx-6 sm:-mt-6">
            <FirstPostIllustration className="mx-auto max-w-64" />
          </div>
          <div className="space-y-2 text-center">
            <DialogTitle className="text-2xl">Welcome{first === "there" ? "" : `, ${first}`}. Say hello to your campus.</DialogTitle>
            <DialogDescription className="leading-relaxed">A short intro is enough. Pick a starter and we will write the first few words for you.</DialogDescription>
          </div>
          <div className="flex justify-center">
            <Starters items={items} onPick={start} />
          </div>
          <div className="space-y-3">
            <Button size="lg" className="w-full" onClick={() => start(null)}>
              <PenLine /> Write my first post
            </Button>
            <button type="button" onClick={() => setWelcomeOpen(false)} className="text-muted-foreground hover:text-foreground mx-auto block rounded text-sm font-medium underline-offset-2 hover:underline">
              Not now
            </button>
            <Reassurance />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
