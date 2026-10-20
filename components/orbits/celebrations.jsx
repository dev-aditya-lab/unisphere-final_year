"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { X } from "lucide-react";
import { RewardIcon } from "@/components/orbits/reward-icon";
import { ShareCardButton } from "@/components/orbits/share-card";
import { Sparkles, burstFrom } from "@/components/orbits/fx";
import { takeCelebrationsAction } from "@/lib/actions/orbits";
import { patchGlance, useGlance } from "@/lib/orbits/glance-store";
import { buildCardSpec } from "@/lib/orbits/card-spec";
import { EASE } from "@/lib/motion";

const AUTO_DISMISS_MS = 14_000;

function specFor(item, who, url) {
  const base = { url, ...(who ?? {}) };
  if (item.category === "streak") return buildCardSpec({ kind: "streak", days: item.target, imageKey: item.image_key, ...base });
  if (item.category === "ranking") return buildCardSpec({ kind: "achievement", title: item.title, icon: item.icon, imageKey: item.image_key, scope: item.scope, period: item.period, rank: item.rank, ...base });
  return buildCardSpec({ kind: "achievement", title: item.title, icon: item.icon, imageKey: item.image_key, ...base });
}

function BadgeReveal({ item }) {
  return (
    <div className="relative grid size-24 shrink-0 place-items-center" aria-hidden="true">
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full -rotate-90" focusable="false">
        <circle cx="50" cy="50" r="46" fill="none" strokeWidth="1.5" className="stroke-border" />
        <circle cx="50" cy="50" r="46" fill="none" strokeWidth="3" strokeLinecap="round" pathLength="1" className="orbit-ring-draw text-primary stroke-current" />
      </svg>
      <Sparkles count={4} />
      <m.div initial={{ scale: 0.35, rotate: -14, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ ...EASE.pop, delay: 0.15 }}>
        <RewardIcon name={item.icon} imageKey={item.image_key} rank={item.rank >= 1 && item.rank <= 10 ? item.rank : undefined} size={64} />
      </m.div>
    </div>
  );
}

/**
 * One earned badge, announced once: the real artwork, its name, what it takes (the badge's own description), any bonus the
 * server paid, and an optional share. It is a polite live region and never takes focus or blocks the page; it leaves on its own
 * after a while unless the member has started to use it.
 */
function AchievementCard({ item, remaining, who, url, onDone }) {
  const ref = useRef(null);
  const engaged = useRef(false);

  useEffect(() => {
    const burst = setTimeout(() => burstFrom(ref.current, { count: 64, spread: 0.9 }), 260);
    const away = setTimeout(() => {
      if (!engaged.current) onDone();
    }, AUTO_DISMISS_MS);
    return () => {
      clearTimeout(burst);
      clearTimeout(away);
    };
  }, [onDone]);

  return (
    <m.div
      ref={ref}
      role="status"
      aria-live="polite"
      data-testid="achievement-celebration"
      initial={{ opacity: 0, y: 28, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 14, scale: 0.98 }}
      transition={EASE.springSoft}
      onPointerDownCapture={() => (engaged.current = true)}
      onFocusCapture={() => (engaged.current = true)}
      onKeyDown={(e) => e.key === "Escape" && onDone()}
      className="surface-raised pointer-events-auto relative w-[min(24rem,calc(100vw-1.5rem))] overflow-hidden border-[var(--orbit-line)] bg-[var(--orbit-wash)] p-4 shadow-[var(--shadow-pop)]"
    >
      <button type="button" onClick={onDone} aria-label="Dismiss" className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/40 absolute top-2 right-2 grid size-7 place-items-center rounded-full outline-none focus-visible:ring-[3px]">
        <X className="size-4" aria-hidden="true" />
      </button>
      <div className="flex items-center gap-3.5">
        <BadgeReveal item={item} />
        <div className="min-w-0 flex-1 pr-5">
          <m.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.3, ease: EASE.out }} className="eyebrow text-primary-text">
            New badge unlocked
          </m.p>
          <m.h2 initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.32, duration: 0.3, ease: EASE.out }} className="mt-0.5 text-base leading-tight font-bold">
            {item.title}
          </m.h2>
          <m.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.42, duration: 0.3 }} className="text-muted-foreground mt-1 text-xs leading-snug">
            {item.description}
          </m.p>
          {item.bonus > 0 && <p className="text-success-text mt-1 text-xs font-bold">+{item.bonus} Orbits added to your balance</p>}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <ShareCardButton label="Share achievement" size="xs" variant="outline" filename={`orbit-${item.achievement_id}`} url={url} spec={specFor(item, who, url)} />
        {remaining > 0 && <span className="text-muted-foreground ml-auto text-xs">{remaining} more to show</span>}
      </div>
    </m.div>
  );
}

/**
 * Watches the server's own count of badges the member has not seen. When there are some it takes them (one atomic database
 * statement that also marks them seen), so a refresh, a second tab or a revisit can never replay the same celebration, and
 * shows them one after another. Nothing here can create a badge: it only announces ones the database already recorded.
 */
export function OrbitCelebrations({ who = null, url = null }) {
  const glance = useGlance();
  const pending = glance?.pending ?? 0;
  const [queue, setQueue] = useState([]);
  const taking = useRef(false);

  useEffect(() => {
    if (pending <= 0 || taking.current) return;
    taking.current = true;
    (async () => {
      try {
        const res = await takeCelebrationsAction();
        if (res?.ok) {
          if (Array.isArray(res.data) && res.data.length) setQueue((q) => [...q, ...res.data.slice(-5)]);
          patchGlance({ pending: 0 });
        }
      } catch {
        /* offline: the badges stay unseen on the server and appear next time */
      } finally {
        taking.current = false;
      }
    })();
  }, [pending]);

  const item = queue[0];
  const done = useCallback(() => setQueue((q) => q.slice(1)), []);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 flex justify-center lg:bottom-6 lg:pl-64">
      <AnimatePresence mode="wait">{item && <AchievementCard key={item.id} item={item} remaining={queue.length - 1} who={who} url={url} onDone={done} />}</AnimatePresence>
    </div>
  );
}
