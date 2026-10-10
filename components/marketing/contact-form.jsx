"use client";

import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "@/components/forms/field";
import { FormAlert } from "@/components/forms/form-alert";
import { SubmitButton } from "@/components/forms/submit-button";
import { emailSchema } from "@/lib/validators/auth";
import { submitContactAction } from "@/lib/actions/contact";

const SUBJECTS = ["General", "Support", "Privacy", "Report a problem", "Partnerships"];

const schema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(100),
  email: emailSchema,
  subject: z.enum(SUBJECTS),
  message: z.string().trim().min(10, "Please write at least 10 characters").max(4000),
  website: z.string().optional(),
});

export function ContactForm() {
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState(null);
  const [done, setDone] = useState(null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { name: "", email: "", subject: "General", message: "", website: "" } });

  function onSubmit(values) {
    setServerError(null);
    startTransition(async () => {
      const res = await submitContactAction(values);
      if (res.ok) setDone(res.message);
      else {
        setServerError(res.error);
        if (res.fieldErrors) for (const [f, m] of Object.entries(res.fieldErrors)) setError(f, { message: m });
      }
    });
  }

  if (done) {
    return (
      <div className="surface flex items-start gap-3 p-6" role="status">
        <CheckCircle2 className="text-success mt-0.5 size-6 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-semibold">Message sent</p>
          <p className="text-muted-foreground text-sm">{done}</p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="surface space-y-4 p-5 sm:p-6">
      {serverError && <FormAlert>{serverError}</FormAlert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="name" label="Name" required error={errors.name?.message}>
          <Input id="name" autoComplete="name" aria-describedby="name-desc" {...register("name")} />
        </Field>
        <Field id="email" label="Email" required error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" aria-describedby="email-desc" {...register("email")} />
        </Field>
      </div>
      <Field id="subject" label="Topic">
        <Controller
          control={control}
          name="subject"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="subject" className="w-full sm:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUBJECTS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </Field>
      <Field id="message" label="Message" required error={errors.message?.message}>
        <Textarea id="message" rows={6} maxLength={4000} aria-describedby="message-desc" {...register("message")} />
      </Field>
      {/* Honeypot: hidden from people and assistive tech, tempting to bots. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" tabIndex={-1} autoComplete="off" {...register("website")} />
      </div>
      <SubmitButton pending={pending} pendingText="Sending…">
        Send message
      </SubmitButton>
    </form>
  );
}
