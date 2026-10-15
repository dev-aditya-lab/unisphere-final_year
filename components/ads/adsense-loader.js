"use client";

import { ads } from "@/lib/ads";

let pending = null;

/**
 * Loads Google's AdSense script once per page lifetime, however many ad slots or links ask for it, and never when
 * ads are not configured. Resolves to true when the script is available.
 */
export function loadAdSense() {
  if (!ads.enabled || typeof document === "undefined") return Promise.resolve(false);
  if (pending) return pending;
  if (document.querySelector("script[data-unisphere-adsense]")) {
    pending = Promise.resolve(true);
    return pending;
  }
  pending = new Promise((resolve) => {
    const s = document.createElement("script");
    s.async = true;
    s.crossOrigin = "anonymous";
    s.dataset.unisphereAdsense = "true";
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(ads.clientId)}`;
    s.onload = () => resolve(true);
    s.onerror = () => {
      pending = null; // an ad blocker or a network failure: the page is unaffected, and a later slot may retry
      resolve(false);
    };
    document.head.appendChild(s);
  });
  return pending;
}
