"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { Clock, UserPlus } from "@/components/icons/lucide-compat";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { sendConnectionRequestAction } from "@/lib/actions/social";

/** One-click "Connect" used in suggestion lists and search results. */
export function QuickConnect({ personId, size = "sm" }) {
  const [state, setState] = useState("idle");
  const [pending, startTransition] = useTransition();

  if (state === "pending") {
    return (
      <Button size={size} variant="outline" disabled>
        <Clock /> Requested
      </Button>
    );
  }
  if (state === "connected") {
    return (
      <Button size={size} variant="soft" disabled>
        <Check /> Connected
      </Button>
    );
  }
  return (
    <Button
      size={size}
      variant="outline"
      disabled={pending}
      onClick={() => {
        // Show "Requested" at once; the server's answer can upgrade it to "Connected" or roll it back.
        setState("pending");
        startTransition(async () => {
          const res = await sendConnectionRequestAction({ recipientId: personId });
          if (res.ok) {
            setState(res.status === "connected" ? "connected" : "pending");
            toast.success(res.status === "connected" ? "You are now connected" : "Connection request sent");
          } else {
            setState("idle");
            toast.error(res.error);
          }
        });
      }}
    >
      <UserPlus /> Connect
    </Button>
  );
}
