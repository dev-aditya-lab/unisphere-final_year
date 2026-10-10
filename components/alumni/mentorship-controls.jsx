"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, GraduationCap, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cancelMentorshipAction, requestMentorshipAction, respondToMentorshipAction } from "@/lib/actions/projects";

export function RequestMentorshipButton({ mentorId, mentorName }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();

  function send() {
    setError(null);
    startTransition(async () => {
      const res = await requestMentorshipAction({ mentorId, topic: topic || undefined, message });
      if (res.ok) {
        toast.success("Request sent");
        setOpen(false);
        setTopic("");
        setMessage("");
        router.refresh();
      } else setError(res.fieldErrors?.message ?? res.error);
    });
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <GraduationCap /> Request mentoring
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ask {mentorName} for mentoring</DialogTitle>
            <DialogDescription>Introduce yourself and say what you would like help with. {mentorName.split(" ")[0]} decides whether to accept. No contact details are shared automatically.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="m-topic" className="text-[13px] font-semibold">Topic <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input id="m-topic" value={topic} maxLength={100} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Preparing for internships" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="m-message" className="text-[13px] font-semibold">Your message</Label>
            <Textarea id="m-message" rows={5} maxLength={600} value={message} onChange={(e) => setMessage(e.target.value)} aria-invalid={Boolean(error)} />
            <p className="text-muted-foreground text-xs">{message.length} / 600</p>
          </div>
          {error && <p role="alert" className="text-destructive-text text-sm">{error}</p>}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={send} disabled={pending || message.trim().length < 10}>{pending ? "Sending…" : "Send request"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function RespondMentorship({ requestId }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  function respond(accept) {
    startTransition(async () => {
      const res = await respondToMentorshipAction({ requestId, accept, message: note || undefined });
      if (res.ok) {
        toast.success(accept ? "Accepted" : "Declined");
        router.refresh();
      } else toast.error(res.error);
    });
  }
  return (
    <div className="mt-3 space-y-2">
      <label htmlFor={`note-${requestId}`} className="sr-only">Optional reply</label>
      <Textarea id={`note-${requestId}`} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a short reply (optional)" />
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={() => respond(true)}><Check /> Accept</Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => respond(false)}><X /> Decline</Button>
      </div>
    </div>
  );
}

export function CancelMentorship({ requestId }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={() => startTransition(async () => { const res = await cancelMentorshipAction(requestId); if (res.ok) { toast.success("Request withdrawn"); router.refresh(); } else toast.error(res.error); })}>
      Withdraw
    </Button>
  );
}
