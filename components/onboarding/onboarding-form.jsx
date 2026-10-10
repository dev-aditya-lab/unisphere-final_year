"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/forms/field";
import { FormAlert } from "@/components/forms/form-alert";
import { SubmitButton } from "@/components/forms/submit-button";
import { TagInput } from "@/components/forms/tag-input";
import { UsernameField } from "@/components/forms/username-field";
import { CollegeFields } from "@/components/profile/college-fields";
import { onboardingSchema } from "@/lib/validators/profile";
import { saveOnboardingAction } from "@/lib/actions/profile";
import { ACCOUNT_TYPES, HOME_PATH } from "@/lib/constants";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: "about", title: "About you", fields: ["fullName", "username", "headline"] },
  { id: "campus", title: "Your campus", fields: ["collegeId", "departmentId", "programId", "graduationYear", "currentYear", "currentSemester"] },
  { id: "skills", title: "Skills & interests", fields: ["skills", "interests"] },
];

const SKILL_SUGGESTIONS = ["Python", "JavaScript", "React", "Machine Learning", "Data Analysis", "UI/UX Design", "Embedded Systems", "Java", "SQL", "Node.js"];
const INTEREST_SUGGESTIONS = ["Sustainability", "Healthcare", "Education", "Finance", "Robotics", "Open Source", "Startups", "Climate", "Gaming"];

export function OnboardingForm({ profile, colleges }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState(null);

  const form = useForm({
    resolver: zodResolver(onboardingSchema),
    mode: "onTouched",
    defaultValues: {
      fullName: profile.full_name ?? "",
      username: profile.username ?? "",
      accountType: profile.account_type,
      headline: profile.headline ?? "",
      collegeId: profile.college_id ?? undefined,
      departmentId: profile.department_id ?? null,
      programId: profile.program_id ?? null,
      graduationYear: profile.graduation_year ?? "",
      currentYear: "",
      currentSemester: "",
      skills: profile.skills ?? [],
      interests: profile.interests ?? [],
      openToCollaboration: profile.open_to_collaboration ?? false,
    },
  });
  const { register, control, handleSubmit, setValue, setError, trigger, formState: { errors } } = form;
  const accountType = useWatch({ control, name: "accountType" });
  const usernameValue = useWatch({ control, name: "username" });

  async function next() {
    const ok = await trigger(STEPS[step].fields);
    if (ok) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function onSubmit(values) {
    setServerError(null);
    startTransition(async () => {
      const res = await saveOnboardingAction(values);
      if (res.ok) {
        router.replace(HOME_PATH);
        router.refresh();
        return;
      }
      setServerError(res.error);
      if (res.fieldErrors) {
        for (const [field, message] of Object.entries(res.fieldErrors)) setError(field, { message });
        const idx = STEPS.findIndex((s) => s.fields.some((f) => res.fieldErrors[f]));
        if (idx >= 0) setStep(idx);
      }
    });
  }

  const last = step === STEPS.length - 1;

  return (
    <div className="surface p-6 sm:p-8">
      <ol className="mb-8 flex items-center gap-2" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s.id} className="flex flex-1 items-center gap-2" aria-current={i === step ? "step" : undefined}>
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                i < step && "border-primary bg-primary text-primary-foreground",
                i === step && "border-primary text-primary",
                i > step && "text-muted-foreground",
              )}
            >
              {i < step ? <Check className="size-3.5" aria-label="Completed" /> : i + 1}
            </span>
            <span className={cn("hidden text-sm font-medium sm:block", i === step ? "text-foreground" : "text-muted-foreground")}>{s.title}</span>
            {i < STEPS.length - 1 && <span aria-hidden="true" className="bg-border h-px flex-1" />}
          </li>
        ))}
      </ol>

      {serverError && <FormAlert className="mb-5">{serverError}</FormAlert>}

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <input type="hidden" {...register("accountType")} />

        <div className={cn("space-y-4", step !== 0 && "hidden")}>
          <h2 className="text-xl font-bold">Tell us about yourself</h2>
          <Field id="fullName" label="Full name" required error={errors.fullName?.message}>
            <Input id="fullName" autoComplete="name" aria-describedby="fullName-desc" {...register("fullName")} />
          </Field>
          <UsernameField register={register} value={usernameValue} error={errors.username?.message} currentUsername={profile.username} />
          <Field id="headline" label="Headline" optional error={errors.headline?.message} hint="One line, e.g. “3rd year CSE · building with ML”.">
            <Input id="headline" maxLength={120} aria-describedby="headline-desc" {...register("headline")} />
          </Field>
          <p className="text-muted-foreground text-sm">
            Account type: <strong className="text-foreground">{ACCOUNT_TYPES.find((t) => t.value === accountType)?.label}</strong>. You can change it later in settings.
          </p>
        </div>

        <div className={cn("space-y-4", step !== 1 && "hidden")}>
          <h2 className="text-xl font-bold">Where do you study or work?</h2>
          <CollegeFields control={control} register={register} setValue={setValue} errors={errors} colleges={colleges} accountType={accountType} />
        </div>

        <div className={cn("space-y-5", step !== 2 && "hidden")}>
          <h2 className="text-xl font-bold">What are you good at and curious about?</h2>
          <Field id="skills" label="Skills" optional error={errors.skills?.message} hint="Press Enter after each one. Matches are based only on what you list.">
            <Controller
              control={control}
              name="skills"
              render={({ field }) => <TagInput id="skills" label="Skills" value={field.value} onChange={field.onChange} suggestions={SKILL_SUGGESTIONS} placeholder="e.g. Python, Figma" />}
            />
          </Field>
          <Field id="interests" label="Interests" optional error={errors.interests?.message}>
            <Controller
              control={control}
              name="interests"
              render={({ field }) => <TagInput id="interests" label="Interests" value={field.value} onChange={field.onChange} suggestions={INTEREST_SUGGESTIONS} placeholder="e.g. Sustainability" />}
            />
          </Field>
          <div className="flex items-start justify-between gap-4 rounded-md border p-3">
            <div>
              <Label htmlFor="openToCollaboration" className="text-sm font-semibold">
                Open to collaboration
              </Label>
              <p className="text-muted-foreground text-xs">Lets project owners find you when they need your skills. You can turn this off any time.</p>
            </div>
            <Controller
              control={control}
              name="openToCollaboration"
              render={({ field }) => <Switch id="openToCollaboration" checked={field.value} onCheckedChange={field.onChange} />}
            />
          </div>
        </div>

        <div className="mt-8 flex items-center justify-between">
          <Button type="button" variant="ghost" onClick={() => setStep((s) => Math.max(s - 1, 0))} disabled={step === 0 || pending}>
            <ArrowLeft /> Back
          </Button>
          {last ? (
            <SubmitButton pending={pending} pendingText="Saving…">
              Finish setup <Check />
            </SubmitButton>
          ) : (
            <Button type="button" onClick={next}>
              Continue <ArrowRight />
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
