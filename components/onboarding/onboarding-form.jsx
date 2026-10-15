"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, Check, Loader2, UserPlus, Users } from "lucide-react";
import { m } from "motion/react";
import { toast } from "sonner";
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
import { queueCelebration } from "@/components/motion/celebrate";
import { onboardingSchema } from "@/lib/validators/profile";
import { saveOnboardingAction } from "@/lib/actions/profile";
import { joinCommunityAction } from "@/lib/actions/campus";
import { ACCOUNT_TYPES, HOME_PATH } from "@/lib/constants";
import { EASE } from "@/lib/motion";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: "about", title: "About you", fields: ["fullName", "username", "headline"] },
  { id: "college", title: "Your college", fields: ["collegeId", "departmentId", "programId", "graduationYear", "currentYear", "currentSemester"] },
  { id: "interests", title: "Interests", fields: ["skills", "interests"] },
  { id: "communities", title: "Communities", fields: [] },
];

const SKILL_SUGGESTIONS = ["Python", "JavaScript", "React", "Machine Learning", "Data Analysis", "UI/UX Design", "Embedded Systems", "Java", "SQL", "Node.js"];
const INTEREST_SUGGESTIONS = ["Sustainability", "Healthcare", "Education", "Finance", "Robotics", "Open Source", "Startups", "Climate", "Gaming"];

function CommunityChoice({ community }) {
  const [state, setState] = useState(community.my_status === "active" ? "joined" : community.my_status === "pending" ? "requested" : "idle");
  const [pending, startTransition] = useTransition();
  const canJoin = community.join_policy !== "invite" && community.my_status !== "banned";

  function join() {
    startTransition(async () => {
      const res = await joinCommunityAction(community.id);
      if (res.ok) setState(res.data === "pending" ? "requested" : "joined");
      else toast.error(res.error);
    });
  }

  return (
    <li className="bg-card flex items-center gap-3 rounded-xl border p-3.5">
      <span className="tone-chip tone-teal flex size-10 shrink-0 items-center justify-center rounded-lg">
        <Users className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-heading leading-tight font-bold break-words">{community.name}</p>
        <p className="text-muted-foreground text-xs">
          {Number(community.member_count).toLocaleString()} {Number(community.member_count) === 1 ? "member" : "members"}
        </p>
      </div>
      {state === "joined" ? (
        <span className="text-success-text flex items-center gap-1 text-sm font-bold">
          <Check className="size-4" aria-hidden="true" /> Joined
        </span>
      ) : state === "requested" ? (
        <span className="text-muted-foreground text-sm font-semibold">Requested</span>
      ) : canJoin ? (
        <Button type="button" size="sm" variant="outline" onClick={join} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <UserPlus />} {community.join_policy === "request" ? "Request" : "Join"}
        </Button>
      ) : null}
    </li>
  );
}

