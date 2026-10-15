"use client";

import { ads } from "@/lib/ads";
import { loadAdSense } from "@/components/ads/adsense-loader";

/**
 * "Privacy and ad choices": reopens Google's consent message so a visitor can change a decision. The message itself
 * is created in the AdSense account (Privacy & messaging) and delivered by Google's script; this link only asks for
 * it again. Rendered only when ads are switched on, so there is no dead control while ads are off.
 */
export function PrivacyChoicesLink({ className }) {
  if (!ads.enabled) return null;
  async function open() {
    await loadAdSense();
    const w = window;
    w.googlefc = w.googlefc || {};
    if (typeof w.googlefc.showRevocationMessage === "function") {
      w.googlefc.showRevocationMessage();
    } else {
      w.googlefc.callbackQueue = w.googlefc.callbackQueue || [];
      w.googlefc.callbackQueue.push({ CONSENT_API_READY: () => w.googlefc.showRevocationMessage?.() });
    }
  }
  return (
    <button type="button" onClick={open} className={className}>
      Privacy and ad choices
    </button>
  );
}
