"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { WifiOff } from "lucide-react";
import { toast } from "sonner";
import { clearAllDrafts } from "@/lib/client/drafts";

/**
 * Removes anything this device may have kept for the signed-in member (called when they log out). The service
 * worker never stores private pages or API responses, so this is belt and braces: it drops every cache except the
 * public static one, and tells the worker to do the same.
 */
export async function clearUserCaches() {
  clearAllDrafts();
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith("unisphere-static-")).map((k) => caches.delete(k)));
    }
    const reg = await navigator.serviceWorker?.getRegistration();
    reg?.active?.postMessage({ type: "CLEAR_USER_CACHES" });
  } catch {
    /* nothing to clear, or the browser forbids it */
  }
}

/**
 * Registers the service worker (production, or locally with NEXT_PUBLIC_PWA_DEV=true), offers a one-tap
 * update when a new version is waiting, and shows a small banner while the device is offline.
 */
function subscribeOnline(callback) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

export function PwaProvider() {
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const wasOffline = useRef(false);

  // "Back online" is only worth saying when the member actually saw the offline banner.
  useEffect(() => {
    if (!online) wasOffline.current = true;
    else if (wasOffline.current) {
      wasOffline.current = false;
      toast.success("Back online");
    }
  }, [online]);

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
    <div
      role="status"
      className="bg-foreground text-background fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-2 px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 text-center text-[13px] font-semibold"
    >
      <WifiOff className="size-4 shrink-0" aria-hidden="true" />
      You are offline. Posts and messages will not load or send until you reconnect.
    </div>
  );
}
