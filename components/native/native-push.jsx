"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useIsNativeApp } from "@/hooks/use-native-app";

/**
 * Push in the Android app, for a signed-in member (mounted in the app frame, so it never runs for someone who is signed out).
 * It renders nothing: it keeps this phone's token fresh when notifications are on, opens the right page when one is tapped, and
 * offers to turn notifications on once, a few seconds after the first start. Turning them on and off lives in Settings > Notifications.
 */
export function NativePush({ configured }) {
  const native = useIsNativeApp();
  const router = useRouter();

  useEffect(() => {
    if (!native || !configured) return;
    let timer;
    let cancelled = false;
    (async () => {
      const push = await import("@/lib/native/push");
      push.setNativeNavigator((path) => router.push(path));
      await push.initNativePush();
      if (cancelled || !(await push.shouldOfferNativePush())) return;
      timer = setTimeout(() => {
        push.markNativePushOffered();
        toast("Get notified about messages and replies?", {
          description: "Message text is never shown on your lock screen.",
          duration: 15_000,
          action: {
            label: "Turn on",
            onClick: async () => {
              const result = await push.enableNativePush();
              if (result.ok) toast.success("Notifications are on for this phone.");
              else toast.error(result.error);
            },
          },
        });
      }, 5000);
    })().catch(() => {
      /* the app shell cannot do push: the settings screen says so */
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [native, configured, router]);

  return null;
}
