"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Image from "next/image";

// Browser storage entry (listed on the cookies page): the opening animation has played in this tab, so it is not repeated.
export const INTRO_KEY = "unisphere:intro-seen";

// The page script that runs before first paint on a hard load (see app/(marketing)/page.js) sets this attribute; this is the same check.
export const INTRO_GUARD = `try{if(sessionStorage.getItem("${INTRO_KEY}")==="1")document.documentElement.setAttribute("data-intro","seen")}catch(e){}`;

const WORD = "UniSphere".split("");
const noSubscription = () => () => {};
const notSeenOnServer = () => false;

function wasSeen() {
  try {
    return window.sessionStorage.getItem(INTRO_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * The loading screen: black, the logo in a ring that draws itself, the Orbits planet circling it, the wordmark rising letter by
 * letter and a counter climbing to 100, then the whole screen lifts away on a curved edge to reveal the hero. About two seconds, once
 * per tab session, and any click or key skips it.
 *
 * It is plain CSS (see `.intro` in landing.css), so it runs from the first paint and dismisses itself even if scripts never load; the
 * hero's own entrance is held back by the same amount (`--intro`). It is not shown when reduced motion is on, and it is decoration, so
 * it is hidden from assistive technology (the page underneath is complete and readable throughout).
 *
 * This component only handles the edges: it remembers that the intro played, lets it be skipped, and removes it once it has finished.
 */
export function Intro() {
  // Read once per visit to the page (not on every render), so marking it as seen below cannot make it vanish mid-animation.
  const read = useMemo(() => {
    let value;
    return () => (value ??= wasSeen());
  }, []);
  const seen = useSyncExternalStore(noSubscription, read, notSeenOnServer);
  const [finished, setFinished] = useState(false);
  const [skipped, setSkipped] = useState(false);

  useEffect(() => {
    if (seen) {
      // A client-side navigation to the home page: the page script did not run, so mark the page the same way.
      document.documentElement.setAttribute("data-intro", "seen");
      return undefined;
    }
    try {
      window.sessionStorage.setItem(INTRO_KEY, "1");
    } catch {
      // storage unavailable: the intro simply plays each time
    }
    const skip = () => setSkipped(true);
    window.addEventListener("pointerdown", skip, { once: true });
    window.addEventListener("keydown", skip, { once: true });
    return () => {
      window.removeEventListener("pointerdown", skip);
      window.removeEventListener("keydown", skip);
    };
  }, [seen]);

  if (seen || finished) return null;
  return (
    <div
      aria-hidden="true"
      data-intro-screen
      className={`intro${skipped ? " is-skipped" : ""}`}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget && event.animationName === "intro-lift") setFinished(true);
      }}
    >
      <div className="intro-stage">
        <div className="intro-logo">
          <svg className="intro-ring" viewBox="0 0 200 200" fill="none">
            <circle cx="100" cy="100" r="92" pathLength="1" stroke="#2f63f0" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          <span className="intro-tile">
            <Image src="/logo-mark.png" alt="" width={256} height={256} priority className="size-full object-contain" />
          </span>
          <span className="intro-orbit">
            <Image src="/icons/reward/orbit.png" alt="" width={96} height={96} priority className="intro-planet" />
          </span>
        </div>
        <p className="intro-word">
          {WORD.map((letter, i) => (
            <span key={i} style={{ "--i": i }}>
              {letter}
            </span>
          ))}
        </p>
        <p className="intro-tag">Your campus. Your people. Your next idea.</p>
      </div>
      <span className="intro-count" />
      <span className="intro-bar">
        <i />
      </span>
    </div>
  );
}
