"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gift } from "@/components/icons/lucide-compat";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ReferralIllustration } from "@/components/referrals/referral-illustration";
import { recordPromptEventAction } from "@/lib/actions/referrals";
import { PROMPT_DELAY_MS, PROMPT_GIVE_UP_MS, PROMPT_RECHECK_MS, PROMPT_SESSION_KEY, canShowPromptNow, isTypingTarget } from "@/lib/referrals/prompt-policy";
import { REFERRAL_REWARD } from "@/lib/referrals/core";

const OTHER_DIALOG = '[role="dialog"], [role="alertdialog"], [aria-modal="true"]';

function readSession() {
  try {
    return sessionStorage.getItem(PROMPT_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}
function markSession() {
  try {
    sessionStorage.setItem(PROMPT_SESSION_KEY, "1");
  } catch {
    /* private mode: the server cooldown still holds */
  }
}

/**
 * The occasional Refer & Earn reminder. It is only mounted when the SERVER says one is due (frequency, dismissal limit and
 * opt-out all live in the database, so they hold across devices and re-renders). In the browser it then waits for a quiet
 * moment: the page has been open a while, the tab is visible, nothing else is open, the member is not typing, and the route
 * is not a place where an interruption would hurt (messages, forms, settings). When it shows, the server counts it and starts
 * the cooldown; if the server says another tab or device already showed it, nothing appears. One attempt per browser session.
 */
export function ReferralPrompt() {
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  const handled = useRef(false);
  const acted = useRef(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (handled.current || readSession()) return;
    const started = Date.now();
    let timer;

    const attempt = async () => {
      if (handled.current) return;
      if (Date.now() - started > PROMPT_GIVE_UP_MS) return;
      const quiet = canShowPromptNow({
        pathname: pathRef.current,
        visible: document.visibilityState === "visible",
        modalOpen: Boolean(document.querySelector(OTHER_DIALOG)),
        typing: isTypingTarget(document.activeElement),
        sessionShown: readSession(),
      });
      if (!quiet) {
        timer = setTimeout(attempt, PROMPT_RECHECK_MS);
        return;
      }
      handled.current = true;
      markSession();
      try {
        const res = await recordPromptEventAction({ event: "shown" });
        if (res?.ok && res.counted) setOpen(true);
      } catch {
        /* offline or rate limited: show nothing */
      }
    };
    timer = setTimeout(attempt, PROMPT_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  function report(event) {
    if (acted.current) return;
    acted.current = true;
    recordPromptEventAction({ event }).catch(() => {});
  }

  function onOpenChange(next) {
    setOpen(next);
    // closing with the X, Escape or a tap outside is a dismissal
    if (!next) report("dismissed");
  }

  if (!open) return null;
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-md" data-testid="referral-prompt">
        <ReferralIllustration className="max-h-44 w-full object-cover" decorative />
        <div className="space-y-4 p-5 pt-1 sm:p-6 sm:pt-1">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-center gap-2 sm:justify-start">
              <Gift className="text-primary-text size-5" aria-hidden="true" /> Invite friends. Earn {REFERRAL_REWARD} Orbits.
            </DialogTitle>
            <DialogDescription>
              Share your invite link. When a friend joins and becomes an active member, you earn {REFERRAL_REWARD} Orbits. Orbits are recognition for taking part, not money.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:flex-col sm:space-x-0">
            <Button asChild className="w-full" onClick={() => { acted.current = true; setOpen(false); }}>
              <Link href="/referrals">Get my invite link</Link>
            </Button>
            <div className="flex w-full gap-2">
              <Button type="button" variant="ghost" className="flex-1" onClick={() => onOpenChange(false)}>Maybe later</Button>
              <Button type="button" variant="ghost" className="text-muted-foreground flex-1" onClick={() => { report("opt_out"); setOpen(false); }}>Don&rsquo;t show again</Button>
            </div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
