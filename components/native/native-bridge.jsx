"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useIsNativeApp } from "@/hooks/use-native-app";
import { OPEN_LAYER } from "@/lib/native/layers";
import { MOBILE_BOTTOM_HREFS } from "@/lib/nav";
import { safeNext } from "@/lib/safe-redirect";

/**
 * What the Android app needs from every page (docs/ANDROID_APP.md). It renders nothing, and does nothing on the website: the
 * Capacitor plugins are imported only inside the app.
 *  - Back button: close an open sheet, dialog or menu first; then go back a page; on a top-level screen, move the app to the
 *    background instead of leaving a history of pages behind.
 *  - Links: a UniSphere link opened from anywhere (a message, an email, an invite) arrives as an Android App Link and is opened
 *    in the app, on its page, whether the app was running or not.
 *  - Status bar: its icons follow the app's own light or dark theme, not only the phone's.
 */
const TOP_LEVEL = new Set(["/", "/login", "/notifications", ...MOBILE_BOTTOM_HREFS]);
const LAUNCH_HANDLED = "unisphere:launch-url-handled";

/** The page a link points to, if it is on this site; otherwise null. */
function pathOnThisSite(url) {
  try {
    const link = new URL(url);
    if (link.host !== window.location.host) return null;
    return safeNext(link.pathname + link.search + link.hash, null);
  } catch {
    return null;
  }
}

export function NativeBridge() {
  const native = useIsNativeApp();
  const router = useRouter();
  const pathname = usePathname();
  // The listeners are installed once; they read the current page from here rather than being reinstalled on every navigation.
  const pathRef = useRef(pathname);
  useEffect(() => {
    pathRef.current = pathname;
  });

  useEffect(() => {
    if (!native) return;
    let cancelled = false;
    const cleanups = [];
    const keep = (remove) => (cancelled ? remove() : cleanups.push(remove));

    (async () => {
      const { App } = await import("@capacitor/app");

      const back = await App.addListener("backButton", ({ canGoBack }) => {
        if (document.querySelector(OPEN_LAYER)) {
          // Radix closes sheets, dialogs and menus on Escape.
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
        } else if (canGoBack && !TOP_LEVEL.has(pathRef.current)) {
          window.history.back();
        } else {
          App.minimizeApp().catch(() => {});
        }
      });
      keep(() => back.remove());

      const links = await App.addListener("appUrlOpen", ({ url }) => {
        const path = pathOnThisSite(url);
        if (path) router.push(path);
      });
      keep(() => links.remove());

      // The link the app was started with. Handled once per run of the app: a full page reload (after signing in, say) must not
      // send the member back to it again.
      try {
        if (!sessionStorage.getItem(LAUNCH_HANDLED)) {
          sessionStorage.setItem(LAUNCH_HANDLED, "1");
          const launch = await App.getLaunchUrl();
          const path = launch?.url ? pathOnThisSite(launch.url) : null;
          if (path && path !== window.location.pathname + window.location.search) router.push(path);
        }
      } catch {
        /* storage is blocked: the member simply lands on the feed */
      }

      const { SystemBars, SystemBarsStyle } = await import("@capacitor/core");
      const paint = () => {
        const dark = document.documentElement.classList.contains("dark");
        SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {});
      };
      paint();
      const watcher = new MutationObserver(paint);
      watcher.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      keep(() => watcher.disconnect());
    })().catch(() => {
      /* the app shell is older than this page expects: the website still works as a website */
    });

    return () => {
      cancelled = true;
      cleanups.forEach((remove) => remove());
    };
  }, [native, router]);

  return null;
}
