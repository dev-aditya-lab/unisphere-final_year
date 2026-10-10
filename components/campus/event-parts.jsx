"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Clock, Star, UserCheck, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Field } from "@/components/forms/field";
import { FormAlert } from "@/components/forms/form-alert";
import { SubmitButton } from "@/components/forms/submit-button";
import { UserAvatar } from "@/components/user-avatar";
import { EVENT_KINDS, eventSchema } from "@/lib/validators/campus";
import { COMMON_TIMEZONES, utcIsoToZonedLocal } from "@/lib/time";
import { cancelEventAction, createEventAction, deleteEventAction, markAttendanceAction, rsvpAction, updateEventAction } from "@/lib/actions/campus";

export function EventForm({ event = null, communities = [] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState(null);
  const tz = event?.timezone ?? "Asia/Kolkata";
  const { register, control, handleSubmit, setError, formState: { errors } } = useForm({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      title: event?.title ?? "", description: event?.description ?? "", kind: event?.kind ?? "meetup", timezone: tz,
      startsLocal: event ? utcIsoToZonedLocal(event.starts_at, tz) : "", endsLocal: event?.ends_at ? utcIsoToZonedLocal(event.ends_at, tz) : "",
      mode: event?.mode ?? "in_person", location: event?.location ?? "", onlineUrl: event?.online_url ?? "",
      registrationMode: event?.registration_mode ?? "in_platform", registrationUrl: event?.registration_url ?? "",
      capacity: event?.capacity ?? "", visibility: event?.visibility ?? "college", communityId: event?.community_id ?? "",
    },
  });
  const mode = useWatch({ control, name: "mode" });
  const regMode = useWatch({ control, name: "registrationMode" });
  const visibility = useWatch({ control, name: "visibility" });
  const tzOptions = COMMON_TIMEZONES.includes(tz) ? COMMON_TIMEZONES : [tz, ...COMMON_TIMEZONES];

  function onSubmit(values) {
    setServerError(null);
    startTransition(async () => {
      const res = event ? await updateEventAction({ eventId: event.id, input: values }) : await createEventAction(values);
      if (res.ok) { toast.success(event ? "Event updated" : "Event created"); router.push(`/events/${res.slug}`); router.refresh(); }
      else { setServerError(res.error); if (res.fieldErrors) for (const [f, m] of Object.entries(res.fieldErrors)) setError(f, { message: m }); }
    });
  }
  const sel = (name, label, options, opts = {}) => (
    <Field id={name} label={label} error={errors[name]?.message}>
      <Controller control={control} name={name} render={({ field }) => (
        <Select value={field.value ?? ""} onValueChange={field.onChange}>
          <SelectTrigger id={name} className="w-full" aria-describedby={`${name}-desc`}><SelectValue placeholder={opts.placeholder} /></SelectTrigger>
          <SelectContent>{options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
        </Select>
      )} />
    </Field>
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      {serverError && <FormAlert>{serverError}</FormAlert>}
      <section className="surface space-y-4 p-5">
        <Field id="title" label="Title" required error={errors.title?.message}><Input id="title" maxLength={140} aria-describedby="title-desc" {...register("title")} /></Field>
        <Field id="description" label="Description" optional error={errors.description?.message}><Textarea id="description" rows={5} maxLength={5000} aria-describedby="description-desc" {...register("description")} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          {sel("kind", "Type", EVENT_KINDS.map((k) => [k.value, k.label]))}
          {sel("mode", "Format", [["in_person", "In person"], ["online", "Online"], ["hybrid", "Hybrid"]])}
        </div>
      </section>
      <section className="surface space-y-4 p-5">
        <h2 className="text-lg font-bold">When</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="startsLocal" label="Starts" required error={errors.startsLocal?.message}><Input id="startsLocal" type="datetime-local" aria-describedby="startsLocal-desc" {...register("startsLocal")} /></Field>
          <Field id="endsLocal" label="Ends" optional error={errors.endsLocal?.message}><Input id="endsLocal" type="datetime-local" aria-describedby="endsLocal-desc" {...register("endsLocal")} /></Field>
          {sel("timezone", "Timezone", tzOptions.map((z) => [z, z.replace("_", " ")]))}
        </div>
        <p className="text-muted-foreground text-xs">Times are entered in the chosen timezone and shown to everyone in that timezone.</p>
      </section>
      <section className="surface space-y-4 p-5">
        <h2 className="text-lg font-bold">Where</h2>
        {(mode === "in_person" || mode === "hybrid") && <Field id="location" label="Location" required error={errors.location?.message}><Input id="location" maxLength={200} aria-describedby="location-desc" {...register("location")} /></Field>}
        {(mode === "online" || mode === "hybrid") && <Field id="onlineUrl" label="Join link" required error={errors.onlineUrl?.message}><Input id="onlineUrl" type="url" placeholder="https://" aria-describedby="onlineUrl-desc" {...register("onlineUrl")} /></Field>}
      </section>
      <section className="surface space-y-4 p-5">
        <h2 className="text-lg font-bold">Registration & visibility</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {sel("registrationMode", "Registration", [["in_platform", "RSVP on UniSphere"], ["external", "External link"], ["none", "No registration"]])}
          {regMode === "in_platform" && <Field id="capacity" label="Capacity" optional error={errors.capacity?.message} hint="Extra people join a waitlist."><Input id="capacity" type="number" min={1} aria-describedby="capacity-desc" {...register("capacity")} /></Field>}
          {regMode === "external" && <Field id="registrationUrl" label="Registration link" required error={errors.registrationUrl?.message}><Input id="registrationUrl" type="url" placeholder="https://" aria-describedby="registrationUrl-desc" {...register("registrationUrl")} /></Field>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {sel("visibility", "Who can see it", [["college", "My college"], ["public", "All members"], ...(communities.length ? [["community", "A community's members"]] : [])])}
          {visibility === "community" && sel("communityId", "Community", communities.map((c) => [c.id, c.name]), { placeholder: "Choose a community" })}
        </div>
      </section>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
        <SubmitButton pending={pending} pendingText="Saving…">{event ? "Save changes" : "Create event"}</SubmitButton>
      </div>
    </form>
  );
}

export function RsvpPanel({ event, viewerId, over }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (event.status === "cancelled") return <p className="text-destructive text-sm font-semibold">This event was cancelled.</p>;
  if (event.registration_mode === "none") return <p className="text-muted-foreground text-sm">No registration needed. Just show up.</p>;
  if (event.registration_mode === "external") return <Button asChild><a href={event.registration_url} target="_blank" rel="noopener noreferrer nofollow">Register on the organiser&rsquo;s site</a></Button>;
  if (!viewerId) return <Button asChild><Link href={`/login?next=${encodeURIComponent(`/events/${event.slug}`)}`}>Log in to RSVP</Link></Button>;
  if (over) return <p className="text-muted-foreground text-sm">This event has ended.</p>;

  const my = event.my_status;
  const run = (status, msg) => startTransition(async () => {
    const res = await rsvpAction({ eventId: event.id, status });
    if (res.ok) { toast.success(res.data === "waitlist" ? "The event is full. You are on the waitlist." : msg); router.refresh(); } else toast.error(res.error);
  });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant={my === "going" ? "soft" : "default"} disabled={pending || my === "going"} onClick={() => run("going", "You are going")}>
        <Check /> {my === "going" ? "You are going" : my === "waitlist" ? "On waitlist" : "I am going"}
      </Button>
      {my !== "going" && my !== "waitlist" && (
        <Button variant={my === "interested" ? "soft" : "outline"} disabled={pending} onClick={() => run(my === "interested" ? "cancelled" : "interested", my === "interested" ? "Removed" : "Saved as interested")} aria-pressed={my === "interested"}>
          <Star /> Interested
        </Button>
      )}
      {(my === "going" || my === "waitlist" || my === "interested") && (
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => run("cancelled", "RSVP cancelled")}><X /> Cancel RSVP</Button>
      )}
    </div>
  );
}

