"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { redeemInviteAction } from "@/lib/actions/community-workspace";

/** Accepting an invitation. The code stays in the address; the server decides whether it still works. */
export function JoinInvite({ code, name }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);
  return (
    <div className="space-y-2">
      <Button
        size="lg"
        className="w-full"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const res = await redeemInviteAction(code);
            if (res.ok) router.push(`/communities/${res.slug}/channels`);
            else setError(res.error);
          })
        }
      >
        {pending ? "Joining…" : `Join ${name}`}
      </Button>
      {error && <p role="alert" className="text-destructive-text text-sm">{error}</p>}
    </div>
  );
}