export function OnboardingForm({ profile, college = null, structure = null, communities = [] }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState(null);
  const [pickedCollege, setPickedCollege] = useState(college);

  const form = useForm({
    resolver: zodResolver(onboardingSchema),
    mode: "onTouched",
    defaultValues: {
      fullName: profile.full_name ?? "",
      username: profile.username ?? "",
      accountType: profile.account_type ?? null,
      headline: profile.headline ?? "",
      collegeId: profile.college_id ?? null,
      campusId: null,
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

  function skipCollege() {
    setValue("collegeId", null);
    setValue("departmentId", null);
    setValue("programId", null);
    setPickedCollege(null);
    setStep((s) => s + 1);
  }

  function onSubmit(values) {
    setServerError(null);
    startTransition(async () => {
      const res = await saveOnboardingAction(values);
      if (res.ok) {
        queueCelebration("onboarded");
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
    <div className="surface-raised p-5 sm:p-8">
      <div className="bg-sunken mb-5 h-1.5 overflow-hidden rounded-full" aria-hidden="true">
        <m.div
          className="bg-accent-hot h-full origin-left rounded-full"
          initial={false}
          animate={{ scaleX: (step + 1) / STEPS.length }}
          transition={EASE.springSoft}
        />
      </div>
      <p className="sr-only" role="status">
        Step {step + 1} of {STEPS.length}: {STEPS[step].title}
      </p>
      <ol className="mb-8 flex items-center gap-2" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s.id} className="flex flex-1 items-center gap-2" aria-current={i === step ? "step" : undefined}>
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-lg border text-sm font-bold transition-colors",
                i < step && "border-primary bg-primary text-primary-foreground",
                i === step && "border-foreground bg-sun text-foreground shadow-[2px_2px_0_0_var(--hard)]",
                i > step && "text-muted-foreground",
              )}
            >
              {i < step ? <Check className="size-3.5" aria-label="Completed" /> : i + 1}
            </span>
            <span className={cn("hidden text-sm font-medium md:block", i === step ? "text-foreground" : "text-muted-foreground")}>{s.title}</span>
            {i < STEPS.length - 1 && <span aria-hidden="true" className="bg-border h-px flex-1" />}
          </li>
        ))}
      </ol>

      {serverError && <FormAlert className="mb-5">{serverError}</FormAlert>}

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <input type="hidden" {...register("accountType")} />

        <div className={cn("page-enter space-y-4", step !== 0 && "hidden")}>
          <h2 className="text-xl font-bold">Tell us about yourself</h2>
          <Field id="fullName" label="Full name" required error={errors.fullName?.message}>
            <Input id="fullName" autoComplete="name" aria-describedby="fullName-desc" {...register("fullName")} />
          </Field>
          <UsernameField register={register} value={usernameValue} error={errors.username?.message} currentUsername={profile.username} />
          <Field id="headline" label="Headline" optional error={errors.headline?.message} hint="One line, e.g. “3rd year CSE · building with ML”, or whatever describes you.">
            <Input id="headline" maxLength={120} aria-describedby="headline-desc" {...register("headline")} />
          </Field>
          <fieldset className="space-y-2">
            <legend className="text-[13px] font-semibold">
              How would you describe yourself? <span className="text-muted-foreground font-normal">(optional)</span>
            </legend>
            <Controller
              control={control}
              name="accountType"
              render={({ field }) => (
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="How you describe yourself">
                  {[{ value: null, label: "Prefer not to say" }, ...ACCOUNT_TYPES].map((t) => {
                    const selected = (field.value ?? null) === t.value;
                    return (
                      <button
                        key={t.value ?? "none"}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => field.onChange(t.value)}
                        className={cn(
                          "press min-h-10 rounded-lg border px-3.5 text-sm font-semibold transition-colors",
                          selected ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-foreground/50",
                        )}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              )}
            />
            <p className="text-muted-foreground text-xs">Shown on your profile as something you said about yourself, never as a verified fact.</p>
          </fieldset>
        </div>

        <div className={cn("page-enter space-y-4", step !== 1 && "hidden")}>
          <div>
            <h2 className="text-xl font-bold">Connect a college</h2>
            <p className="text-muted-foreground mt-1 text-sm">Optional. It helps you find people and communities near you. You can skip this and add it any time.</p>
          </div>
          <CollegeFields
            control={control}
            register={register}
            setValue={setValue}
            errors={errors}
            accountType={accountType}
            initialCollege={college}
            initialStructure={structure}
            onCollegeChange={setPickedCollege}
          />
        </div>

        <div className={cn("page-enter space-y-5", step !== 2 && "hidden")}>
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
          <div className="bg-sunken flex items-start justify-between gap-4 rounded-xl p-3.5">
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

        <div className={cn("page-enter space-y-4", step !== 3 && "hidden")}>
          <div>
            <h2 className="text-xl font-bold">Find your people</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {communities.length > 0
                ? "Communities are where people with shared interests gather. Join a few now, or browse later."
                : "There are no communities yet. You can start one from the Communities page once you are in."}
            </p>
          </div>
          {communities.length > 0 && (
            <ul className="space-y-2.5" aria-label="Suggested communities">
              {communities.map((c) => (
                <CommunityChoice key={c.id} community={c} />
              ))}
            </ul>
          )}
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <Button type="button" variant="ghost" onClick={() => setStep((s) => Math.max(s - 1, 0))} disabled={step === 0 || pending}>
            <ArrowLeft /> Back
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            {step === 1 && !pickedCollege && (
              <Button type="button" variant="ghost" onClick={skipCollege}>
                Skip for now
              </Button>
            )}
            {last ? (
              <SubmitButton pending={pending} pendingText="Saving…" variant="hot">
                Enter UniSphere <Check />
              </SubmitButton>
            ) : (
              <Button type="button" variant="hot" onClick={next}>
                {step === 1 && !pickedCollege ? "Continue without a college" : "Continue"} <ArrowRight />
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
