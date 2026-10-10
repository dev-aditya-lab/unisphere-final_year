"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitAppealAction } from "@/lib/actions/admin";

/** Ask for a moderation decision to be reviewed again. Works while suspended. */
export function AppealForm({ actionId }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!open) {
    return <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Appeal this decision</Button>;
  }
  const id = `appeal-${actionId}`;
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const res = await submitAppealAction({ actionId, message });
          if (res.ok) { toast.success(res.message); router.refresh(); } else setError(res.fieldErrors?.message ?? res.error);
        });
      }}
    >
      <Label htmlFor={id} className="text-[13px] font-semibold">Tell the reviewer what you think was wrong</Label>
      <Textarea id={id} value={message} onChange={(e) => setMessage(e.target.value)} rows={4} maxLength={2000} aria-invalid={Boolean(error) || undefined} />
      <p className="text-muted-foreground text-xs">A different moderator reads this. You can appeal each decision once, within 30 days.</p>
      {error && <p role="alert" className="text-destructive-text text-sm">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending || message.trim().length < 10}>{pending ? "Sending…" : "Send appeal"}</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  );
}
