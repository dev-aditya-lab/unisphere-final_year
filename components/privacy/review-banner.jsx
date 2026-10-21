"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { ShieldCheck } from "@/components/icons/lucide-compat";

/**
 * A slim, dismissible line shown above the page content, only when there is something to ask or tell:
 *   soft    this account has no recorded privacy choices yet (nothing is blocked)
 *   updated a newer privacy notice exists (nothing needs a new answer)
 * Dismissal is remembered for this browser tab (soft) or for this notice version (updated). Storage may be unavailable;
 * the banner then simply shows again, which is harmless.
 */
function readFlag(kind, key) {
  try {
    return (kind === "soft" ? window.sessionStorage : window.localStorage).getItem(key) === "1";
  } catch {
    return false; // storage unavailable: show the banner, which is harmless
  }
}
const subscribe = (notify) => {
  window.addEventListener("storage", notify);
  return () => window.removeEventListener("storage", notify);
};

export function ReviewBanner({ kind, version }) {
  const key = kind === "soft" ? "unisphere:privacy-review-dismissed" : `unisphere:privacy-notice-seen:${version}`;
  // On the server the banner is hidden, so the page never flashes it at someone who already dismissed it.
  const stored = useSyncExternalStore(subscribe, () => readFlag(kind, key), () => true);
  const [dismissed, setDismissed] = useState(false);
  if (stored || dismissed) return null;
  function dismiss() {
    try {
      (kind === "soft" ? window.sessionStorage : window.localStorage).setItem(key, "1");
    } catch {
      /* storage unavailable: hide for now only */
    }
    setDismissed(true);
  }

  return (
    <aside aria-label="Privacy" className="bg-info-soft text-info-text border-info/40 mb-5 flex items-start gap-3 rounded-xl border px-3.5 py-2.5 text-[13px]">
      <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        {kind === "soft" ? (
          <>
            UniSphere now records your privacy choices. <Link href="/privacy-review" className="font-semibold underline">Review them</Link>: it takes a minute and nothing optional is switched on for you.
          </>
        ) : (
          <>
            The privacy notice was updated. Your choices have not changed. <Link href="/privacy-notice" className="font-semibold underline">See what changed</Link>.
          </>
        )}
      </p>
      <button type="button" onClick={dismiss} aria-label="Dismiss" className="hover:bg-info/10 -m-1 rounded-md p-1">
        <X className="size-4" aria-hidden="true" />
      </button>
    </aside>
  );
}
