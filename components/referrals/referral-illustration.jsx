import { useId } from "react";
import { cn } from "@/lib/utils";

const SPARKLES = [
  [120, 60, 1.1, 0], [176, 36, 0.7, 1.2], [455, 44, 0.9, 0.5], [590, 92, 1.2, 1.8], [38, 190, 0.8, 2.2], [606, 296, 0.9, 0.9], [300, 366, 0.7, 1.6],
];
const DOTS = [[96, 118], [238, 78], [402, 96], [548, 160], [84, 312], [214, 348], [418, 352], [520, 372], [612, 238]];

/**
 * Refer & Earn artwork: an invite travels along an orbit to a friend who joins, and 100 Orbits come back as a gift.
 * Original, inline SVG (no image file, no script, no filter): it scales to any width, stays crisp, and works in both themes
 * because it paints its own navy-to-indigo sky. Two loops only (a gentle bob, twinkling stars), all CSS
 * transform/opacity, and all switched off for people who prefer reduced motion (see `.ref-*` in globals.css).
 *
 * The step captions are part of the picture so the story reads without the page around it. Screen readers get one title and
 * description; pass `decorative` when the same words are already on the page next to it.
 */
export function ReferralIllustration({ className, animated = true, decorative = false }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const id = (n) => `${n}-${uid}`;
  const url = (n) => `url(#${id(n)})`;
  const a11y = decorative
    ? { "aria-hidden": true }
    : { role: "img", "aria-labelledby": `${id("t")} ${id("d")}` };

  return (
    <svg viewBox="0 0 640 400" xmlns="http://www.w3.org/2000/svg" className={cn("block h-auto w-full", className)} focusable="false" {...a11y}>
      {!decorative && (
        <>
          <title id={id("t")}>Invite friends. Earn 100 Orbits.</title>
          <desc id={id("d")}>
            Three steps along a glowing orbit: you share your invite, a friend joins UniSphere, and when they become an active member you receive 100 Orbits.
          </desc>
        </>
      )}
      <defs>
        <linearGradient id={id("bg")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0a1130" />
          <stop offset="0.55" stopColor="#191c5a" />
          <stop offset="1" stopColor="#3a2380" />
        </linearGradient>
        <linearGradient id={id("ring")} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#60a5fa" />
          <stop offset="1" stopColor="#c084fc" />
        </linearGradient>
        <radialGradient id={id("glow")} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#818cf8" stopOpacity="0.55" />
          <stop offset="1" stopColor="#818cf8" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id("pa")} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#bfdbfe" />
          <stop offset="0.45" stopColor="#4f46e5" />
          <stop offset="1" stopColor="#1e1b4b" />
        </radialGradient>
        <radialGradient id={id("pb")} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#f5d0fe" />
          <stop offset="0.5" stopColor="#7c3aed" />
          <stop offset="1" stopColor="#2e1065" />
        </radialGradient>
        <linearGradient id={id("coin")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fde68a" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
        <clipPath id={id("clip")}>
          <rect width="640" height="400" rx="28" />
        </clipPath>
      </defs>

      <g clipPath={url("clip")}>
        <rect width="640" height="400" fill={url("bg")} />
        <circle cx="320" cy="190" r="190" fill={url("glow")} />

        {/* orbit rings */}
        <g fill="none" stroke={url("ring")}>
          <ellipse cx="320" cy="212" rx="318" ry="104" transform="rotate(-14 320 212)" strokeWidth="1.5" opacity="0.5" />
          <ellipse cx="320" cy="212" rx="262" ry="78" transform="rotate(-14 320 212)" strokeWidth="1.5" opacity="0.38" strokeDasharray="2 9" strokeLinecap="round" />
          <ellipse cx="320" cy="212" rx="206" ry="54" transform="rotate(-14 320 212)" strokeWidth="1" opacity="0.28" />
        </g>

        {/* planets */}
        <g className={animated ? "ref-bob" : undefined}>
          <circle cx="52" cy="112" r="30" fill={url("pa")} />
          <ellipse cx="52" cy="112" rx="50" ry="11" transform="rotate(-20 52 112)" fill="none" stroke="#a5b4fc" strokeOpacity="0.55" strokeWidth="3" />
        </g>
        <circle cx="580" cy="62" r="20" fill={url("pb")} />
        <circle cx="566" cy="54" r="5" fill="#f5d0fe" fillOpacity="0.35" />

        {/* stars */}
        {DOTS.map(([x, y], i) => (
          <circle key={`d${i}`} cx={x} cy={y} r={i % 3 === 0 ? 2 : 1.4} fill="#c7d2fe" opacity="0.7" />
        ))}
        {SPARKLES.map(([x, y, s, delay], i) => (
          <path key={`s${i}`} className={animated ? "ref-twinkle" : undefined} style={animated ? { animationDelay: `${delay}s` } : undefined}
            d="M0 -7 L2 -2 L7 0 L2 2 L0 7 L-2 2 L-7 0 L-2 -2 Z" transform={`translate(${x} ${y}) scale(${s})`} fill="#e0e7ff" opacity="0.85" />
        ))}

        {/* the journey: invite -> friend -> reward */}
        <g fill="none" stroke="#93c5fd" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="1 9" opacity="0.9">
          <path d="M150 232 C 196 170, 238 150, 272 158" />
          <path d="M368 158 C 412 168, 452 204, 486 232" />
        </g>
        <g fill="#93c5fd">
          <path d="M276 152 l14 8 l-15 6 z" />
          <path d="M492 226 l12 10 l-16 3 z" />
        </g>

        {/* 1. share the invite */}
        <g transform="translate(110 252)">
          <circle r="46" fill="#4f46e5" fillOpacity="0.28" stroke="#818cf8" strokeWidth="2" />
          <path d="M-20 3 L24 -17 L9 21 L1 7 Z" fill="#e0e7ff" />
          <path d="M1 7 L24 -17" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" />
        </g>

        {/* 2. a friend joins */}
        <g transform="translate(320 172)">
          <circle r="52" fill="#3b82f6" fillOpacity="0.24" stroke="#60a5fa" strokeWidth="2" />
          <circle cx="0" cy="-10" r="13" fill="#e0e7ff" />
          <path d="M-24 28 a24 24 0 0 1 48 0 z" fill="#c7d2fe" />
          <circle cx="34" cy="-34" r="12" fill="#22c55e" stroke="#0a1130" strokeWidth="3" />
          <path d="M34 -40 v12 M28 -34 h12" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
        </g>

        {/* 3. you receive 100 Orbits */}
        <g transform="translate(530 252)">
          <circle r="50" fill="#a855f7" fillOpacity="0.26" stroke="#c084fc" strokeWidth="2" />
          <rect x="-24" y="-4" width="48" height="30" rx="4" fill="#8b5cf6" />
          <rect x="-28" y="-15" width="56" height="13" rx="4" fill="#c4b5fd" />
          <rect x="-4.5" y="-15" width="9" height="41" fill="#fde68a" />
          <path d="M0 -15 c-10 -14 -22 -4 -12 0 z M0 -15 c10 -14 22 -4 12 0 z" fill="#fde68a" />
          <g transform="translate(26 -32)">
            <circle r="21" fill={url("coin")} stroke="#b45309" strokeWidth="2" />
            <circle r="15" fill="none" stroke="#b45309" strokeOpacity="0.45" strokeWidth="1.5" />
            <text textAnchor="middle" y="5" fontSize="13" fontWeight="800" fill="#78350f" fontFamily="ui-sans-serif, system-ui, sans-serif">+100</text>
          </g>
        </g>

        {/* captions */}
        <g fill="#c7d2fe" fontFamily="ui-sans-serif, system-ui, sans-serif" fontSize="20" fontWeight="700" textAnchor="middle">
          <text x="110" y="334">Share</text>
          <text x="320" y="254">Friend joins</text>
          <text x="530" y="334">You earn 100</text>
        </g>
      </g>
    </svg>
  );
}
