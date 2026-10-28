"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PushPrompt } from "@/components/native/push-prompt";
import { useIsNativeApp } from "@/hooks/use-native-app";
import { isAlreadyThere } from "@/lib/native/foreground";
import { OPEN_LAYER } from "@/lib/native/layers";
import { tapHaptic } from "@/lib/native/haptics";

/**
 * Push in the Android app, for a signed-in member (mounted in the app frame, so it never runs for someone who is signed out).
 *  - keeps this phone's token fresh when notifications are on, and opens the right page when one is tapped;
 *  - offers to turn notifications on with a pop-up (components/native/push-prompt.jsx). When it comes is decided by
 *    lib/native/push-nudge.js: right after the first sign-in, then at most three gentle reminders, never after "Don't ask again";
 *  - if the member was sent to the phone's settings to allow notifications, finishes turning them on when they come back.
 * Turning notifications on and off by hand lives in Settings > Notifications.
 */
const FIRST_DELAY_MS = 4000; // after the page has settled
const RETRY_EVERY_MS = 1500;
const GIVE_UP_AFTER = 20; // tries: if the member is busy for 30 seconds the pop-up waits for the next start

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const typing = () => {
  const el = document.activeElement;
  return Boolean(el) && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
};

/**
 * Waits for a quiet moment: no other sheet or dialog open (the welcome pop-up, say), nobody typing, and the member is not already on the
 * notifications settings, where the switch is right in front of them. False if it never comes.
 */
async function waitForQuietMoment(cancelled) {
  await sleep(FIRST_DELAY_MS);
  for (let tries = 0; tries < GIVE_UP_AFTER; tries += 1) {
    if (cancelled()) return false;
    if (!document.querySelector(OPEN_LAYER) && !typing() && !location.pathname.startsWith("/settings/notifications")) return true;
    await sleep(RETRY_EVERY_MS);
  }
  return false;
}

export function NativePush({ configured }) {
  const native = useIsNativeApp();
  const router = useRouter();
  const pushRef = useRef(null); // lib/native/push, loaded only inside the app
  const [prompt, setPrompt] = useState({ open: false, kind: "ask" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!native || !configured) return;
    let cancelled = false;
    let resume;
    (async () => {
      const push = await import("@/lib/native/push");
      pushRef.current = push;
      push.setNativeNavigator((path) => router.push(path));
      // A push that arrives while the app is open: Android shows nothing by itself then, so show it as a banner.
      // Not when the member is already on the page it is about (a new message in the conversation that is open).
      push.setNativeForegroundHandler(({ title, body, path }) => {
        if (isAlreadyThere(window.location.pathname, path)) return;
        toast(title, { description: body, duration: 7000, action: { label: "Open", onClick: () => router.push(path) } });
      });
      await push.initNativePush();

      // Back from the phone's notification settings: if the member allowed them there, finish turning them on.
      const { App } = await import("@capacitor/app");
      resume = await App.addListener("appStateChange", async ({ isActive }) => {
        if (!isActive || !push.consumeSettingsReturn()) return;
        const state = await push.getNativePushState();
        if (state.permission !== "granted" || state.enabled) return;
        const result = await push.enableNativePush();
        if (result.ok) toast.success("Notifications are on for this phone.");
        else toast.error(result.error);
      });
      if (cancelled) return resume.remove();

      const kind = await push.getNativePushNudge();
      if (!kind || !(await waitForQuietMoment(() => cancelled))) return;
      push.recordNativePushNudge(); // shown counts as shown, however it is closed
      setPrompt({ open: true, kind });
    })().catch(() => {
      /* the app shell cannot do push: the settings screen says so */
    });
    return () => {
      cancelled = true;
      resume?.remove();
    };
  }, [native, configured, router]);

  const close = () => {
    setPrompt((p) => ({ ...p, open: false }));
    setError(null);
  };

  async function turnOn() {
    setBusy(true);
    setError(null);
    const result = await pushRef.current.enableNativePush();
    setBusy(false);
    if (result.ok) {
      close();
      tapHaptic();
      toast.success("Notifications are on for this phone.");
    } else if (result.blocked) {
      close();
      toast("No problem. You can turn notifications on any time in Settings, then Notifications.");
    } else {
      setError(result.error); // a connection problem: stay open so they can try again
    }
  }

  async function openSettings() {
    setError(null);
    if (await pushRef.current.openNativeNotificationSettings()) close();
    else setError("Could not open your phone's settings. Open Settings, then Apps, then UniSphere, then Notifications.");
  }

  function never() {
    pushRef.current.recordNativePushNudge({ never: true });
    close();
    toast("OK, we won't ask again. You can turn notifications on any time in Settings, then Notifications.");
  }

  if (!native || !configured) return null;
  return <PushPrompt open={prompt.open} kind={prompt.kind} busy={busy} error={error} onTurnOn={turnOn} onOpenSettings={openSettings} onLater={close} onNever={never} />;
}
