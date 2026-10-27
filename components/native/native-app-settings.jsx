"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BellRing } from "@/components/icons/lucide-compat";
import { sendTestPushAction } from "@/lib/actions/push";
import { disableNativePush, enableNativePush, getNativePushState, openNativeNotificationSettings, silenceNativePushNudges } from "@/lib/native/push";

// checking | error | unsupported | blocked | off | on
const statusOf = (state) => (state.failed ? "error" : !state.supported ? "unsupported" : state.permission === "denied" ? "blocked" : state.enabled ? "on" : "off");

/** The notifications switch as the Android app shows it (the website's version is in components/settings/app-settings.jsx). */
export function NativeAppSettings({ configured }) {
  const [status, setStatus] = useState("checking");
  const [busy, setBusy] = useState(false);
  const [testing, startTest] = useTransition();

  const refresh = useCallback(async () => setStatus(statusOf(await getNativePushState())), []);

  useEffect(() => {
    // Reading the phone's permission is asynchronous, so the first answer arrives from a promise.
    let current = true;
    getNativePushState().then((state) => current && setStatus(statusOf(state)));
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    // Back from the phone's notification settings: show what the member chose there.
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  async function turnOn() {
    setBusy(true);
    const result = await enableNativePush();
    setBusy(false);
    await refresh();
    if (result.ok) toast.success("Notifications are on for this phone.");
    else toast.error(result.error);
  }

  async function turnOff() {
    setBusy(true);
    await disableNativePush();
    silenceNativePushNudges(); // a decision, not an oversight: the "turn on notifications" pop-up stays away
    setBusy(false);
    await refresh();
    toast.success("Notifications are off for this phone.");
  }

  const message = !configured
    ? "Push notifications are not set up on this server yet."
    : {
        checking: "Checking…",
        error: "Could not read this phone's notification settings. Check your connection and try again.",
        unsupported: "This phone cannot receive push notifications.",
        blocked: "Blocked in your phone's settings. Open them below, switch notifications on for UniSphere, then come back.",
        on: "On for this phone. You choose which kinds of updates arrive in the settings below, and the phone's own settings can silence messages, replies or events separately.",
        off: "Get a notification for new messages, replies and other updates, even when the app is closed. Message text is never shown on your lock screen.",
      }[status];

  return (
    <section className="surface space-y-5 p-5 sm:p-6" aria-labelledby="app-settings-heading">
      <div>
        <h2 id="app-settings-heading" className="text-lg font-bold">Notifications on this phone</h2>
        <p className="text-muted-foreground mt-0.5 text-sm">UniSphere can tell you when something needs you, even when the app is closed.</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <BellRing className="text-coral-text mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">Push notifications</p>
            <p className="text-muted-foreground text-sm" role="status">{message}</p>
          </div>
        </div>
        {configured && status === "error" && <Button size="sm" variant="outline" onClick={() => { setStatus("checking"); refresh(); }}>Try again</Button>}
        {configured && status === "blocked" && <Button size="sm" onClick={() => openNativeNotificationSettings()}>Open settings</Button>}
        {configured && status === "off" && <Button size="sm" disabled={busy} onClick={turnOn}>{busy ? "Turning on…" : "Turn on"}</Button>}
        {configured && status === "on" && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={testing || busy}
              onClick={() => startTest(async () => { const r = await sendTestPushAction(); r.ok ? toast.success("Test sent. It should arrive in a moment.") : toast.error(r.error); })}
            >
              Send a test
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={turnOff}>Turn off</Button>
          </div>
        )}
      </div>
    </section>
  );
}
