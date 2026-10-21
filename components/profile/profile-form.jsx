"use client";

import { useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "@/components/forms/field";
import { FormAlert } from "@/components/forms/form-alert";
import { SubmitButton } from "@/components/forms/submit-button";
import { TagInput } from "@/components/forms/tag-input";
import { UsernameField } from "@/components/forms/username-field";
import { EducationEditor } from "@/components/profile/education-editor";
import { profileSchema } from "@/lib/validators/profile";
import { updateProfileAction } from "@/lib/actions/profile";
import { AVAILABILITY, COLLABORATION_ROLES } from "@/lib/constants";

function Section({ id, title, description, children }) {
  return (
    <section id={id} className="surface scroll-mt-24 p-5 sm:p-6">
      <h2 className="text-lg font-bold">{title}</h2>
      {description && <p className="text-muted-foreground mt-0.5 text-sm">{description}</p>}
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

function SwitchRow({ id, label, description, control, name }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border p-3">
      <div>
        <Label htmlFor={id} className="text-sm font-semibold">
          {label}
        </Label>
        <p className="text-muted-foreground text-xs">{description}</p>
      </div>
      <Controller control={control} name={name} render={({ field }) => <Switch id={id} checked={field.value} onCheckedChange={field.onChange} />} />
    </div>
  );
}

export function ProfileForm({ profile, classInfo, education = [], structures = {} }) {
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState(null);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    setError,
    formState: { errors, isDirty },
  } = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      fullName: profile.full_name,
      username: profile.username,
      headline: profile.headline ?? "",
      bio: profile.bio ?? "",
      education: education.map((e) => ({
        collegeId: e.collegeId,
        role: e.role,
        departmentId: e.departmentId,
        programId: e.programId,
        startYear: e.startYear ?? "",
        endYear: e.endYear ?? "",
        isPrimary: e.isPrimary,
      })),
      currentYear: classInfo?.current_year ?? "",
      currentSemester: classInfo?.current_semester ?? "",
      skills: profile.skills ?? [],
      interests: profile.interests ?? [],
      githubUrl: profile.github_url ?? "",
      portfolioUrl: profile.portfolio_url ?? "",
      linkedinUrl: profile.social_links?.linkedin ?? "",
      twitterUrl: profile.social_links?.twitter ?? "",
      openToCollaboration: profile.open_to_collaboration,
      preferredRoles: profile.preferred_roles ?? [],
      availability: profile.availability ?? null,
      openToMentoring: profile.open_to_mentoring,
      mentoringTopics: profile.mentoring_topics ?? [],
      industry: profile.industry ?? "",
      company: profile.company ?? "",
      jobTitle: profile.job_title ?? "",
    },
  });

  const listed = useWatch({ control, name: "education" }) ?? [];
  const hasStaffRole = listed.some((e) => e.role === "alumni" || e.role === "faculty" || e.role === "staff");
  const openToCollab = useWatch({ control, name: "openToCollaboration" });
  const openToMentoring = useWatch({ control, name: "openToMentoring" });
  const usernameValue = useWatch({ control, name: "username" });

  function onSubmit(values) {
    setServerError(null);
    startTransition(async () => {
      const res = await updateProfileAction(values);
      if (res.ok) {
        toast.success(res.message);
        return;
      }
      setServerError(res.error);
      if (res.fieldErrors) for (const [f, m] of Object.entries(res.fieldErrors)) setError(f, { message: m });
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      {serverError && <FormAlert>{serverError}</FormAlert>}

      <Section id="basics" title="Basics" description="This is how you appear across UniSphere.">
        <Field id="fullName" label="Full name" required error={errors.fullName?.message}>
          <Input id="fullName" autoComplete="name" aria-describedby="fullName-desc" {...register("fullName")} />
        </Field>
        <UsernameField register={register} value={usernameValue} error={errors.username?.message} currentUsername={profile.username} />
        <Field id="headline" label="Headline" optional error={errors.headline?.message}>
          <Input id="headline" maxLength={120} aria-describedby="headline-desc" {...register("headline")} />
        </Field>
        <Field id="bio" label="Bio" optional error={errors.bio?.message} hint="Up to 600 characters. Shown on your profile.">
          <Textarea id="bio" rows={4} maxLength={600} aria-describedby="bio-desc" {...register("bio")} />
        </Field>
      </Section>

      <Section id="college" title="Schools & colleges" description="Optional. List where you study now, where you studied before, or where you teach or work, with your role at each. It helps you find people and communities, and it does not verify anything.">
        <EducationEditor
          control={control}
          register={register}
          setValue={setValue}
          errors={errors}
          initialColleges={Object.fromEntries(education.map((e) => [e.collegeId, e.college]))}
          initialStructures={structures}
        />
      </Section>

      <Section id="skills" title="Skills & interests" description="Teammate suggestions are based only on what you list here.">
        <Field id="skills" label="Skills" error={errors.skills?.message}>
          <Controller control={control} name="skills" render={({ field }) => <TagInput id="skills" label="Skills" value={field.value} onChange={field.onChange} catalog="skill" placeholder="Add a skill and press Enter" />} />
        </Field>
        <Field id="interests" label="Interests" error={errors.interests?.message}>
          <Controller control={control} name="interests" render={({ field }) => <TagInput id="interests" label="Interests" value={field.value} onChange={field.onChange} catalog="interest" placeholder="Add an interest" />} />
        </Field>
      </Section>

      <Section id="collaboration" title="Collaboration" description="Let project owners know when and how you can contribute.">
        <SwitchRow id="openToCollaboration" name="openToCollaboration" control={control} label="Open to collaboration" description="Appear in teammate searches and recommendations." />
        {openToCollab && (
          <>
            <Field id="preferredRoles" label="Roles I enjoy" optional>
              <Controller control={control} name="preferredRoles" render={({ field }) => <TagInput id="preferredRoles" label="Preferred roles" value={field.value} onChange={field.onChange} max={10} suggestions={COLLABORATION_ROLES} />} />
            </Field>
            <Field id="availability" label="Availability" optional>
              <Controller
                control={control}
                name="availability"
                render={({ field }) => (
                  <Select value={field.value ?? "__none__"} onValueChange={(v) => field.onChange(v === "__none__" ? null : v)}>
                    <SelectTrigger id="availability" className="w-full sm:w-64">
                      <SelectValue placeholder="Not specified" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Not specified</SelectItem>
                      {AVAILABILITY.map((a) => (
                        <SelectItem key={a.value} value={a.value}>
                          {a.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          </>
        )}
      </Section>

      {(hasStaffRole || openToMentoring) && (
        <Section id="mentoring" title="Experience & mentoring" description="Mentoring is optional. Your contact details are never shared automatically.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field id="jobTitle" label="Role" optional error={errors.jobTitle?.message}>
              <Input id="jobTitle" aria-describedby="jobTitle-desc" {...register("jobTitle")} />
            </Field>
            <Field id="company" label="Organization" optional error={errors.company?.message}>
              <Input id="company" aria-describedby="company-desc" {...register("company")} />
            </Field>
            <Field id="industry" label="Industry" optional error={errors.industry?.message}>
              <Input id="industry" aria-describedby="industry-desc" {...register("industry")} />
            </Field>
          </div>
          <SwitchRow id="openToMentoring" name="openToMentoring" control={control} label="Open to mentoring" description="Students can send you a short mentorship request. You decide whether to accept." />
          {openToMentoring && (
            <Field id="mentoringTopics" label="Topics I can help with" optional>
              <Controller control={control} name="mentoringTopics" render={({ field }) => <TagInput id="mentoringTopics" label="Mentoring topics" value={field.value} onChange={field.onChange} max={10} placeholder="e.g. Interview prep, Higher studies" />} />
            </Field>
          )}
        </Section>
      )}

      <Section id="links" title="Links" description="GitHub and portfolio links appear on your profile.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="githubUrl" label="GitHub" optional error={errors.githubUrl?.message}>
            <Input id="githubUrl" type="url" inputMode="url" placeholder="https://github.com/you" aria-describedby="githubUrl-desc" {...register("githubUrl")} />
          </Field>
          <Field id="portfolioUrl" label="Portfolio / website" optional error={errors.portfolioUrl?.message}>
            <Input id="portfolioUrl" type="url" inputMode="url" placeholder="https://" aria-describedby="portfolioUrl-desc" {...register("portfolioUrl")} />
          </Field>
          <Field id="linkedinUrl" label="LinkedIn" optional error={errors.linkedinUrl?.message}>
            <Input id="linkedinUrl" type="url" inputMode="url" aria-describedby="linkedinUrl-desc" {...register("linkedinUrl")} />
          </Field>
          <Field id="twitterUrl" label="X / Twitter" optional error={errors.twitterUrl?.message}>
            <Input id="twitterUrl" type="url" inputMode="url" aria-describedby="twitterUrl-desc" {...register("twitterUrl")} />
          </Field>
        </div>
      </Section>

      <div className="bg-background/90 sticky bottom-16 z-10 flex items-center justify-end gap-3 rounded-lg border p-3 backdrop-blur lg:bottom-4">
        <p className="text-muted-foreground mr-auto text-xs" aria-live="polite">
          {isDirty ? "You have unsaved changes." : "All changes saved."}
        </p>
        <SubmitButton pending={pending} pendingText="Saving…" disabled={!isDirty}>
          Save profile
        </SubmitButton>
      </div>
    </form>
  );
}
