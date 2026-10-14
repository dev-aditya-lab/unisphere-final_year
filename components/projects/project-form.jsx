"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "@/components/forms/field";
import { FormAlert } from "@/components/forms/form-alert";
import { SubmitButton } from "@/components/forms/submit-button";
import { TagInput } from "@/components/forms/tag-input";
import { createProjectAction, updateProjectAction } from "@/lib/actions/projects";
import { queueCelebration } from "@/components/motion/celebrate";
import { assistAction } from "@/lib/actions/ai";
import { projectSchema, PROJECT_STATUSES } from "@/lib/validators/project";

const EDIT_SCHEMA = projectSchema.omit({ openRoles: true });

/** Create (no `project`) or edit (with `project`) form. `ai` enables "draft from description". */
export function ProjectForm({ project = null, ai = null, hasCollege = true }) {
  const router = useRouter();
  const editing = Boolean(project);
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState(null);
  const [draftText, setDraftText] = useState("");
  const [drafting, setDrafting] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    getValues,
    setError,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(editing ? EDIT_SCHEMA : projectSchema),
    defaultValues: {
      name: project?.name ?? "",
      tagline: project?.tagline ?? "",
      problem: project?.problem ?? "",
      goals: project?.goals ?? [],
      solution: project?.solution ?? "",
      techStack: project?.tech_stack ?? [],
      requiredSkills: project?.required_skills ?? [],
      teamSize: project?.team_size ?? 4,
      status: project?.status ?? "idea",
      repoUrl: project?.repo_url ?? "",
      demoUrl: project?.demo_url ?? "",
      visibility: project?.visibility ?? (hasCollege ? "college" : "public"),
      lookingForMembers: project?.looking_for_members ?? false,
      openRoles: [],
    },
  });
  const roles = useFieldArray({ control, name: "openRoles" });

  async function draft() {
    setDrafting(true);
    const res = await assistAction({ task: "structure_project", category: "projects", title: getValues("name") || "", body: draftText });
    setDrafting(false);
    if (!res.ok) return toast.error(res.error);
    const d = res.data;
    setValue("name", d.name, { shouldDirty: true });
    setValue("tagline", d.tagline, { shouldDirty: true });
    setValue("problem", d.problem, { shouldDirty: true });
    setValue("goals", d.goals, { shouldDirty: true });
    setValue("solution", d.solution, { shouldDirty: true });
    setValue("techStack", d.techStack, { shouldDirty: true });
    setValue("requiredSkills", d.requiredSkills, { shouldDirty: true });
    if (!editing) {
      roles.replace(d.openRoles.map((r) => ({ title: r.title, description: "", skills: r.skills })));
      if (d.openRoles.length) setValue("lookingForMembers", true);
    }
    toast.success("Draft filled in. Review every field before saving.");
  }

  function onSubmit(values) {
    setServerError(null);
    startTransition(async () => {
      const res = editing ? await updateProjectAction({ projectId: project.id, input: values }) : await createProjectAction(values);
      if (res.ok) {
        if (editing) toast.success("Project updated");
        else queueCelebration("project-published");
        router.push(`/projects/${res.slug}`);
        router.refresh();
      } else {
        setServerError(res.error);
        if (res.fieldErrors) for (const [f, m] of Object.entries(res.fieldErrors)) setError(f, { message: m });
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      {serverError && <FormAlert>{serverError}</FormAlert>}

      {ai?.assist && (
        <section className="bg-teal/10 border-teal/40 rounded-xl border border-dashed p-4" aria-label="Draft with AI">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Sparkles className="text-teal-text size-4" aria-hidden="true" /> Draft from a rough description
            <span className="text-muted-foreground text-xs font-normal">· AI suggestion, you review every field</span>
          </p>
          <Textarea className="mt-2" rows={3} value={draftText} onChange={(e) => setDraftText(e.target.value)} maxLength={4000} aria-label="Describe your project in your own words" placeholder="Describe what you want to build, who it helps and what help you need…" />
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={draft} disabled={drafting || draftText.trim().length < 30}>
            {drafting ? <Loader2 className="animate-spin" /> : <Sparkles />} Fill in the form
          </Button>
        </section>
      )}

      <section className="surface space-y-4 p-5">
        <h2 className="text-lg font-bold">Overview</h2>
        <Field id="name" label="Project name" required error={errors.name?.message}>
          <Input id="name" maxLength={100} aria-describedby="name-desc" {...register("name")} />
        </Field>
        <Field id="tagline" label="One-line summary" optional error={errors.tagline?.message}>
          <Input id="tagline" maxLength={160} aria-describedby="tagline-desc" {...register("tagline")} />
        </Field>
        <Field id="problem" label="Problem statement" optional error={errors.problem?.message} hint="What problem are you solving, and for whom?">
          <Textarea id="problem" rows={4} maxLength={3000} aria-describedby="problem-desc" {...register("problem")} />
        </Field>
        <Field id="goals" label="Goals" optional hint="One goal per line.">
          <Controller
            control={control}
            name="goals"
            render={({ field }) => (
              <Textarea id="goals" rows={3} value={field.value.join("\n")} onChange={(e) => field.onChange(e.target.value.split("\n").map((s) => s.slice(0, 200)).slice(0, 8))} aria-describedby="goals-desc" />
            )}
          />
        </Field>
        <Field id="solution" label="Proposed solution" optional error={errors.solution?.message}>
          <Textarea id="solution" rows={4} maxLength={3000} aria-describedby="solution-desc" {...register("solution")} />
        </Field>
      </section>

      <section className="surface space-y-4 p-5">
        <h2 className="text-lg font-bold">Tech & team</h2>
        <Field id="techStack" label="Tech stack" optional error={errors.techStack?.message}>
          <Controller control={control} name="techStack" render={({ field }) => <TagInput id="techStack" label="Tech stack" value={field.value} onChange={field.onChange} max={15} placeholder="e.g. Next.js, PostgreSQL" />} />
        </Field>
        <Field id="requiredSkills" label="Skills the team needs" optional error={errors.requiredSkills?.message} hint="Used to suggest teammates who list these skills.">
          <Controller control={control} name="requiredSkills" render={({ field }) => <TagInput id="requiredSkills" label="Required skills" value={field.value} onChange={field.onChange} max={15} placeholder="e.g. UI design, Python" />} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field id="teamSize" label="Team size" error={errors.teamSize?.message}>
            <Input id="teamSize" type="number" min={1} max={30} aria-describedby="teamSize-desc" {...register("teamSize")} />
          </Field>
          <Field id="status" label="Status">
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="status" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{PROJECT_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field id="visibility" label="Who can see it">
            <Controller
              control={control}
              name="visibility"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="visibility" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">All members</SelectItem>
                    {(hasCollege || project?.visibility === "college") && <SelectItem value="college">My college</SelectItem>}
                    <SelectItem value="private">Team only</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="repoUrl" label="Repository" optional error={errors.repoUrl?.message}>
            <Input id="repoUrl" type="url" placeholder="https://github.com/…" aria-describedby="repoUrl-desc" {...register("repoUrl")} />
          </Field>
          <Field id="demoUrl" label="Demo" optional error={errors.demoUrl?.message}>
            <Input id="demoUrl" type="url" placeholder="https://" aria-describedby="demoUrl-desc" {...register("demoUrl")} />
          </Field>
        </div>
        <div className="flex items-start justify-between gap-4 rounded-md border p-3">
          <div>
            <Label htmlFor="lookingForMembers" className="text-sm font-semibold">Looking for members</Label>
            <p className="text-muted-foreground text-xs">Lets people request to join, and shows the project in teammate searches.</p>
          </div>
          <Controller control={control} name="lookingForMembers" render={({ field }) => <Switch id="lookingForMembers" checked={field.value} onCheckedChange={field.onChange} />} />
        </div>
      </section>

      {!editing && (
        <section className="surface space-y-4 p-5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold">Open roles</h2>
              <p className="text-muted-foreground text-sm">Describe the people you need. You can add or close roles later.</p>
            </div>
            <Button type="button" variant="outline" size="sm" disabled={roles.fields.length >= 6} onClick={() => roles.append({ title: "", description: "", skills: [] })}>
              <Plus /> Add role
            </Button>
          </div>
          {roles.fields.map((f, i) => (
            <div key={f.id} className="space-y-3 rounded-md border p-3">
              <div className="flex items-start gap-2">
                <Field id={`role-title-${i}`} label="Role" className="flex-1" error={errors.openRoles?.[i]?.title?.message}>
                  <Input id={`role-title-${i}`} placeholder="e.g. Mobile developer" aria-describedby={`role-title-${i}-desc`} {...register(`openRoles.${i}.title`)} />
                </Field>
                <Button type="button" variant="ghost" size="icon" className="mt-6" onClick={() => roles.remove(i)} aria-label={`Remove role ${i + 1}`}>
                  <Trash2 />
                </Button>
              </div>
              <Field id={`role-skills-${i}`} label="Skills for this role" optional>
                <Controller control={control} name={`openRoles.${i}.skills`} render={({ field }) => <TagInput id={`role-skills-${i}`} label="Role skills" value={field.value} onChange={field.onChange} max={10} />} />
              </Field>
            </div>
          ))}
        </section>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
        <SubmitButton pending={pending} pendingText="Saving…">{editing ? "Save changes" : "Create project"}</SubmitButton>
      </div>
    </form>
  );
}
