// A tiny physical "tick" on phones that support it (Android Chrome and installed apps). It confirms that a press or a
// long-press registered when the finger covers the control. A no-op everywhere else (desktop, iOS Safari) and for
// members who asked their device for less motion.

export function haptic(ms = 10) {
  try {
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    navigator.vibrate(ms);
  } catch {
    // Not supported or blocked: nothing to do.
  }
}
