"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { triageFeedbackAction } from "@/lib/actions/feedback";
import { FEEDBACK_STATUS } from "@/lib/feedback-meta";

const field = "border-input bg-card h-9 w-full rounded-md border px-2 text-sm";

/** Set a status, write the public reply, link a duplicate or the release an item shipped in. */
export function TriageDialog({ item, releases }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(item.status === "new" ? "triaged" : item.status);
  const [response, setResponse] = useState(item.public_response ?? "");
  const [isPublic, setPublic] = useState(item.is_public);
  const [duplicateOf, setDuplicateOf] = useState(item.duplicate_of ?? "");
  const [releaseId, setReleaseId] = useState(item.release_id ?? "");
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await triageFeedbackAction({
        id: item.id, status, response: response.trim() || undefined,
        ...(item.kind === "feature" ? { isPublic } : {}),
        duplicateOf: status === "duplicate" ? duplicateOf.trim() : null,
        releaseId: status === "shipped" && releaseId ? releaseId : null,
      });
      if (res.ok) {
        toast.success("Saved. The member was notified.");
        setOpen(false);
        router.refresh();
      } else setError(res.fieldErrors?.duplicateOf ?? res.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline">Triage</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Triage: {item.title}</DialogTitle>
          <DialogDescription>The reporter gets a notification when the status or the reply changes.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={`st-${item.id}`} className="text-[13px] font-semibold">Status</Label>
            <select id={`st-${item.id}`} value={status} onChange={(e) => setStatus(e.target.value)} className={field}>
              {Object.entries(FEEDBACK_STATUS).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}
            </select>
          </div>
          {status === "duplicate" && (
            <div className="space-y-1.5">
              <Label htmlFor={`dup-${item.id}`} className="text-[13px] font-semibold">Id of the original request</Label>
              <input id={`dup-${item.id}`} value={duplicateOf} onChange={(e) => setDuplicateOf(e.target.value)} className={`${field} font-mono text-xs`} placeholder="00000000-0000-…" />
              <p className="text-muted-foreground text-xs">Votes on this item move to the original.</p>
            </div>
          )}
          {status === "shipped" && (
            <div className="space-y-1.5">
              <Label htmlFor={`rel-${item.id}`} className="text-[13px] font-semibold">Shipped in release</Label>
              <select id={`rel-${item.id}`} value={releaseId} onChange={(e) => setReleaseId(e.target.value)} className={field}>
                <option value="">Not linked</option>
                {releases.map((r) => <option key={r.id} value={r.id}>v{r.version} · {r.title}</option>)}
              </select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor={`resp-${item.id}`} className="text-[13px] font-semibold">Reply to the member {status === "declined" ? "(required)" : "(optional)"}</Label>
            <Textarea id={`resp-${item.id}`} value={response} onChange={(e) => setResponse(e.target.value)} rows={3} maxLength={1000} />
            {item.kind === "feature" && <p className="text-muted-foreground text-xs">This reply is shown on the public idea board and roadmap.</p>}
          </div>
          {item.kind === "feature" && (
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isPublic} onChange={(e) => setPublic(e.target.checked)} className="size-4" /> Visible on the idea board and roadmap (untick to hide)</label>
          )}
        </div>
        {error && <p role="alert" className="text-destructive-text text-sm">{error}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save} disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
