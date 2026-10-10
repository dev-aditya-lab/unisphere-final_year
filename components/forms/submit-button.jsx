"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SubmitButton({ pending, children, pendingText, ...props }) {
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-busy={pending} {...props}>
      {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
      {pending ? (pendingText ?? children) : children}
    </Button>
  );
}
