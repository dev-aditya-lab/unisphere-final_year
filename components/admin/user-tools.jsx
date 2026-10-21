"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { StickyNote } from "@/components/icons/lucide-compat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { addUserNoteAction, editUserProfileAction, moderateUserAction } from "@/lib/actions/admin";

const PERIODS = [
  { value: "", label: "Until staff reinstate" },
  { value: "1", label: "1 day" },
  { value: "3", label: "3 days" },
  { value: "7", label: "7 days" },
  { value: "14", label: "14 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
];

/** Shared shape: run a Server Action, keep the dialog open with the server's message if it refuses. */
function useRun(action, onDone) {
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  function run(payload, successMessage) {
    setError(null);
    startTransition(async () => {
      const res = await action(payload);
      if (res?.ok) {
        toast.success(res.message ?? successMessage);
        onDone?.();
        router.refresh();
      } else setError(res?.fieldErrors ? Object.values(res.fieldErrors)[0] : (res?.error ?? "Something went wrong."));
    });
  }
  return { run, error, pending, setError };
}

/** Restrict or suspend a member, optionally for a set period (reinstated automatically when it ends). */
export function TimedModerationDialog({ userId, kind, title, description, label }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [period, setPeriod] = useState("");
  const { run, error, pending, setError } = useRun(moderateUserAction, () => {
    setOpen(false);
    setReason("");
  });
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setError(null); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-destructive-text hover:text-destructive-text">{label}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor={`period-${kind}`} className="text-[13px] font-semibold">How long</Label>
          <select id={`period-${kind}`} value={period} onChange={(e) => setPeriod(e.target.value)} className="border-input bg-card h-10 w-full rounded-lg border px-3 text-sm">
            {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <p className="text-muted-foreground text-xs">A set period ends by itself and the member is told. Open-ended stays until you reinstate them.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`reason-${kind}`} className="text-[13px] font-semibold">Reason shown to the member</Label>
          <Textarea id={`reason-${kind}`} rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        {error && <p role="alert" className="text-destructive-text text-sm">{error}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="destructive" disabled={pending || reason.trim().length < 3} onClick={() => run({ userId, action: kind, reason: reason.trim(), days: period ? Number(period) : null }, "Done.")}>
            {pending ? "Working…" : label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** An internal note: visible to staff only, never to the member. */
export function UserNoteForm({ userId }) {
  const [note, setNote] = useState("");
  const { run, error, pending } = useRun(addUserNoteAction, () => setNote(""));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run({ userId, note: note.trim() }, "Note added.");
      }}
      className="space-y-2"
    >
      <Label htmlFor="user-note" className="text-[13px] font-semibold">Add an internal note</Label>
      <Textarea id="user-note" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Visible to staff only. The member never sees notes." />
      {error && <p role="alert" className="text-destructive-text text-sm">{error}</p>}
      <Button type="submit" size="sm" variant="secondary" disabled={pending || note.trim().length < 3}>
        <StickyNote /> {pending ? "Saving…" : "Add note"}
      </Button>
    </form>
  );
}

/** Correct an inappropriate name, username, headline or bio. Only the fields that changed are sent. */
export function EditProfileDialog({ member }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ fullName: member.full_name ?? "", username: member.username ?? "", headline: member.headline ?? "", bio: member.bio ?? "" });
  const [reason, setReason] = useState("");
  const { run, error, pending, setError } = useRun(editUserProfileAction, () => {
    setOpen(false);
    setReason("");
  });

  function submit() {
    const payload = { userId: member.id, reason: reason.trim() };
    if (f.fullName.trim() !== (member.full_name ?? "")) payload.fullName = f.fullName.trim();
    if (f.username.trim().toLowerCase() !== member.username) payload.username = f.username.trim().toLowerCase();
    if (f.headline.trim() !== (member.headline ?? "")) payload.headline = f.headline.trim();
    if (f.bio.trim() !== (member.bio ?? "")) payload.bio = f.bio.trim();
    run(payload, "Profile corrected.");
  }
  const set = (k) => (e) => setF((prev) => ({ ...prev, [k]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setError(null); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Correct profile</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Correct this member&rsquo;s profile</DialogTitle>
          <DialogDescription>For names, handles or text that break the guidelines. The change and your reason are recorded in the audit log and the member&rsquo;s history.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[55dvh] space-y-3 overflow-y-auto px-0.5">
          <div className="space-y-1.5"><Label htmlFor="ep-name" className="text-[13px] font-semibold">Name</Label><Input id="ep-name" value={f.fullName} maxLength={80} onChange={set("fullName")} /></div>
          <div className="space-y-1.5"><Label htmlFor="ep-user" className="text-[13px] font-semibold">Username</Label><Input id="ep-user" value={f.username} maxLength={30} onChange={set("username")} /></div>
          <div className="space-y-1.5"><Label htmlFor="ep-head" className="text-[13px] font-semibold">Headline</Label><Input id="ep-head" value={f.headline} maxLength={160} onChange={set("headline")} /></div>
          <div className="space-y-1.5"><Label htmlFor="ep-bio" className="text-[13px] font-semibold">Bio</Label><Textarea id="ep-bio" rows={4} maxLength={2000} value={f.bio} onChange={set("bio")} /></div>
          <div className="space-y-1.5"><Label htmlFor="ep-reason" className="text-[13px] font-semibold">Reason</Label><Textarea id="ep-reason" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        </div>
        {error && <p role="alert" className="text-destructive-text text-sm">{error}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={pending || reason.trim().length < 3} onClick={submit}>{pending ? "Saving…" : "Save correction"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
