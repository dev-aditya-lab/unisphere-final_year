"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/forms/submit-button";
import { useUnsavedGuard } from "@/hooks/use-unsaved-guard";
import { savePreferencesAction } from "@/lib/actions/notifications";
import { IN_APP_ONLY_CATEGORIES } from "@/lib/notification-text";

export function NotificationPrefsForm({ initial }) {
  const [prefs, setPrefs] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [pending, startTransition] = useTransition();
  const set = (category, key, value) => setPrefs((p) => p.map((x) => (x.value === category ? { ...x, [key]: value } : x)));

  const dirty = JSON.stringify(prefs.map((p) => [p.in_app, p.email, p.push])) !== JSON.stringify(saved.map((p) => [p.in_app, p.email, p.push]));
  useUnsavedGuard(dirty && !pending);

  function save(e) {
    e.preventDefault();
    startTransition(async () => {
      const res = await savePreferencesAction({ prefs: prefs.map((p) => ({ category: p.value, in_app: p.in_app, email: p.email, push: p.push })) });
      if (res.ok) {
        toast.success(res.message);
        setSaved(prefs);
      } else toast.error(res.error);
    });
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Choose where each kind of notification reaches you. <strong className="text-foreground font-semibold">In app</strong> is the bell, <strong className="text-foreground font-semibold">Push</strong> is
        the notification on this phone or browser (turn it on for a device in the section above), and <strong className="text-foreground font-semibold">Email</strong> is off by default for busy
        categories and combined into one digest instead of one per event. Push needs In app to be on.
      </p>
      <div className="surface divide-y">
        <div className="text-muted-foreground hidden grid-cols-[1fr_4.5rem_4.5rem_4.5rem] gap-3 px-4 py-2 text-xs font-semibold sm:grid">
          <span>Category</span><span className="text-center">In app</span><span className="text-center">Push</span><span className="text-center">Email</span>
        </div>
        {prefs.map((p) => (
          <div key={p.value} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-4 py-3 sm:grid-cols-[1fr_4.5rem_4.5rem_4.5rem]">
            <div>
              <p className="text-sm font-semibold">{p.label}</p>
              <p className="text-muted-foreground text-xs">{p.hint}</p>
              {p.value === "moderation" && <p className="text-muted-foreground mt-0.5 text-xs">In-app notices stay on so you never miss a decision or the time to appeal.</p>}
            </div>
            <div className="flex flex-col items-center gap-1">
              <Label htmlFor={`${p.value}-app`} className="text-muted-foreground text-[11px] sm:sr-only">In app</Label>
              <Switch id={`${p.value}-app`} checked={p.in_app} disabled={p.value === "moderation"} onCheckedChange={(v) => set(p.value, "in_app", v)} aria-label={p.value === "moderation" ? `${p.label}: in app, always on` : `${p.label}: in app`} />
            </div>
            {IN_APP_ONLY_CATEGORIES.has(p.value) ? (
              <div className="text-muted-foreground flex flex-col items-center gap-1 text-center text-[11px]">
                <span aria-hidden="true">None</span>
                <span className="sr-only">{p.label}: never sent as a push notification</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1">
                <Label htmlFor={`${p.value}-push`} className="text-muted-foreground text-[11px] sm:sr-only">Push</Label>
                <Switch id={`${p.value}-push`} checked={p.push && p.in_app} disabled={!p.in_app} onCheckedChange={(v) => set(p.value, "push", v)} aria-label={`${p.label}: push notification`} />
              </div>
            )}
            {IN_APP_ONLY_CATEGORIES.has(p.value) ? (
              <div className="text-muted-foreground flex flex-col items-center gap-1 text-center text-[11px]">
                <span aria-hidden="true">None</span>
                <span className="sr-only">{p.label}: never sent by email</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1">
                <Label htmlFor={`${p.value}-email`} className="text-muted-foreground text-[11px] sm:sr-only">Email</Label>
                <Switch id={`${p.value}-email`} checked={p.email} onCheckedChange={(v) => set(p.value, "email", v)} aria-label={`${p.label}: email`} />
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <SubmitButton pending={pending} pendingText="Saving…" disabled={!dirty}>Save preferences</SubmitButton>
      </div>
    </form>
  );
}
