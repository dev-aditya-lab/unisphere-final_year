"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { moderateMemberAction, submitAppealAction, submitReportAction } from "@/lib/actions/community-workspace";
import { REPORT_CATEGORIES, TIMEOUT_OPTIONS } from "@/lib/community/rules";

/** Report a message or a member to the community's moderators. Reporters are not shown to the person reported. */
export function CommunityReportDialog({ open, onOpenChange, communityId, targetType, targetId, label = "message" }) {
  const [category, setCategory] = useState("");
  const [details, setDetails] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await submitReportAction({ communityId, targetType, targetId, category, details: details || undefined });
      if (res.ok) {
        toast.success(res.data?.duplicate ? "You already reported this. The moderators have it." : "Thanks. The moderators will look at it.");
        setCategory("");
        setDetails("");
        onOpenChange(false);
      } else setError(res.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report this {label}</DialogTitle>
          <DialogDescription>
            Community moderators review reports. The person is not told who reported them, and we keep a copy of what was reported so it can be reviewed even if it is deleted.
            If someone is in danger, contact your local emergency services first.
          </DialogDescription>
        </DialogHeader>
        <RadioGroup value={category} onValueChange={setCategory} aria-label="Reason for the report" className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {REPORT_CATEGORIES.map((c) => (
            <Label key={c.value} htmlFor={`cr-${c.value}`} className="hover:bg-muted flex cursor-pointer items-center gap-2 rounded-md border p-2.5 text-sm font-normal">
              <RadioGroupItem id={`cr-${c.value}`} value={c.value} />
              {c.label}
            </Label>
          ))}
        </RadioGroup>
        <div className="space-y-1.5">
          <Label htmlFor="cr-details" className="text-[13px] font-semibold">
            Anything else we should know? <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Textarea id="cr-details" rows={3} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} />
        </div>
        {error && (
          <p role="alert" className="text-destructive-text text-sm">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!category || pending}>
            {pending ? "Sending…" : "Submit report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A reason is required to remove someone else's message: the author is told, and may appeal. */
export function RemoveMessageDialog({ open, onOpenChange, onConfirm }) {
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);
  const valid = reason.trim().length >= 3;
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!pending) onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove this message?</DialogTitle>
          <DialogDescription>The text and any files are erased for everyone. The author is told why and can appeal. This is recorded in the community&rsquo;s audit log.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="rm-reason" className="text-[13px] font-semibold">Reason (the author will see this)</Label>
          <Textarea id="rm-reason" rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: personal attack on another member" />
        </div>
        {error && <p role="alert" className="text-destructive-text text-sm">{error}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={!valid || pending}
            onClick={() => startTransition(async () => {
              setError(null);
              const res = await onConfirm(reason.trim());
              if (res?.ok) { setReason(""); onOpenChange(false); } else setError(res?.error ?? "That could not be removed.");
            })}
          >
            {pending ? "Removing…" : "Remove message"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const ACTIONS = {
  warn: { title: "Warn", hint: "Sends a formal warning. Nothing else changes.", needsReason: true },
  timeout: { title: "Time out", hint: "They can read but not post until it ends.", needsReason: true, needsHours: true },
  clear_timeout: { title: "End timeout", hint: "They can post again immediately.", needsReason: false },
  remove: { title: "Remove from the community", hint: "They lose access and can join again if the community allows it.", needsReason: true, danger: true },
  ban: { title: "Ban", hint: "They lose access and cannot rejoin, even with an invite.", needsReason: true, danger: true },
  unban: { title: "Lift the ban", hint: "They can ask to join again.", needsReason: false },
  note: { title: "Add a private note", hint: "Only moderators see this. The member never does.", needsReason: true },
};

/** Warn, time out, remove, ban or note a member. The database decides whether the signed-in member may (rank, role). */
export function ModerateMemberDialog({ open, onOpenChange, communityId, person, action, reportId = null, onDone }) {
  const cfg = ACTIONS[action] ?? ACTIONS.warn;
  const [reason, setReason] = useState("");
  const [hours, setHours] = useState("24");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);
  const valid = (!cfg.needsReason || reason.trim().length >= 3) && (!cfg.needsHours || Number(hours) > 0);
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!pending) onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{cfg.title}: {person?.full_name ?? "this member"}</DialogTitle>
          <DialogDescription>{cfg.hint}{action !== "note" && " They are told what you did and why, and can appeal."}</DialogDescription>
        </DialogHeader>
        {cfg.needsHours && (
          <div className="space-y-1.5">
            <Label htmlFor="mod-hours" className="text-[13px] font-semibold">For how long</Label>
            <Select value={hours} onValueChange={setHours}>
              <SelectTrigger id="mod-hours" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{TIMEOUT_OPTIONS.map((o) => <SelectItem key={o.hours} value={String(o.hours)}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}
        {(cfg.needsReason || action === "clear_timeout" || action === "unban") && (
          <div className="space-y-1.5">
            <Label htmlFor="mod-reason" className="text-[13px] font-semibold">
              {action === "note" ? "Note" : "Reason"} {!cfg.needsReason && <span className="text-muted-foreground font-normal">(optional)</span>}
            </Label>
            <Textarea id="mod-reason" rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        )}
        {error && <p role="alert" className="text-destructive-text text-sm">{error}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button
            variant={cfg.danger ? "destructive" : "default"}
            disabled={!valid || pending}
            onClick={() => startTransition(async () => {
              setError(null);
              const res = await moderateMemberAction({ communityId, userId: person.id ?? person.user_id, action, reason: reason.trim() || undefined, hours: cfg.needsHours ? Number(hours) : undefined, reportId: reportId ?? undefined });
              if (res.ok) { toast.success(`${cfg.title}: done`); setReason(""); onOpenChange(false); onDone?.(); } else setError(res.error);
            })}
          >
            {pending ? "Working…" : cfg.title}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Ask for a decision to be looked at again. Open for 30 days after the decision; someone other than the person who decided reviews it. */
export function AppealDialog({ open, onOpenChange, actionId, onDone }) {
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!pending) onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Appeal this decision</DialogTitle>
          <DialogDescription>Explain what you think was missed. A different moderator or administrator reads it and replies. You can appeal each decision once.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="appeal-msg" className="text-[13px] font-semibold">Your message</Label>
          <Textarea id="appeal-msg" rows={5} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} />
        </div>
        {error && <p role="alert" className="text-destructive-text text-sm">{error}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button
            disabled={message.trim().length < 10 || pending}
            onClick={() => startTransition(async () => {
              setError(null);
              const res = await submitAppealAction({ actionId, message });
              if (res.ok) { toast.success("Your appeal was sent."); setMessage(""); onOpenChange(false); onDone?.(); } else setError(res.error);
            })}
          >
            {pending ? "Sending…" : "Send appeal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
