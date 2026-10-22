"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SubmitButton } from "@/components/forms/submit-button";
import { FormAlert } from "@/components/forms/form-alert";
import { SettingsSection } from "@/components/settings/section";
import { useUnsavedGuard } from "@/hooks/use-unsaved-guard";
import { updateOrbitPrivacyAction } from "@/lib/actions/orbits";

const CHOICES = [
  { key: "showBalance", label: "Show my Orbit Balance on my profile", hint: "Others see the number. You always see your own." },
  { key: "showAchievements", label: "Show my badges and streak", hint: "Your Orbit Badges and Orbit Streak appear on your profile and achievement page." },
  { key: "onLeaderboard", label: "Appear on Orbit leaderboards", hint: "Off removes you from every ranking. You keep earning Orbits and badges." },
  { key: "cardsPublic", label: "Allow Orbit Cards with my name", hint: "Cards you create include your name and a link to your achievements. Off makes them anonymous." },
];

/** The member's Orbits privacy choices; saved on their own, separately from the profile privacy form above. */
export function OrbitsPrivacyForm({ profile }) {
  const [values, setValues] = useState({
    showBalance: profile.orbits_show_balance !== false,
    showAchievements: profile.orbits_show_achievements !== false,
    onLeaderboard: profile.orbits_on_leaderboard !== false,
    cardsPublic: profile.orbits_cards_public !== false,
  });
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();

  useUnsavedGuard(dirty && !pending);

  function save(e) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await updateOrbitPrivacyAction(values);
      if (res.ok) {
        toast.success(res.message);
        setDirty(false);
      } else setError(res.error);
    });
  }

  return (
    <SettingsSection id="orbits" title="Orbits" description="What others can see about your Orbits.">
      <form onSubmit={save} className="space-y-4">
        {error && <FormAlert>{error}</FormAlert>}
      {CHOICES.map((c) => (
        <div key={c.key} className="flex items-start justify-between gap-4 rounded-md border p-3">
          <div>
            <Label htmlFor={`orb-${c.key}`} className="text-sm font-semibold">{c.label}</Label>
            <p className="text-muted-foreground text-xs">{c.hint}</p>
          </div>
          <Switch id={`orb-${c.key}`} checked={values[c.key]} onCheckedChange={(v) => { setValues((p) => ({ ...p, [c.key]: v })); setDirty(true); }} />
        </div>
      ))}
      <div className="flex justify-end">
        <SubmitButton pending={pending} pendingText="Saving…" disabled={!dirty}>Save Orbits privacy</SubmitButton>
      </div>
      </form>
    </SettingsSection>
  );
}
