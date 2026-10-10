"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { reportAction } from "@/lib/actions/posts";
import { REPORT_CATEGORIES } from "@/lib/content/post-meta";

const TARGET_LABEL = { post: "post", comment: "comment", user: "profile" };

/** Report a post, comment or profile. Controlled: the parent decides when it opens. */
export function ReportDialog({ open, onOpenChange, targetType, targetId }) {
  const [category, setCategory] = useState("");
  const [details, setDetails] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await reportAction({ targetType, targetId, category, details: details || undefined });
      if (res.ok) {
        toast.success(res.message);
        setCategory("");
        setDetails("");
        onOpenChange(false);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report this {TARGET_LABEL[targetType]}</DialogTitle>
          <DialogDescription>Reports are confidential. A moderator reviews every report, and the person is not told who reported them.</DialogDescription>
        </DialogHeader>
        <RadioGroup value={category} onValueChange={setCategory} aria-label="Reason for report" className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {REPORT_CATEGORIES.map((c) => (
            <Label key={c.value} htmlFor={`report-${c.value}`} className="hover:bg-muted flex cursor-pointer items-center gap-2 rounded-md border p-2.5 text-sm font-normal">
              <RadioGroupItem id={`report-${c.value}`} value={c.value} />
              {c.label}
            </Label>
          ))}
        </RadioGroup>
        <div className="space-y-1.5">
          <Label htmlFor="report-details" className="text-[13px] font-semibold">
            Anything else we should know? <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Textarea id="report-details" rows={3} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} />
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
