"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/forms/field";
import { SubmitButton } from "@/components/forms/submit-button";
import { achievementSchema, experienceSchema } from "@/lib/validators/profile";
import { addAchievementAction, addExperienceAction, deleteAchievementAction, deleteExperienceAction } from "@/lib/actions/profile";

function fmt(date) {
  if (!date) return null;
  return new Date(date).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
}

function RemoveButton({ label, onRemove }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={`Remove ${label}`}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await onRemove();
          if (!res.ok) toast.error(res.error);
        })
      }
    >
      <Trash2 />
    </Button>
  );
}

function AddDialog({ title, description, trigger, schema, defaults, action, children }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState(null);
  const form = useForm({ resolver: zodResolver(schema), defaultValues: defaults });

  function onSubmit(values) {
    setServerError(null);
    startTransition(async () => {
      const res = await action(values);
      if (res.ok) {
        toast.success(res.message);
        form.reset(defaults);
        setOpen(false);
      } else {
        setServerError(res.error);
        if (res.fieldErrors) for (const [f, m] of Object.entries(res.fieldErrors)) form.setError(f, { message: m });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
          {serverError && <p role="alert" className="text-destructive-text text-sm">{serverError}</p>}
          {children(form)}
          <DialogFooter>
            <SubmitButton pending={pending} pendingText="Saving…">
              Add
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AchievementsCard({ items }) {
  return (
    <section id="achievements" className="surface scroll-mt-24 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Achievements</h2>
          <p className="text-muted-foreground mt-0.5 text-sm">Awards, hackathons, certifications, publications.</p>
        </div>
        <AddDialog
          title="Add an achievement"
          description="Highlight something you are proud of."
          schema={achievementSchema}
          defaults={{ title: "", description: "", achievedOn: "", url: "" }}
          action={addAchievementAction}
          trigger={
            <Button variant="outline" size="sm">
              <Plus /> Add
            </Button>
          }
        >
          {({ register, formState: { errors } }) => (
            <>
              <Field id="ach-title" label="Title" required error={errors.title?.message}>
                <Input id="ach-title" aria-describedby="ach-title-desc" {...register("title")} />
              </Field>
              <Field id="ach-desc" label="Description" optional error={errors.description?.message}>
                <Textarea id="ach-desc" rows={3} aria-describedby="ach-desc-desc" {...register("description")} />
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field id="ach-date" label="Date" optional error={errors.achievedOn?.message}>
                  <Input id="ach-date" type="date" aria-describedby="ach-date-desc" {...register("achievedOn")} />
                </Field>
                <Field id="ach-url" label="Link" optional error={errors.url?.message}>
                  <Input id="ach-url" type="url" placeholder="https://" aria-describedby="ach-url-desc" {...register("url")} />
                </Field>
              </div>
            </>
          )}
        </AddDialog>
      </div>
      {items.length === 0 ? (
        <p className="text-muted-foreground mt-4 text-sm">Nothing here yet.</p>
      ) : (
        <ul className="mt-4 divide-y">
          {items.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{a.title}</p>
                {a.achieved_on && <p className="text-muted-foreground text-xs">{fmt(a.achieved_on)}</p>}
                {a.description && <p className="text-muted-foreground mt-1 text-sm">{a.description}</p>}
              </div>
              <RemoveButton label={a.title} onRemove={() => deleteAchievementAction(a.id)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ExperiencesCard({ items }) {
  return (
    <section id="experience" className="surface scroll-mt-24 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Career experience</h2>
          <p className="text-muted-foreground mt-0.5 text-sm">Internships, jobs and research. Helps juniors find relevant mentors.</p>
        </div>
        <AddDialog
          title="Add experience"
          description="Where have you worked, interned or researched?"
          schema={experienceSchema}
          defaults={{ kind: "work", title: "", organization: "", startDate: "", endDate: "", description: "" }}
          action={addExperienceAction}
          trigger={
            <Button variant="outline" size="sm">
              <Plus /> Add
            </Button>
          }
        >
          {({ register, formState: { errors } }) => (
            <>
              <input type="hidden" {...register("kind")} />
              <Field id="exp-title" label="Role" required error={errors.title?.message}>
                <Input id="exp-title" aria-describedby="exp-title-desc" {...register("title")} />
              </Field>
              <Field id="exp-org" label="Organization" required error={errors.organization?.message}>
                <Input id="exp-org" aria-describedby="exp-org-desc" {...register("organization")} />
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field id="exp-start" label="Start" optional error={errors.startDate?.message}>
                  <Input id="exp-start" type="date" aria-describedby="exp-start-desc" {...register("startDate")} />
                </Field>
                <Field id="exp-end" label="End" optional error={errors.endDate?.message} hint="Leave empty if current.">
                  <Input id="exp-end" type="date" aria-describedby="exp-end-desc" {...register("endDate")} />
                </Field>
              </div>
              <Field id="exp-desc" label="What did you do?" optional error={errors.description?.message}>
                <Textarea id="exp-desc" rows={3} aria-describedby="exp-desc-desc" {...register("description")} />
              </Field>
            </>
          )}
        </AddDialog>
      </div>
      {items.length === 0 ? (
        <p className="text-muted-foreground mt-4 text-sm">Nothing here yet.</p>
      ) : (
        <ul className="mt-4 divide-y">
          {items.map((x) => (
            <li key={x.id} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {x.title} <span className="text-muted-foreground font-normal">· {x.organization}</span>
                </p>
                {(x.start_date || x.end_date) && (
                  <p className="text-muted-foreground text-xs">
                    {fmt(x.start_date) ?? "—"} – {x.end_date ? fmt(x.end_date) : "Present"}
                  </p>
                )}
                {x.description && <p className="text-muted-foreground mt-1 text-sm">{x.description}</p>}
              </div>
              <RemoveButton label={x.title} onRemove={() => deleteExperienceAction(x.id)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