export function EventManagePanel({ event, attendees }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const run = (fn, ok) => startTransition(async () => { const res = await fn(); if (res.ok) { if (ok) toast.success(ok); router.refresh(); } else toast.error(res.error); });
  const going = attendees.filter((a) => a.status === "going");
  const waitlist = attendees.filter((a) => a.status === "waitlist");
  const interested = attendees.filter((a) => a.status === "interested");
  return (
    <div className="space-y-6">
      <section aria-labelledby="going-title">
        <h3 id="going-title" className="eyebrow mb-2">Going ({going.length}{event.capacity ? ` of ${event.capacity}` : ""})</h3>
        {going.length === 0 ? <p className="text-muted-foreground text-sm">Nobody yet.</p> : (
          <ul className="divide-y">
            {going.map((a) => (
              <li key={a.user_id} className="flex items-center justify-between gap-2 py-2">
                <span className="flex items-center gap-2.5"><UserAvatar name={a.person.full_name} avatarKey={a.person.avatar_key} size="sm" /><span className="text-sm font-semibold">{a.person.full_name}</span></span>
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={a.attended} onCheckedChange={(v) => run(() => markAttendanceAction({ eventId: event.id, userId: a.user_id, attended: v === true }))} disabled={pending} aria-label={`Attended: ${a.person.full_name}`} /> Attended</label>
              </li>
            ))}
          </ul>
        )}
      </section>
      {waitlist.length > 0 && <p className="text-sm"><strong>{waitlist.length}</strong> on the waitlist. They are promoted automatically when a seat opens.</p>}
      {interested.length > 0 && <p className="text-muted-foreground text-sm">{interested.length} interested.</p>}
      <div className="flex flex-wrap gap-2 border-t pt-4">
        {event.status === "published" && <Button asChild variant="outline" size="sm"><Link href={`/events/${event.slug}/edit`}>Edit event</Link></Button>}
        {event.status === "published" && (
          <AlertDialog>
            <AlertDialogTrigger asChild><Button variant="outline" size="sm">Cancel event</Button></AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader><AlertDialogTitle>Cancel this event?</AlertDialogTitle><AlertDialogDescription>Everyone who RSVP&rsquo;d is notified. This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
              <Input aria-label="Reason (optional)" placeholder="Reason (optional)" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
              <AlertDialogFooter><AlertDialogCancel>Keep event</AlertDialogCancel><AlertDialogAction onClick={() => run(() => cancelEventAction({ eventId: event.id, reason }), "Event cancelled")}>Cancel event</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        <AlertDialog>
          <AlertDialogTrigger asChild><Button variant="destructive" size="sm">Delete event</Button></AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>Delete this event?</AlertDialogTitle><AlertDialogDescription>It disappears for everyone. Consider cancelling instead so attendees are told.</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>Keep it</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive hover:bg-destructive/90 text-white" onClick={() => startTransition(async () => { const res = await deleteEventAction(event.id); if (res.ok) { toast.success("Event deleted"); router.push("/events"); router.refresh(); } else toast.error(res.error); })}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

export function EventStatusChip({ my_status }) {
  if (my_status === "going") return <span className="text-success flex items-center gap-1 text-xs font-semibold"><UserCheck className="size-3.5" /> Going</span>;
  if (my_status === "waitlist") return <span className="text-warning-text flex items-center gap-1 text-xs font-semibold"><Clock className="size-3.5" /> Waitlist</span>;
  if (my_status === "interested") return <span className="text-primary flex items-center gap-1 text-xs font-semibold"><Star className="size-3.5" /> Interested</span>;
  return null;
}
