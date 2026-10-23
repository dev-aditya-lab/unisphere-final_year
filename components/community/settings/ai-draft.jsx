"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Sparkles } from "@/components/icons/lucide-compat";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { draftCommunityTextAction } from "@/lib/actions/community-workspace";

/**
 * "Draft with AI" for a description or the rules. The organiser writes a few notes; the model turns them into a draft that is put in
 * the field for them to read, change and save. It is never saved or published for them, and only the notes and the community name
 * are sent.
 */
export function AiDraft({ communityId, kind, name, onText, label = "Draft with AI" }) {
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="xs"><Sparkles /> {label}</Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-2">
        <label htmlFor={`ai-brief-${kind}`} className="text-[13px] font-semibold">What should it say?</label>
        <Textarea id={`ai-brief-${kind}`} rows={4} maxLength={1200} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder={kind === "rules" ? "e.g. study group for first years, keep it friendly, no spam" : "e.g. weekly coding meetups for beginners at our campus"} />
        <p className="text-muted-foreground text-xs">Your notes are sent to our AI provider. The result is a draft: you read and edit it before saving.</p>
        {error && <p role="alert" className="text-destructive-text text-xs">{error}</p>}
        <Button
          type="button"
          size="sm"
          disabled={pending || brief.trim().length < 5}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const res = await draftCommunityTextAction({ communityId, kind, name, brief });
              if (res.ok) {
                onText(res.text);
                toast.success("Draft added. Please read it and edit it before you save.");
                setOpen(false);
              } else setError(res.error ?? "A draft is not available right now.");
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : <Sparkles />} Write a draft
        </Button>
      </PopoverContent>
    </Popover>
  );
}
