"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { setReferralSettingAction } from "@/lib/actions/referrals-admin";

/** One Refer & Earn setting. The server validates the value again (type and range) and writes the audit entry. */
export function SettingRow({ name, label, hint, value }) {
  const kind = typeof value === "boolean" ? "boolean" : typeof value === "number" ? "number" : "text";
  const [v, setV] = useState(value);
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const changed = v !== value;

  function save() {
    setError(null);
    startTransition(async () => {
      let res;
      try {
        res = await setReferralSettingAction({ key: name, value: kind === "number" ? Number(v) : v });
      } catch {
        res = { ok: false, error: "Could not reach the server. Try again." };
      }
      if (res?.ok) {
        toast.success(res.message);
        router.refresh();
      } else setError(res?.fieldErrors ? Object.values(res.fieldErrors)[0] : (res?.error ?? "Something went wrong."));
    });
  }

  return (
    <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 sm:max-w-md">
        <Label htmlFor={`ref-${name}`} className="text-sm font-semibold">{label}</Label>
        <p className="text-muted-foreground text-xs">{hint}</p>
        {error && <p role="alert" className="text-destructive-text mt-1 text-xs">{error}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {kind === "boolean" ? (
          <Switch id={`ref-${name}`} checked={Boolean(v)} onCheckedChange={setV} aria-label={label} />
        ) : (
          <Input id={`ref-${name}`} value={v} onChange={(e) => setV(e.target.value)} inputMode={kind === "number" ? "numeric" : "text"} maxLength={kind === "text" ? 240 : 3} className={kind === "text" ? "w-full min-w-0 sm:w-80" : "w-24"} />
        )}
        <Button size="sm" variant="secondary" disabled={!changed || pending} onClick={save}>{pending ? "Saving…" : "Save"}</Button>
      </div>
    </div>
  );
}
