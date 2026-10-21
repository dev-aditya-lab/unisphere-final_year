"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "@/components/forms/field";
import { FormAlert } from "@/components/forms/form-alert";
import { SubmitButton } from "@/components/forms/submit-button";
import { TagInput } from "@/components/forms/tag-input";
import { OPPORTUNITY_KINDS, opportunitySchema } from "@/lib/validators/campus";
import { createOpportunityAction, deleteOpportunityAction, setOpportunityStatusAction } from "@/lib/actions/campus";

export function OpportunityForm({ hasCollege = true }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState(null);
  const { register, control, handleSubmit, setError, formState: { errors } } = useForm({
    resolver: zodResolver(opportunitySchema),
    defaultValues: { title: "", organization: "", kind: "internship", location: "", mode: "on_site", applyUrl: "", deadline: "", description: "", skills: [], stipend: "", visibility: hasCollege ? "college" : "public" },
  });
  function onSubmit(values) {
    setServerError(null);
    startTransition(async () => {
      const res = await createOpportunityAction(values);
      if (res.ok) { toast.success("Opportunity published"); router.push(`/opportunities/${res.slug}`); router.refresh(); }
      else { setServerError(res.error); if (res.fieldErrors) for (const [f, m] of Object.entries(res.fieldErrors)) setError(f, { message: m }); }
    });
  }
  const sel = (name, label, options) => (
    <Field id={name} label={label}>
      <Controller control={control} name={name} render={({ field }) => (
        <Select value={field.value} onValueChange={field.onChange}>
          <SelectTrigger id={name} className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>{options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
        </Select>
      )} />
    </Field>
  );
  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="surface space-y-4 p-5">
      {serverError && <FormAlert>{serverError}</FormAlert>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="title" label="Title" required error={errors.title?.message}><Input id="title" maxLength={140} aria-describedby="title-desc" {...register("title")} /></Field>
        <Field id="organization" label="Organization" required error={errors.organization?.message}><Input id="organization" maxLength={120} aria-describedby="organization-desc" {...register("organization")} /></Field>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {sel("kind", "Type", OPPORTUNITY_KINDS.map((k) => [k.value, k.label]))}
        {sel("mode", "Work mode", [["on_site", "On site"], ["remote", "Remote"], ["hybrid", "Hybrid"]])}
        {sel("visibility", "Who can see it", [...(hasCollege ? [["college", "My college"]] : []), ["public", "All members"]])}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field id="location" label="Location" optional error={errors.location?.message}><Input id="location" maxLength={120} aria-describedby="location-desc" {...register("location")} /></Field>
        <Field id="stipend" label="Stipend / pay" optional error={errors.stipend?.message}><Input id="stipend" maxLength={80} placeholder="e.g. ₹20,000 / month" aria-describedby="stipend-desc" {...register("stipend")} /></Field>
        <Field id="deadline" label="Apply by" optional error={errors.deadline?.message}><Input id="deadline" type="date" aria-describedby="deadline-desc" {...register("deadline")} /></Field>
      </div>
      <Field id="applyUrl" label="Application link" optional error={errors.applyUrl?.message} hint="Where people apply. We never collect applications ourselves."><Input id="applyUrl" type="url" placeholder="https://" aria-describedby="applyUrl-desc" {...register("applyUrl")} /></Field>
      <Field id="skills" label="Skills" optional error={errors.skills?.message}><Controller control={control} name="skills" render={({ field }) => <TagInput id="skills" label="Skills" value={field.value} onChange={field.onChange} max={15} catalog="skill" placeholder="e.g. Python, Content writing" />} /></Field>
      <Field id="description" label="Details" optional error={errors.description?.message}><Textarea id="description" rows={6} maxLength={5000} aria-describedby="description-desc" {...register("description")} /></Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
        <SubmitButton pending={pending} pendingText="Publishing…">Publish</SubmitButton>
      </div>
    </form>
  );
}

export function OpportunityOwnerActions({ opportunity }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = (fn, ok, after) => startTransition(async () => { const res = await fn(); if (res.ok) { toast.success(ok); after ? after() : router.refresh(); } else toast.error(res.error); });
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => setOpportunityStatusAction({ opportunityId: opportunity.id, status: opportunity.status === "open" ? "closed" : "open" }), opportunity.status === "open" ? "Listing closed" : "Listing reopened")}>
        {opportunity.status === "open" ? "Close listing" : "Reopen listing"}
      </Button>
      <Button variant="destructive" size="sm" disabled={pending} onClick={() => run(() => deleteOpportunityAction(opportunity.id), "Listing deleted", () => { router.push("/opportunities"); router.refresh(); })}>Delete</Button>
    </div>
  );
}
