"use client";

import { useState, useTransition } from "react";
import { PlayCircle, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { joinSessionAction, recordingAction } from "@/lib/actions/academy";

/** The meeting link is fetched only when a student presses the button, and only if the database says they may have it. */
export function SessionButtons({ sessionId, canRecording }) {
  const [message, setMessage] = useState(null);
  const [pending, start] = useTransition();

  function open(action) {
    setMessage(null);
    start(async () => {
      const res = await action({ sessionId });
      if (res.ok) window.open(res.url, "_blank", "noopener,noreferrer");
      else setMessage(res.error);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" size="sm" disabled={pending} onClick={() => open(joinSessionAction)}><Video aria-hidden />Join class</Button>
      {canRecording && <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => open(recordingAction)}><PlayCircle aria-hidden />Recording</Button>}
      <p role="status" className={message ? "text-muted-foreground w-full text-xs" : "sr-only"}>{message}</p>
    </div>
  );
}
