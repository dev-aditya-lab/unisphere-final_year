"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";
import { clearAllDrafts } from "@/lib/client/drafts";

/**
 * The privacy control that really exists for a visitor or member on this device: remove what UniSphere keeps in this
 * browser (appearance, drafts, small interface memories, offline files).
 * It does not sign anyone out (the sign-in cookie is untouched: use Log out for that) and it changes nothing on the
 * server. There is no analytics or tracking to opt out of, so there is no switch for it.
 */
export function DeviceDataControl() {
  const { setTheme } = useTheme();
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  async function clear() {
    setBusy(true);
    let removed = 0;
    try {
      clearAllDrafts();
      for (const store of [window.localStorage, window.sessionStorage]) {
        const keys = [];
        for (let i = 0; i < store.length; i++) {
          const k = store.key(i);
          if (k && (k.startsWith("unisphere:") || k === "unisphere-theme")) keys.push(k);
        }
        keys.forEach((k) => store.removeItem(k));
        removed += keys.length;
      }
      if ("caches" in window) {
        const names = (await caches.keys()).filter((n) => n.startsWith("unisphere-"));
        await Promise.all(names.map((n) => caches.delete(n)));
        removed += names.length;
      }
      setTheme("system"); // back to matching the device
      setResult(`Done. Removed ${removed} item${removed === 1 ? "" : "s"} stored by UniSphere on this device, and appearance now matches your device.`);
    } catch {
      setResult("Your browser did not allow this. You can clear site data for UniSphere in its settings instead.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="device-controls" className="surface mt-10 p-5 sm:p-6">
      <h2 id="device-controls" className="font-heading text-xl font-extrabold">
        Your controls on this device
      </h2>
      <p className="text-muted-foreground mt-2 text-[15px] leading-relaxed">
        UniSphere has no analytics or tracking cookies, so there is nothing to switch off. You can remove everything it keeps in this browser, apart from your
        sign-in (use Log out to end a session).
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" onClick={clear} disabled={busy}>
          <Trash2 /> Clear data stored on this device
        </Button>
      </div>
      {result && (
        <p role="status" className="mt-3 text-sm">
          {result}
        </p>
      )}
    </section>
  );
}
