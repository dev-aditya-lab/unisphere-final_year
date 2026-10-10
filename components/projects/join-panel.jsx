"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Clock, LogOut, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { removeMemberAction, requestToJoinAction, respondToInvitationAction, withdrawJoinRequestAction } from "@/lib/actions/projects";

/** The visitor's call to action on a project page, driven by their real relationship to the project. */
export function JoinPanel({ project, viewerId, myRole, request, invitation }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [roleId, setRoleId] = useState("any");
  const [message, setMessage] = useState("");
  const [error, setError] = useState(null);
  const full = project.member_count >= project.team_size;

  function run(fn, success) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        if (success) toast.success(success);
        setOpen(false);
        router.refresh();
      } else {
        setError(res.error);
        toast.error(res.error);
      }
    });
  }

  if (!viewerId) {
    return (
      <Button asChild>
        <Link href={`/login?next=${encodeURIComponent(`/projects/${project.slug}`)}`}>
          <UserPlus /> Log in to join
        </Link>
      </Button>
    );
  }

  if (myRole) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-success flex items-center gap-1.5 text-sm font-semibold">
          <Check className="size-4" aria-hidden="true" /> You are on this team ({myRole})
        </span>
        {myRole !== "owner" && (
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => removeMemberAction({ projectId: project.id, userId: viewerId }), "You left the project")}>
            <LogOut /> Leave
          </Button>
        )}
      </div>
    );
  }

  if (invitation) {
    return (
      <div className="bg-accent/50 rounded-lg border p-3">
        <p className="text-sm font-semibold">You are invited to join{invitation.role_label ? ` as ${invitation.role_label}` : ""}</p>
        {invitation.message && <p className="text-muted-foreground mt-1 text-sm">“{invitation.message}”</p>}
        <div className="mt-3 flex gap-2">
          <Button size="sm" disabled={pending} onClick={() => run(() => respondToInvitationAction({ invitationId: invitation.id, accept: true }), "Welcome to the team")}>
            <Check /> Accept
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => respondToInvitationAction({ invitationId: invitation.id, accept: false }))}>
            <X /> Decline
          </Button>
        </div>
      </div>
    );
  }

  if (request) {
    return (
      <Button variant="outline" disabled={pending} onClick={() => run(() => withdrawJoinRequestAction(request.id), "Request withdrawn")}>
        <Clock /> Request sent. Withdraw
      </Button>
    );
  }

  if (!project.looking_for_members) return <p className="text-muted-foreground text-sm">This project is not recruiting right now.</p>;
  if (full) return <p className="text-muted-foreground text-sm">The team is full.</p>;

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <UserPlus /> Request to join
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request to join {project.name}</DialogTitle>
            <DialogDescription>The project managers see your profile and this message.</DialogDescription>
          </DialogHeader>
          {project.open_roles?.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="text-[13px] font-semibold">Which role interests you?</legend>
              <RadioGroup value={roleId} onValueChange={setRoleId}>
                <Label htmlFor="role-any" className="flex cursor-pointer items-center gap-2 rounded-md border p-2.5 text-sm font-normal">
                  <RadioGroupItem id="role-any" value="any" /> Any role
                </Label>
                {project.open_roles.map((r) => (
                  <Label key={r.id} htmlFor={`role-${r.id}`} className="flex cursor-pointer items-start gap-2 rounded-md border p-2.5 text-sm font-normal">
                    <RadioGroupItem id={`role-${r.id}`} value={r.id} className="mt-0.5" />
                    <span>
                      <span className="font-semibold">{r.title}</span>
                      {r.skills?.length > 0 && <span className="text-muted-foreground block text-xs">{r.skills.join(", ")}</span>}
                    </span>
                  </Label>
                ))}
              </RadioGroup>
            </fieldset>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="join-message" className="text-[13px] font-semibold">
              Why do you want to join? <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea id="join-message" rows={4} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Mention relevant skills or what you would like to contribute." />
          </div>
          {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending} onClick={() => run(() => requestToJoinAction({ projectId: project.id, roleId: roleId === "any" ? null : roleId, message: message || undefined }), "Request sent")}>
              {pending ? "Sending…" : "Send request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
