"use client";

import { useEffect } from "react";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** If a channel cannot be shown, the channel list beside it stays usable and this says what happened. */
export default function ChannelError({ error, reset }) {
  useEffect(() => {
    console.error("[community] channel failed to render:", error?.digest ?? error?.message);
  }, [error]);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center" role="alert">
      <p className="font-heading text-lg font-bold">This channel could not be shown</p>
      <p className="text-muted-foreground max-w-sm text-sm">Your messages and the rest of the community are fine. Check your connection and try again.</p>
      <Button onClick={reset} variant="outline"><RotateCw /> Try again</Button>
    </div>
  );
}
