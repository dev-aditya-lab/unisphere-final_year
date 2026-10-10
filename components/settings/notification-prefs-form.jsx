"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/forms/submit-button";
import { savePreferencesAction } from "@/lib/actions/notifications";

export function NotificationPrefsForm({ initial }) {
  const [prefs, setPrefs] = useState(initial);
  const [pending, startTransition] = useTransition();
  const set = (category, key, value) => setPrefs((p) => p.map((x) => (x.value === category ? { ...x, [key]: value } : x)));

  function save(e) {
    e.preventDefault();
    startTransition(async () => {
      const res = await savePreferencesAction({ prefs: prefs.map((p) => ({ category: p.value, in_app: p.in_app, email: p.email })) });
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
    });
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Choose where each kind of notification reaches you. Email is off by default for busy categories, and emails are combined into one digest instead of one per event.
      </p>
      <div className="surface divide-y">
        <div className="text-muted-foreground hidden grid-cols-[1fr_5rem_5rem] gap-3 px-4 py-2 text-xs font-semibold sm:grid">
          <span>Category</span><span className="text-center">In app</span><span className="text-center">Email</span>
        </div>
        {prefs.map((p) => (
          <div key={p.value} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-3 sm:grid-cols-[1fr_5rem_5rem]">
            <div>
              <p className="text-sm font-semibold">{p.label}</p>
              <p className="text-muted-foreground text-xs">{p.hint}</p>
            </div>
            <div className="flex flex-col items-center gap-1">
              <Label htmlFor={`${p.value}-app`} className="text-muted-foreground text-[11px] sm:sr-only">In app</Label>
              <Switch id={`${p.value}-app`} checked={p.in_app} onCheckedChange={(v) => set(p.value, "in_app", v)} aria-label={`${p.label}: in app`} />
            </div>
            <div className="flex flex-col items-center gap-1">
              <Label htmlFor={`${p.value}-email`} className="text-muted-foreground text-[11px] sm:sr-only">Email</Label>
              <Switch id={`${p.value}-email`} checked={p.email} onCheckedChange={(v) => set(p.value, "email", v)} aria-label={`${p.label}: email`} />
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <SubmitButton pending={pending} pendingText="Saving…">Save preferences</SubmitButton>
      </div>
    </form>
  );
}
