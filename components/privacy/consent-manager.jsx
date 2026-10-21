"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { setConsentAction } from "@/lib/actions/privacy";

const fmt = (iso) => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(new Date(iso));

/**
 * One switch per optional purpose. Turning one on or off is a single step, the same step either way, and changes nothing
 * else. Every change is saved on the server with the notice version in force, and can be reversed at any time.
 * `purposes` and `consents` are plain data from the server.
 */
export function ConsentManager({ purposes, consents }) {
  const [state, setState] = useState(() => Object.fromEntries(purposes.map((p) => [p.key, consents?.[p.key] ?? null])));
  const [busy, setBusy] = useState(null);
  const [, startTransition] = useTransition();
  const [announce, setAnnounce] = useState("");

  function change(purpose, granted) {
    setBusy(purpose.key);
    startTransition(async () => {
      const res = await setConsentAction({ purpose: purpose.key, granted, source: "settings" });
      setBusy(null);
      if (res.ok) {
        setState((s) => ({ ...s, [purpose.key]: { status: granted ? "granted" : "withdrawn", updated_at: new Date().toISOString(), notice_version: s[purpose.key]?.notice_version } }));
        setAnnounce(`${purpose.label}: ${granted ? "on" : "off"}.`);
        toast.success(`${granted ? "Turned on" : "Turned off"}: ${purpose.label}`);
      } else {
        setAnnounce(res.error);
        toast.error(res.error);
      }
    });
  }

  return (
    <div>
      <ul className="space-y-3">
        {purposes.map((p) => {
          const c = state[p.key];
          const on = c?.status === "granted";
          return (
            <li key={p.key} className="rounded-md border p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <Label htmlFor={`consent-${p.key}`} className="text-sm font-semibold">
                    {p.label}
                  </Label>
                  <p id={`consent-${p.key}-desc`} className="text-muted-foreground mt-1 text-[13px] leading-relaxed">
                    {p.summary}
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">Needed for {p.requiredFor}.</p>
                </div>
                <Switch
                  id={`consent-${p.key}`}
                  checked={on}
                  disabled={busy === p.key}
                  aria-describedby={`consent-${p.key}-desc`}
                  onCheckedChange={(v) => change(p, v)}
                />
              </div>
              <p className="text-muted-foreground mt-2 text-xs">
                {c ? (
                  <>
                    {on ? "On" : c.status === "withdrawn" ? "Turned off" : "Off"} since {fmt(c.updated_at)}.
                  </>
                ) : (
                  "Off. You have not been asked yet, or have chosen not to."
                )}
                {on && <> If you turn it off: {p.withdrawal}</>}
              </p>
            </li>
          );
        })}
      </ul>
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
      <p className="text-muted-foreground mt-3 text-xs">
        None of these is needed to use UniSphere. Read exactly what each one covers in the{" "}
        <Link href="/privacy-notice" className="text-blue-text underline">
          privacy notice
        </Link>
        .
      </p>
    </div>
  );
}
