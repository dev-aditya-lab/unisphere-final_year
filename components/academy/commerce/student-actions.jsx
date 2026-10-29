"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cancelOrderAction, giveVerifyConsentAction, requestRefundAction, saveAcademyProfileAction } from "@/lib/actions/academy";

/** Ask for a refund on a paid order. A person reviews it; the money only moves after the payment provider confirms. */
export function RefundRequest({ orderId, orderNo }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState(null);
  const [pending, start] = useTransition();
  function submit(e) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await requestRefundAction({ orderId, reason });
      if (res.ok) {
        toast.success(res.message);
        setOpen(false);
        router.refresh();
      } else setError(res.fieldErrors?.reason ?? res.error);
    });
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button type="button" variant="outline" size="sm">Request a refund</Button></DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Request a refund</DialogTitle>
            <DialogDescription>Order {orderNo}. A person on the Academy team reviews every request and tells you the outcome.</DialogDescription>
          </DialogHeader>
          <label htmlFor="refund-reason" className="mt-4 block text-sm font-semibold">Why would you like a refund?</label>
          <textarea id="refund-reason" rows={4} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className="border-input bg-card mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" aria-invalid={Boolean(error) || undefined} />
          <p role="alert" className={error ? "text-destructive-text mt-1.5 text-sm" : "sr-only"}>{error}</p>
          <DialogFooter className="mt-5">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending || reason.trim().length < 3}>{pending ? "Sending…" : "Send request"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CancelOrder({ orderId }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await cancelOrderAction({ orderId });
          if (res.ok) router.refresh();
          else toast.error(res.error);
        })
      }
    >
      Cancel order
    </Button>
  );
}

export function ConsentButton({ enrollmentId }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await giveVerifyConsentAction({ enrollmentId });
          if (res.ok) {
            toast.success(res.message);
            router.refresh();
          } else toast.error(res.error);
        })
      }
    >
      I agree: show my name on the verification page
    </Button>
  );
}

export function ProfileForm({ initial }) {
  const router = useRouter();
  const [name, setName] = useState(initial.certificate_name ?? "");
  const [score, setScore] = useState(initial.share_score);
  const [project, setProject] = useState(initial.share_project);
  const [error, setError] = useState(null);
  const [pending, start] = useTransition();
  function save(e) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await saveAcademyProfileAction({ certificate_name: name, share_score: score, share_project: project });
      if (res.ok) {
        toast.success(res.message);
        router.refresh();
      } else setError(res.fieldErrors?.certificate_name ?? res.error);
    });
  }
  const toggles = [
    [score, setScore, "share-score", "My assessment score", "Shows the average score on the verification page."],
    [project, setProject, "share-project", "My project and its link", "Shows your project title and link there, and may list it on the Academy home page."],
  ];
  return (
    <form onSubmit={save} className="space-y-6" noValidate>
      <div>
        <label htmlFor="cname" className="text-sm font-semibold">Name on certificates</label>
        <input id="cname" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Leave empty to use your profile name" className="border-input bg-card mt-1.5 h-10 w-full rounded-lg border px-3 text-sm" aria-describedby="cname-hint" aria-invalid={Boolean(error) || undefined} />
        <p id="cname-hint" className="text-muted-foreground mt-1.5 text-xs">Certificates are printed in Latin letters. Write your name exactly as you want it: a certificate that is already issued can only be changed by a corrected one.</p>
        <p role="alert" className={error ? "text-destructive-text mt-1.5 text-sm" : "sr-only"}>{error}</p>
      </div>
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">What a person checking a certificate may see</legend>
        <p className="text-muted-foreground text-xs">Your name, the course, the dates and the issuing organisation are always shown for an issued certificate. Your email and phone number are never shown.</p>
        {toggles.map(([val, set, id, label, hint]) => (
          <label key={id} htmlFor={id} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
            <input id={id} type="checkbox" checked={val} onChange={(e) => set(e.target.checked)} className="mt-0.5 size-4 accent-[var(--ac-violet)]" />
            <span><span className="block text-sm font-semibold">{label}</span><span className="text-muted-foreground text-xs">{hint}</span></span>
          </label>
        ))}
      </fieldset>
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
    </form>
  );
}
