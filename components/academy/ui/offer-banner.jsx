"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PartyPopper, Timer } from "lucide-react";
import { firePartyPopper } from "@/components/motion/confetti";

// Colours for the Academy's popper: the Academy blue, white, and two warm accents so the pieces stand out on a white page.
const POPPER = ["#1d4ed8", "#5b8cff", "#ffffff", "#ffc83d", "#ff6b4a", "#0b132b"];
const SEEN = "ac-offer-seen:";
const DAY = 86_400_000;

/** Time left until `endsAt`, ticking each second once it is under two days. Before the page is interactive it shows the date, so server and browser agree. */
function Countdown({ endsAt }) {
  const router = useRouter();
  const [left, setLeft] = useState(null);
  const end = new Date(endsAt).getTime();

  useEffect(() => {
    const tick = () => setLeft(Math.max(0, end - Date.now()));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [end]);

  useEffect(() => {
    // The price on the page was true a moment ago; ask the server for the price that is true now.
    if (left === 0) router.refresh();
  }, [left, router]);

  const date = new Date(endsAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
  if (left === null || left > 2 * DAY) {
    return <span className="inline-flex items-center gap-1.5"><Timer className="size-3.5" aria-hidden />Ends {date} IST</span>;
  }
  if (left === 0) return <span>This offer has ended</span>;
  const h = Math.floor(left / 3_600_000), m = Math.floor((left % 3_600_000) / 60_000), s = Math.floor((left % 60_000) / 1000);
  return (
    <span className="inline-flex items-center gap-1.5">
      <Timer className="size-3.5" aria-hidden />
      <span className="sr-only">Ends {date} IST</span>
      <span aria-hidden className="tabular-nums">Ends in {h > 0 ? `${h}h ` : ""}{String(m).padStart(2, "0")}m {String(s).padStart(2, "0")}s</span>
    </span>
  );
}

/**
 * An offer the student did not have to ask for: a scheduled price or an automatic coupon. It shows only facts the server gave it:
 * the real end date (a live countdown), the real number of places left at the price, the real amount saved. The party popper goes
 * off once per offer per browser session, never when the person prefers reduced motion, and the page makes sense without it.
 */
export function OfferBanner({ id, label, saved, percentOff, endsAt, usesLeft, celebrate = true }) {
  useEffect(() => {
    if (!celebrate) return;
    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN + id) === "1";
      if (!seen) sessionStorage.setItem(SEEN + id, "1");
    } catch {
      /* private mode: it may celebrate again on the next visit, which is harmless */
    }
    if (seen) return;
    const t = setTimeout(() => firePartyPopper({ colors: POPPER }), 450);
    return () => clearTimeout(t);
  }, [id, celebrate]);

  const few = Number.isInteger(usesLeft) && usesLeft > 0 && usesLeft <= 20;
  return (
    <div className="ac-offer" role="group" aria-label={`Offer: ${label}`}>
      <span className="ac-offer-icon" aria-hidden><PartyPopper className="size-5" /></span>
      <div className="min-w-0">
        <p className="ac-offer-title">
          {label}
          {percentOff ? <span className="ac-offer-off">{percentOff}% off</span> : null}
        </p>
        {saved && <p className="ac-offer-saved">You save {saved}</p>}
        <p className="ac-offer-meta">
          {endsAt && <Countdown endsAt={endsAt} />}
          {few && <span className="ac-offer-left">Only {usesLeft} left at this price</span>}
        </p>
      </div>
    </div>
  );
}
