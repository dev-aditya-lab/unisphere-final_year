"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { gradeSubmissionAction, startRefundAction } from "@/lib/actions/academy-admin";
import { minorToInput } from "@/lib/academy/money";

const field = "border-input bg-card w-full rounded-md border px-3 text-sm";

/** Start a refund on a paid order: amount (up to what is left), reason, and whether access ends. It is sent to the gateway straight away. */
export function StaffRefundButton({ orderId, orderNo, refundableMinor }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(minorToInput(refundableMinor));
  const [reason, setReason] = useState("");
  const [revoke, setRevoke] = useState(true);
  const [error, setError] = useState(null);
  const [pending, start] = useTransition();
  function submit(e) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await startRefundAction({ orderId, amount, reason, revokeAccess: revoke });
      if (res.ok) { toast.success(res.message); setOpen(false); router.refresh(); } else setError(res.fieldErrors?.amount ?? res.fieldErrors?.reason ?? res.error);
    });
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button type="button" size="sm" variant="outline">Refund</Button></DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} noValidate className="space-y-4">
          <DialogHeader><DialogTitle>Refund {orderNo}</DialogTitle><DialogDescription>The refund is sent to the payment gateway now. The order is marked refunded only after the gateway accepts it.</DialogDescription></DialogHeader>
          <div><label htmlFor="rf-amt" className="text-[13px] font-semibold">Amount (₹, at most {minorToInput(refundableMinor)})</label><input id="rf-amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${field} mt-1 h-9`} /></div>
          <div><label htmlFor="rf-why" className="text-[13px] font-semibold">Reason</label><textarea id="rf-why" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className={`${field} mt-1 py-2`} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={revoke} onChange={(e) => setRevoke(e.target.checked)} className="accent-primary size-4" />End the student&apos;s access when fully refunded</label>
          <p role="alert" className={error ? "text-destructive-text text-sm" : "sr-only"}>{error}</p>
          <DialogFooter><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={pending || reason.trim().length < 3}>{pending ? "Sending…" : "Refund"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Score a submission against the rubric (or one overall score) and write feedback, or send it back. The server recomputes and checks everything. */
export function GradeForm({ submission }) {
  const router = useRouter();
  const rubric = submission.rubric ?? [];
  const [scores, setScores] = useState(() => Object.fromEntries(rubric.map((r) => [r.key, submission.rubric_scores?.[r.key] ?? ""])));
  const [score, setScore] = useState(submission.score ?? "");
  const [feedback, setFeedback] = useState(submission.feedback ?? "");
  const [error, setError] = useState(null);
  const [pending, start] = useTransition();
  function send(action) {
    setError(null);
    start(async () => {
      const res = await gradeSubmissionAction({ submissionId: submission.id, action, scores: rubric.length ? scores : null, score: rubric.length ? "" : score, feedback });
      if (res.ok) { toast.success(res.message); router.refresh(); } else setError(res.fieldErrors?.feedback ?? res.error);
    });
  }
  return (
    <div className="space-y-4">
      {rubric.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {rubric.map((r) => (
            <div key={r.key}><label htmlFor={`g-${submission.id}-${r.key}`} className="text-[13px] font-semibold">{r.label} <span className="text-muted-foreground font-normal">/ {r.max}</span></label>
              <input id={`g-${submission.id}-${r.key}`} type="number" min={0} max={r.max} value={scores[r.key]} onChange={(e) => setScores((s) => ({ ...s, [r.key]: e.target.value }))} className={`${field} mt-1 h-9`} /></div>
          ))}
        </div>
      ) : (
        <div className="max-w-40"><label htmlFor={`g-${submission.id}`} className="text-[13px] font-semibold">Score <span className="text-muted-foreground font-normal">/ {submission.max_score}</span></label><input id={`g-${submission.id}`} type="number" min={0} max={submission.max_score} value={score} onChange={(e) => setScore(e.target.value)} className={`${field} mt-1 h-9`} /></div>
      )}
      <div><label htmlFor={`gf-${submission.id}`} className="text-[13px] font-semibold">Feedback to the student</label><textarea id={`gf-${submission.id}`} rows={4} maxLength={4000} value={feedback} onChange={(e) => setFeedback(e.target.value)} className={`${field} mt-1 py-2`} /></div>
      <p role="alert" className={error ? "text-destructive-text text-sm" : "sr-only"}>{error}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={pending} onClick={() => send("grade")}>{submission.status === "graded" ? "Update grade" : "Grade"}</Button>
        <Button type="button" size="sm" variant="outline" disabled={pending || feedback.trim().length < 3} onClick={() => send("return")}>Send back for changes</Button>
      </div>
    </div>
  );
}
