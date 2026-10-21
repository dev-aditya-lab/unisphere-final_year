"use client";

import { useEffect, useState, useTransition } from "react";
import { useClientValue } from "@/hooks/use-client-value";
import { Download, Smartphone } from "lucide-react";
import { BellRing } from "@/components/icons/lucide-compat";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useInstall } from "@/components/pwa/use-install";
import { sendTestPushAction } from "@/lib/actions/push";

const urlBase64ToUint8Array = (base64) => {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
};

/** True when this subscription was created with UniSphere's key (not, for example, one left by a third-party script). */
function isOurs(sub, key) {
  const k = sub?.options?.applicationServerKey;
  if (!k) return false;
  const a = new Uint8Array(k);
  return a.length === key.length && a.every((v, i) => v === key[i]);
}

async function getRegistration() {
  const existing = await navigator.serviceWorker.getRegistration("/");
  return existing ?? navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then(() => navigator.serviceWorker.ready);
}

/** Install the app and turn on push notifications for this device. */
export function AppSettings({ pushConfigured, vapidPublicKey }) {
  const { installed, canPrompt, needsIosSteps, ios, install } = useInstall();
  const support = useClientValue(() => ("serviceWorker" in navigator && "PushManager" in window && "Notification" in window ? "ready" : "unsupported"), "checking");
  const initialPermission = useClientValue(() => ("Notification" in window ? Notification.permission : "default"), "default");
  const [permissionNow, setPermission] = useState(null);
  const permission = permissionNow ?? initialPermission;
  const [subscribed, setSubscribed] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (support !== "ready") return;
    navigator.serviceWorker.getRegistration("/").then((reg) => reg?.pushManager.getSubscription()).then((sub) => setSubscribed(isOurs(sub, urlBase64ToUint8Array(vapidPublicKey))));
  }, [support, vapidPublicKey]);

  async function enable() {
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result !== "granted") return toast.error("Notifications are blocked. Allow them in your browser's site settings, then try again.");
    try {
      const reg = await getRegistration();
      const key = urlBase64ToUint8Array(vapidPublicKey);
      let sub = await reg.pushManager.getSubscription();
      // A browser holds one push subscription per site. If another sender made it (for example, one left behind by a
      // third-party script), it cannot carry member notifications: replace it with one made with UniSphere's key.
      if (sub && !isOurs(sub, key)) {
        await sub.unsubscribe();
        sub = null;
      }
      sub = sub ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }));
      const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON() }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "failed");
      setSubscribed(true);
      toast.success("Notifications are on for this device.");
    } catch (err) {
      toast.error(err?.message && err.message !== "failed" ? err.message : "Could not turn on notifications on this device.");
    }
  }

  async function disable() {
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    if (sub && isOurs(sub, urlBase64ToUint8Array(vapidPublicKey))) {
      await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
      await sub.unsubscribe();
    }
    setSubscribed(false);
    toast.success("Notifications are off for this device.");
  }

  const pushNeedsInstall = ios && !installed && support === "unsupported";

  return (
    <section className="surface space-y-5 p-5 sm:p-6" aria-labelledby="app-settings-heading">
      <div>
        <h2 id="app-settings-heading" className="text-lg font-bold">UniSphere on this device</h2>
        <p className="text-muted-foreground mt-0.5 text-sm">Install the app for one-tap access, and get notifications even when it is closed.</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <Smartphone className="text-coral-text mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">Install the app</p>
            <p className="text-muted-foreground text-sm">
              {installed ? "UniSphere is installed on this device." : needsIosSteps ? "In Safari, tap Share, then Add to Home Screen." : canPrompt ? "Adds UniSphere to your home screen or desktop." : "Your browser will offer to install UniSphere from its menu when it can."}
            </p>
          </div>
        </div>
        {canPrompt && !installed && <Button variant="outline" size="sm" onClick={() => install()}><Download /> Install</Button>}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
        <div className="flex items-start gap-3">
          <BellRing className="text-coral-text mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">Push notifications</p>
            <p className="text-muted-foreground text-sm">
              {!pushConfigured ? "Push notifications are not set up on this server yet." : pushNeedsInstall ? "On iPhone and iPad, install UniSphere to your home screen first, then come back here." : support === "unsupported" ? "This browser does not support push notifications." : permission === "denied" ? "Blocked in your browser settings for this site." : subscribed ? "On for this device. You choose which kinds of updates arrive in the settings below." : "Get a notification for new messages, replies and other updates. Message text is never shown on your lock screen."}
            </p>
          </div>
        </div>
        {pushConfigured && support === "ready" && permission !== "denied" && (
          <div className="flex gap-2">
            {subscribed ? (
              <>
                <Button variant="outline" size="sm" disabled={pending} onClick={() => startTransition(async () => { const r = await sendTestPushAction(); r.ok ? toast.success("Test sent. It should arrive in a moment.") : toast.error(r.error); })}>Send a test</Button>
                <Button variant="ghost" size="sm" onClick={disable}>Turn off</Button>
              </>
            ) : (
              <Button size="sm" onClick={enable}>Turn on</Button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
