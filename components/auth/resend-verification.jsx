"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { resendVerificationAction } from "@/lib/actions/auth";

export function ResendVerification({ email }) {
  const [pending, startTransition] = useTransition();
  const [cooldown, setCooldown] = useState(30);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  function resend() {
    startTransition(async () => {
      const res = await resendVerificationAction({ email });
      if (res.ok) {
        toast.success(res.message);
        setCooldown(60);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Button type="button" variant="outline" onClick={resend} disabled={pending || cooldown > 0 || !email}>
      {cooldown > 0 ? `Resend available in ${cooldown}s` : pending ? "Sending…" : "Resend confirmation email"}
    </Button>
  );
}
