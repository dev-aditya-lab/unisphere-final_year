"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, UserMinus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cancelRequestAction, removeConnectionAction, respondToRequestAction, unblockUserAction } from "@/lib/actions/social";

function useRunner() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function run(action, message) {
    startTransition(async () => {
      const res = await action();
      if (res.ok) {
        if (message) toast.success(message);
        router.refresh();
      } else toast.error(res.error);
    });
  }
  return [pending, run];
}

export function IncomingRequestActions({ requestId }) {
  const [pending, run] = useRunner();
  return (
    <div className="flex gap-2">
      <Button size="sm" disabled={pending} onClick={() => run(() => respondToRequestAction({ requestId, accept: true }), "Connected")}>
        <Check /> Accept
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => respondToRequestAction({ requestId, accept: false }))}>
        <X /> Decline
      </Button>
    </div>
  );
}

export function OutgoingRequestActions({ requestId }) {
  const [pending, run] = useRunner();
  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => cancelRequestAction(requestId), "Request withdrawn")}>
      Withdraw
    </Button>
  );
}

export function RemoveConnectionButton({ otherId, name }) {
  const [pending, run] = useRunner();
  return (
    <Button size="sm" variant="ghost" disabled={pending} aria-label={`Remove ${name} from connections`} onClick={() => run(() => removeConnectionAction(otherId), "Connection removed")}>
      <UserMinus /> Remove
    </Button>
  );
}

export function UnblockButton({ targetId }) {
  const [pending, run] = useRunner();
  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => unblockUserAction(targetId), "Unblocked")}>
      Unblock
    </Button>
  );
}
