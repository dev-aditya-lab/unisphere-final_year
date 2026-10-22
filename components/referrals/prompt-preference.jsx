"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { setPromptPreferenceAction } from "@/lib/actions/referrals";

/** "Remind me about Refer & Earn" — the member's own switch for the occasional reminder. Saved on the server, so it holds on every device. */
export function PromptPreference({ initialOptedOut }) {
  const [optedOut, setOptedOut] = useState(Boolean(initialOptedOut));
  const [pending, startTransition] = useTransition();

  function change(on) {
    const next = !on;
    const before = optedOut;
    setOptedOut(next);
    startTransition(async () => {
      const res = await setPromptPreferenceAction({ optedOut: next });
      if (res.ok) toast.success(res.message);
      else {
        setOptedOut(before);
        toast.error(res.error ?? "Could not save that choice.");
      }
    });
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <Label htmlFor="ref-reminders" className="text-sm font-semibold">Reminders about Refer &amp; Earn</Label>
        <p className="text-muted-foreground text-xs">An occasional prompt while you use UniSphere. It never interrupts messages, posting or forms.</p>
      </div>
      <Switch id="ref-reminders" checked={!optedOut} disabled={pending} onCheckedChange={change} aria-label="Show Refer and Earn reminders" />
    </div>
  );
}
