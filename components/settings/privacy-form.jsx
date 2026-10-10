"use client";

import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
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
    defaultValues: { visibility: profile.visibility, allowMessagesFrom: profile.allow_messages_from, showClass: profile.show_class, aiAssistEnabled: profile.ai_assist_enabled },
  });

  function onSubmit(values) {
    setServerError(null);
    startTransition(async () => {
      const res = await updatePrivacyAction(values);
      if (res.ok) toast.success(res.message);
      else setServerError(res.error);
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {serverError && <FormAlert>{serverError}</FormAlert>}

      <section className="surface p-5 sm:p-6">
        <h2 className="text-lg font-bold">Who can see your profile</h2>
        <p className="text-muted-foreground mt-0.5 text-sm">Public posts you publish keep their own visibility setting.</p>
        <Controller
          control={control}
          name="visibility"
          render={({ field }) => (
            <RadioGroup value={field.value} onValueChange={field.onChange} className="mt-4 gap-2" aria-label="Profile visibility">
              {PROFILE_VISIBILITY.map((v) => (
                <Label
                  key={v.value}
                  htmlFor={`vis-${v.value}`}
                  className={cn(
                    "border-input hover:border-primary/50 flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors",
                    field.value === v.value && "border-primary bg-accent ring-primary/30 ring-2",
                  )}
                >
                  <RadioGroupItem id={`vis-${v.value}`} value={v.value} className="mt-0.5" />
                  <span>
                    <span className="block text-sm font-semibold">{v.label}</span>
                    <span className="text-muted-foreground text-xs font-normal">{v.hint}</span>
                  </span>
                </Label>
              ))}
            </RadioGroup>
          )}
        />
      </section>

      <section className="surface space-y-4 p-5 sm:p-6">
        <h2 className="text-lg font-bold">Messages & class details</h2>
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
      </section>

      <section className="surface p-5 sm:p-6">
        <h2 className="text-lg font-bold">AI assist</h2>
        <p className="text-muted-foreground mt-0.5 text-sm">
          AI features (writing help, related-work search, explanations) send the text you ask about to an AI provider. Posts and messages are never sent unless you press an AI button.
        </p>
        <div className="mt-4 flex items-start justify-between gap-4 rounded-md border p-3">
          <div>
            <Label htmlFor="aiAssistEnabled" className="text-sm font-semibold">
              Allow AI assist
            </Label>
            <p className="text-muted-foreground text-xs">Turn off to hide every AI button and make sure none of your text is ever sent to an AI provider.</p>
          </div>
          <Controller control={control} name="aiAssistEnabled" render={({ field }) => <Switch id="aiAssistEnabled" checked={field.value} onCheckedChange={field.onChange} />} />
        </div>
      </section>

      <div className="flex justify-end">
        <SubmitButton pending={pending} pendingText="Saving…" disabled={!isDirty}>
          Save privacy settings
        </SubmitButton>
      </div>
    </form>
  );
}
