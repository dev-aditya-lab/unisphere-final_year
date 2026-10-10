"use client";

import { useState } from "react";
import { useClientValue } from "@/hooks/use-client-value";
import { Download, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInstall } from "@/components/pwa/use-install";

const KEY = "unisphere:install-dismissed";
const QUIET_DAYS = 30;

function recentlyDismissed() {
  try {
    const at = Number(localStorage.getItem(KEY));
    return at && Date.now() - at < QUIET_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

/** A slim, dismissible nudge to install the app. It stays quiet for 30 days after "Not now". */
export function InstallBanner() {
  const { installed, canPrompt, needsIosSteps, install } = useInstall();
  const dismissedBefore = useClientValue(() => recentlyDismissed(), true);
  const [dismissedNow, setHidden] = useState(false);
  const hidden = dismissedBefore || dismissedNow;
  const [showSteps, setShowSteps] = useState(false);

  if (hidden || installed || (!canPrompt && !needsIosSteps)) return null;

  function dismiss() {
    try {
      localStorage.setItem(KEY, String(Date.now()));
    } catch {}
    setHidden(true);
  }

  return (
    <div className="bg-card flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 text-[13px]" role="region" aria-label="Install UniSphere">
      <Download className="text-coral-text size-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        <strong>Install UniSphere</strong> <span className="text-muted-foreground">for one-tap access and notifications, like a real app.</span>
        {needsIosSteps && showSteps && (
          <span className="mt-1 block">
            Tap the <Share className="mx-0.5 inline size-3.5 align-text-bottom" aria-label="Share" /> Share button in Safari, then <strong>Add to Home Screen</strong>.
          </span>
        )}
      </p>
      {canPrompt ? (
        <Button size="sm" variant="default" onClick={async () => { if ((await install()) === "accepted") setHidden(true); }}>Install</Button>
      ) : (
        <Button size="sm" variant="secondary" onClick={() => setShowSteps((s) => !s)} aria-expanded={showSteps}>How?</Button>
      )}
      <Button size="icon" variant="ghost" className="size-7" onClick={dismiss} aria-label="Not now">
        <X />
      </Button>
    </div>
  );
}
