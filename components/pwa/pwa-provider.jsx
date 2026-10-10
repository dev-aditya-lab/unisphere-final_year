"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { toast } from "sonner";

/**
 * Registers the service worker (production, or locally with NEXT_PUBLIC_PWA_DEV=true), offers a one-tap
 * update when a new version is waiting, and shows a small banner while the device is offline.
 */
export function PwaProvider() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_PWA_DEV !== "true") return;

    let reloading = false;
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    function promptUpdate(worker) {
      toast("A new version of UniSphere is ready", {
        duration: Infinity,
        action: { label: "Reload", onClick: () => worker.postMessage({ type: "SKIP_WAITING" }) },
      });
    }

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((reg) => {
        if (reg.waiting && navigator.serviceWorker.controller) promptUpdate(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const worker = reg.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) promptUpdate(worker);
          });
        });
        // Check for a newer version whenever the app comes back to the foreground.
        const check = () => document.visibilityState === "visible" && reg.update().catch(() => {});
        document.addEventListener("visibilitychange", check);
      })
      .catch(() => {});

    return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, []);

  if (online) return null;
  return (
    <div role="status" className="bg-foreground text-background fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-2 px-4 py-1.5 text-center text-[13px] font-medium">
      <WifiOff className="size-3.5 shrink-0" aria-hidden="true" />
      You are offline. Some things will not load or send until you reconnect.
    </div>
  );
}
