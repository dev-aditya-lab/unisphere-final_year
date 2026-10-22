"use client";

import { useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SubmitButton } from "@/components/forms/submit-button";
import { FormAlert } from "@/components/forms/form-alert";
import { privacySchema } from "@/lib/validators/profile";
import { updatePrivacyAction } from "@/lib/actions/profile";
import { MESSAGE_PERMISSIONS, PROFILE_VISIBILITY } from "@/lib/constants";
import { SettingsSection } from "@/components/settings/section";
import { useUnsavedGuard } from "@/hooks/use-unsaved-guard";
import { cn } from "@/lib/utils";

export function PrivacyForm({ profile }) {
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState(null);
  const {
    control,
    handleSubmit,
    formState: { isDirty },
  } = useForm({
    resolver: zodResolver(privacySchema),
    defaultValues: { visibility: profile.visibility, allowMessagesFrom: profile.allow_messages_from, showClass: profile.show_class, personalizeFeed: profile.personalize_feed !== false },
  });

  const visibility = useWatch({ control, name: "visibility" });
  useUnsavedGuard(isDirty && !pending);

  function onSubmit(values) {
    setServerError(null);
    startTransition(async () => {
      const res = await updatePrivacyAction(values);
      if (res.ok) toast.success(res.message);
      else setServerError(res.error);
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {serverError && <FormAlert>{serverError}</FormAlert>}

      <SettingsSection id="visibility" title="Who can see your profile" description="Posts you publish keep their own visibility setting." meta={PROFILE_VISIBILITY.find((v) => v.value === visibility)?.label} defaultOpen>
        <Controller
          control={control}
          name="visibility"
          render={({ field }) => (
            <RadioGroup value={field.value} onValueChange={field.onChange} className="gap-2" aria-label="Profile visibility">
              {PROFILE_VISIBILITY.map((v) => {
                const unavailable = v.value === "college" && !profile.college_id && field.value !== "college";
                return (
                <Label
                  key={v.value}
                  htmlFor={`vis-${v.value}`}
                  className={cn(
                    "border-input hover:border-primary/50 flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors",
                    field.value === v.value && "border-primary bg-accent ring-primary/30 ring-2",
                    unavailable && "cursor-not-allowed opacity-60",
                  )}
                >
                  <RadioGroupItem id={`vis-${v.value}`} value={v.value} className="mt-0.5" disabled={unavailable} />
                  <span>
                    <span className="block text-sm font-semibold">{v.label}</span>
                    <span className="text-muted-foreground text-xs font-normal">{unavailable ? "Add a college to your profile first." : v.hint}</span>
                  </span>
                </Label>
                );
              })}
            </RadioGroup>
          )}
        />
        {visibility === "private" && (
          <p role="note" className="bg-muted rounded-md p-3 text-sm">
            With &ldquo;Only me&rdquo; nobody else can open your profile, find you in search or see you on teams. You can change this back at any time.
          </p>
        )}
      </SettingsSection>

      <SettingsSection id="messages" title="Messages & class details" description="Who can contact you, and what your profile shows about your studies." defaultOpen>
        <div className="space-y-1.5">
          <Label htmlFor="allowMessagesFrom" className="text-[13px] font-semibold">
            Who can message you
          </Label>
          <Controller
            control={control}
            name="allowMessagesFrom"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="allowMessagesFrom" className="w-full sm:w-72">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MESSAGE_PERMISSIONS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <p className="text-muted-foreground text-xs">People you have blocked can never message you, whatever you choose here.</p>
        </div>
        <div className="flex items-start justify-between gap-4 rounded-md border p-3">
          <div>
            <Label htmlFor="showClass" className="text-sm font-semibold">
              Show my current year & semester
            </Label>
            <p className="text-muted-foreground text-xs">Off by default. Your department and graduation year are separate profile fields.</p>
          </div>
          <Controller control={control} name="showClass" render={({ field }) => <Switch id="showClass" checked={field.value} onCheckedChange={field.onChange} />} />
        </div>
      </SettingsSection>

      <SettingsSection id="feed" title="Feed personalisation" description="How the &ldquo;For you&rdquo; feed is chosen.">
        <p className="text-muted-foreground text-sm">
          The &ldquo;For you&rdquo; feed is ranked by simple rules on UniSphere itself, with no AI model: your interests, who you follow, and what you have liked, saved or commented on. Nothing is shared with anyone.
        </p>
        <div className="flex items-start justify-between gap-4 rounded-md border p-3">
          <div>
            <Label htmlFor="personalizeFeed" className="text-sm font-semibold">
              Personalise my feed
            </Label>
            <p className="text-muted-foreground text-xs">Turn off to see the newest and most substantial posts with a mix of topics, ignoring your interests and activity.</p>
          </div>
          <Controller control={control} name="personalizeFeed" render={({ field }) => <Switch id="personalizeFeed" checked={field.value} onCheckedChange={field.onChange} />} />
        </div>
      </SettingsSection>

      <div className="bg-background/90 sticky bottom-16 z-10 flex items-center justify-end gap-3 rounded-lg border p-3 backdrop-blur lg:bottom-4">
        <p className="text-muted-foreground mr-auto text-xs" aria-live="polite">
          {isDirty ? "You have unsaved changes." : "All changes saved."}
        </p>
        <SubmitButton pending={pending} pendingText="Saving…" disabled={!isDirty}>
          Save privacy settings
        </SubmitButton>
      </div>
    </form>
  );
}
