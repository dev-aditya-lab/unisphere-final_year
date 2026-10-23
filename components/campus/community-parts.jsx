"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, UserMinus, X } from "lucide-react";
import { BadgeCheck, Shield, ShieldBan, UserPlus } from "@/components/icons/lucide-compat";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Field } from "@/components/forms/field";
import { FormAlert } from "@/components/forms/form-alert";
import { SubmitButton } from "@/components/forms/submit-button";
import { UserAvatar } from "@/components/user-avatar";
import { COMMUNITY_KINDS, communitySchema } from "@/lib/validators/campus";
import { createCommunityAction, joinCommunityAction, leaveCommunityAction } from "@/lib/actions/campus";

/** Creating a community. (Editing one happens in the community's management page, which audits every change.) */
export function CommunityForm({ hasCollege = true }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState(null);
  const { register, control, handleSubmit, setError, formState: { errors } } = useForm({
    resolver: zodResolver(communitySchema),
    defaultValues: { name: "", kind: "community", description: "", visibility: hasCollege ? "college" : "public", joinPolicy: "open" },
  });
  function onSubmit(values) {
    setServerError(null);
    startTransition(async () => {
      const res = await createCommunityAction(values);
      if (res.ok) { toast.success("Community created. Add a banner, rules and channels from Manage."); router.push(`/communities/${res.slug}`); router.refresh(); }
      else { setServerError(res.error); if (res.fieldErrors) for (const [f, m] of Object.entries(res.fieldErrors)) setError(f, { message: m }); }
    });
  }
  const select = (name, label, options) => (
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
      <Field id="name" label="Name" required error={errors.name?.message}><Input id="name" maxLength={80} aria-describedby="name-desc" {...register("name")} /></Field>
      <Field id="description" label="Description" optional error={errors.description?.message}><Textarea id="description" rows={4} maxLength={1500} aria-describedby="description-desc" {...register("description")} /></Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {select("kind", "Type", COMMUNITY_KINDS.map((k) => [k.value, k.label]))}
        {select("visibility", "Who can find it", [["public", "All members"], ...(hasCollege ? [["college", "My college"]] : []), ["private", "Members only (hidden)"]])}
        {select("joinPolicy", "How people join", [["open", "Open to all"], ["request", "By request"], ["invite", "Invite only"]])}
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
        <SubmitButton pending={pending} pendingText="Saving…">Create community</SubmitButton>
      </div>
    </form>
  );
}

export function JoinCommunityButton({ community, viewerId }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (!viewerId) return <Button asChild><Link prefetch={false} href={`/login?next=${encodeURIComponent(`/communities/${community.slug}`)}`}><UserPlus /> Log in to join</Link></Button>;
  const status = community.my_status;
  const run = (fn, ok) => startTransition(async () => { const res = await fn(community.id); if (res.ok) { toast.success(ok(res)); router.refresh(); } else toast.error(res.error); });
  if (status === "active") return community.my_role === "owner" ? <Badge variant="soft">You own this community</Badge> : <Button variant="outline" disabled={pending} onClick={() => run(leaveCommunityAction, () => "You left the community")}>Leave</Button>;
  if (status === "pending") return <Button variant="outline" disabled={pending} onClick={() => run(leaveCommunityAction, () => "Request withdrawn")}>Request sent. Withdraw</Button>;
  if (status === "banned") return <p className="text-muted-foreground text-sm">You cannot join this community.</p>;
  if (community.join_policy === "invite") return <p className="text-muted-foreground text-sm">This community is invite-only.</p>;
  return (
    <Button disabled={pending} onClick={() => run(joinCommunityAction, (res) => (res.data === "pending" ? "Request sent" : "Welcome!"))}>
      <UserPlus /> {community.join_policy === "request" ? "Request to join" : "Join"}
    </Button>
  );
}

export function OfficialBadge() {
  return <Badge variant="soft"><BadgeCheck /> Official</Badge>;
}
