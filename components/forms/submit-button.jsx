"use client";

import { Beads } from "@/components/icons/beads";
import { Button } from "@/components/ui/button";

export function SubmitButton({ pending, children, pendingText, ...props }) {
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-busy={pending} {...props}>
      {pending && <Beads />}
      {pending ? (pendingText ?? children) : children}
    </Button>
  );
}
