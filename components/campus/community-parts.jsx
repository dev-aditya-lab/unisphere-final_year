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
import { createCommunityAction, deleteCommunityAction, joinCommunityAction, leaveCommunityAction, manageMemberAction, respondMembershipAction, setCommunityOfficialAction, updateCommunityAction } from "@/lib/actions/campus";

export function CommunityForm({ community = null, hasCollege = true }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState(null);
  const { register, control, handleSubmit, setError, formState: { errors } } = useForm({
    resolver: zodResolver(communitySchema),
    defaultValues: { name: community?.name ?? "", kind: community?.kind ?? "community", description: community?.description ?? "", visibility: community?.visibility ?? (hasCollege ? "college" : "public"), joinPolicy: community?.join_policy ?? "open" },
  });
  function onSubmit(values) {
    setServerError(null);
    startTransition(async () => {
      const res = community ? await updateCommunityAction({ communityId: community.id, input: values }) : await createCommunityAction(values);
      if (res.ok) { toast.success(community ? "Community updated" : "Community created"); router.push(`/communities/${res.slug}`); router.refresh(); }
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
        {select("visibility", "Who can find it", [["public", "All members"], ...(hasCollege || community?.visibility === "college" ? [["college", "My college"]] : []), ["private", "Members only"]])}
        {select("joinPolicy", "How people join", [["open", "Open to all"], ["request", "By request"], ["invite", "Invite only"]])}
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
        <SubmitButton pending={pending} pendingText="Saving…">{community ? "Save changes" : "Create community"}</SubmitButton>
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

export function CommunityAdminPanel({ community, members, isOwner, canMakeOfficial }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = (fn, success) => startTransition(async () => { const res = await fn(); if (res.ok) { if (success) toast.success(success); router.refresh(); } else toast.error(res.error); });
  const pendingMembers = members.filter((m) => m.status === "pending");
  const active = members.filter((m) => m.status === "active");
  return (
    <div className="space-y-6">
      {pendingMembers.length > 0 && (
        <section aria-labelledby="req-title">
          <h3 id="req-title" className="eyebrow mb-2">Requests to join ({pendingMembers.length})</h3>
          <ul className="divide-y">
            {pendingMembers.map((m) => (
              <li key={m.user_id} className="flex items-center justify-between gap-2 py-2.5">
                <div className="flex items-center gap-2.5"><UserAvatar name={m.person.full_name} avatarKey={m.person.avatar_key} size="sm" /><span className="text-sm font-semibold">{m.person.full_name}</span></div>
                <div className="flex gap-2">
                  <Button size="sm" disabled={pending} onClick={() => run(() => respondMembershipAction({ communityId: community.id, userId: m.user_id, accept: true }), "Member added")}><Check /> Accept</Button>
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => respondMembershipAction({ communityId: community.id, userId: m.user_id, accept: false }))}><X /> Decline</Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section aria-labelledby="mem-title">
        <h3 id="mem-title" className="eyebrow mb-2">Members ({active.length})</h3>
        <ul className="divide-y">
          {active.map((m) => (
            <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div className="flex items-center gap-2.5">
                <UserAvatar name={m.person.full_name} avatarKey={m.person.avatar_key} size="sm" />
                {m.person.username ? <Link href={`/u/${m.person.username}`} className="text-sm font-semibold hover:underline">{m.person.full_name}</Link> : <span className="text-sm font-semibold">{m.person.full_name}</span>}
              </div>
              <div className="flex items-center gap-2">
                {isOwner && m.role !== "owner" ? (
                  <Select value={m.role} onValueChange={(v) => run(() => manageMemberAction({ communityId: community.id, userId: m.user_id, action: `make_${v}` }), "Role updated")} disabled={pending}>
                    <SelectTrigger size="sm" className="w-32" aria-label={`Role of ${m.person.full_name}`}><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="admin">Admin</SelectItem><SelectItem value="moderator">Moderator</SelectItem><SelectItem value="member">Member</SelectItem></SelectContent>
                  </Select>
                ) : <Badge variant={m.role === "owner" ? "soft" : "mono"} className="capitalize">{m.role}</Badge>}
                {m.role !== "owner" && (isOwner || m.role === "member" || m.role === "moderator") && (
                  <>
                    <Button size="icon-sm" variant="ghost" disabled={pending} aria-label={`Remove ${m.person.full_name}`} onClick={() => run(() => manageMemberAction({ communityId: community.id, userId: m.user_id, action: "remove" }), "Member removed")}><UserMinus /></Button>
                    <Button size="icon-sm" variant="ghost" disabled={pending} aria-label={`Ban ${m.person.full_name}`} onClick={() => run(() => manageMemberAction({ communityId: community.id, userId: m.user_id, action: "ban" }), "Member banned")}><ShieldBan /></Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
      <div className="flex flex-wrap gap-2 border-t pt-4">
        <Button asChild variant="outline" size="sm"><Link prefetch={false} href={`/communities/${community.slug}/edit`}>Edit details</Link></Button>
        {canMakeOfficial && (
          <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => setCommunityOfficialAction({ communityId: community.id, official: !community.is_official }), community.is_official ? "Official badge removed" : "Marked as official")}>
            <Shield /> {community.is_official ? "Remove official badge" : "Mark as official"}
          </Button>
        )}
        {isOwner && (
          <AlertDialog>
            <AlertDialogTrigger asChild><Button variant="destructive" size="sm">Delete community</Button></AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader><AlertDialogTitle>Delete {community.name}?</AlertDialogTitle><AlertDialogDescription>The community and its member list disappear. Posts made there stay with their authors but lose the community.</AlertDialogDescription></AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel>Keep it</AlertDialogCancel>
                <AlertDialogAction className="bg-destructive hover:bg-destructive/90 text-white" onClick={() => startTransition(async () => { const res = await deleteCommunityAction(community.id); if (res.ok) { toast.success("Community deleted"); router.push("/communities"); router.refresh(); } else toast.error(res.error); })}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}

export function OfficialBadge() {
  return <Badge variant="soft"><BadgeCheck /> Official</Badge>;
}
