"use client";

import { useId } from "react";
import { BellRing, CalendarDays, Lock, MessageCircle, MessageSquareHeart } from "@/components/icons/lucide-compat";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import "./push-prompt.css";

/**
 * A bell that rings, three notification cards floating around it, and the brand's orbit and star: drawn as one inline SVG so it needs
 * no image download and follows the light or dark theme (push-prompt.css). Purely decorative, so hidden from assistive technology.
 */
const BELL = "M160 36c-25 0-44 19-44 45v26c0 9-4 16-12 22h112c-8-6-12-13-12-22V81c0-25-19-45-44-45z";

export function PushIllustration() {
  const clipId = useId().replace(/:/g, ""); // each copy of the picture needs its own id
  const card = (x, y, className) => (
    <g className={`float ${className}`}>
      <rect className="card" x={x} y={y} width="90" height="34" rx="10" />
      <circle className="accent" cx={x + 18} cy={y + 17} r="8" />
      <rect className="line" x={x + 33} y={y + 10} width="46" height="6" rx="3" />
      <rect className="line-soft" x={x + 33} y={y + 21} width="30" height="5" rx="2.5" />
    </g>
  );
  return (
    <svg viewBox="0 0 320 190" className="push-art mx-auto h-auto w-full max-w-[19rem]" aria-hidden="true" focusable="false">
      <circle className="disc" cx="160" cy="98" r="76" />
      <ellipse className="orbit" cx="160" cy="98" rx="140" ry="40" transform="rotate(-16 160 98)" />
      <circle className="accent" cx="264" cy="44" r="7" />
      <path className="accent" d="M120 14l3.5 9.5L133 27l-9.5 3.5L120 40l-3.5-9.5L107 27l9.5-3.5z" />

      {card(14, 34, "float-1")}
      {card(226, 98, "float-2")}
      {card(8, 128, "float-3")}

      <g className="bell">
        <circle className="accent" cx="160" cy="30" r="8" />
        <clipPath id={clipId}>
          <path d={BELL} />
        </clipPath>
        <path className="accent" d={BELL} />
        <path className="shade" opacity="0.35" clipPath={`url(#${clipId})`} d="M186 30c14 10 20 30 20 51v26c0 9 4 16 12 22h-32z" />
        <path className="shine" d="M130 84c0-13 8-23 19-28" />
        <rect className="shade" x="100" y="126" width="120" height="8" rx="4" />
        <path className="shade" d="M146 134a14 14 0 0 0 28 0z" />
      </g>
      <circle className="badge" cx="206" cy="52" r="13" />
      <text className="badge-text" x="206" y="57" textAnchor="middle">1</text>
    </svg>
  );
}

const BENEFITS = [
  [MessageCircle, "New messages", "Know the moment someone writes to you."],
  [MessageSquareHeart, "Replies and reactions", "See who answered your post or mentioned you."],
  [CalendarDays, "Event reminders", "Never miss an event you said yes to."],
];

const STEPS = ["Tap Open settings below.", "Switch notifications on for UniSphere.", "Come back here. We finish the rest."];

/**
 * The pop-up that offers to turn notifications on, in the Android app only (components/native/native-push.jsx decides when).
 * On a phone it slides up from the bottom, like the app's other sheets.
 *  - kind "ask": what notifications are for, and a button that leads to Android's own permission box.
 *  - kind "settings": Android has stopped asking (the member refused twice), so it explains the three taps in the phone's settings.
 * `open` is separate from `kind` so the text does not change while the pop-up slides away.
 */
export function PushPrompt({ open, kind, busy = false, error = null, onTurnOn, onOpenSettings, onLater, onNever }) {
  const settings = kind === "settings";
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onLater()}>
      <DialogContent className="gap-4 sm:max-w-md">
        <PushIllustration />
        <DialogHeader className="text-center sm:text-center">
          <DialogTitle className="font-heading text-2xl font-extrabold">{settings ? "Notifications are off" : "Don't miss what matters"}</DialogTitle>
          <DialogDescription className="text-[15px] leading-relaxed">
            {settings
              ? "You may be missing messages and replies. Android is blocking notifications for UniSphere, so it can't ask again. It only takes three taps:"
              : "Turn on notifications and UniSphere will tell you when something needs you, even when the app is closed."}
          </DialogDescription>
        </DialogHeader>

        {settings ? (
          <ol className="bg-muted space-y-2 rounded-xl p-4 text-sm">
            {STEPS.map((step, i) => (
              <li key={step} className="flex items-center gap-3">
                <span className="bg-primary text-primary-foreground grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold">{i + 1}</span>
                {step}
              </li>
            ))}
          </ol>
        ) : (
          <ul className="space-y-3">
            {BENEFITS.map(([Icon, title, text]) => (
              <li key={title} className="flex items-start gap-3">
                <span className="bg-primary-soft text-primary-text grid size-9 shrink-0 place-items-center rounded-full">
                  <Icon className="size-[18px]" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{title}</span>
                  <span className="text-muted-foreground block text-[13px] leading-snug">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        )}

        <p className="text-muted-foreground flex items-start gap-2 text-xs leading-snug">
          <Lock className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          Message text never appears on your lock screen. You can change this any time in Settings.
        </p>

        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <Button size="lg" className="h-12 w-full text-base" disabled={busy} onClick={settings ? onOpenSettings : onTurnOn}>
            <BellRing aria-hidden="true" /> {busy ? "Turning on…" : settings ? "Open settings" : error ? "Try again" : "Turn on notifications"}
          </Button>
          <Button variant="ghost" className="w-full" disabled={busy} onClick={onLater}>
            Not now
          </Button>
          <button type="button" disabled={busy} onClick={onNever} className="text-muted-foreground hover:text-foreground mx-auto min-h-9 px-2 text-xs underline underline-offset-4">
            Don&apos;t ask me again
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
