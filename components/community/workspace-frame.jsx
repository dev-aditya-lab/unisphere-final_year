"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { ChannelSidebar } from "@/components/community/channel-sidebar";
import { Immersive } from "@/components/shell/immersive";
import { cn } from "@/lib/utils";

/**
 * Keeps the bottom of the screen above the on-screen keyboard (`dvh` alone does not shrink on Android Chrome, where the keyboard
 * overlays the page), the same way the direct-message screen does.
 */
function useKeyboardInset(ref) {
  useEffect(() => {
    const vv = window.visualViewport;
    const el = ref.current;
    if (!vv || !el) return;
    const apply = () => {
      const covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      el.style.setProperty("--kb", covered > 80 ? `${Math.round(covered)}px` : "0px");
    };
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
    };
  }, [ref]);
}

/**
 * The two-pane layout. On a computer the channel list sits beside the conversation. On a phone they are two screens: the list at
 * /channels and the conversation at /channels/<id>, so message text never gets squeezed into a narrow column.
 */
export function WorkspaceFrame({ slug, children }) {
  const pathname = usePathname();
  const inChannel = /\/channels\/[0-9a-f-]{36}/i.test(pathname ?? "");
  const frame = useRef(null);
  useKeyboardInset(frame);
  return (
    <div ref={frame} className="chat-frame bg-card grid grid-cols-1 overflow-hidden md:grid-cols-[16rem_minmax(0,1fr)] xl:grid-cols-[17.5rem_minmax(0,1fr)]">
      <Immersive mode={inChannel ? "thread" : "inbox"} />
      <ChannelSidebar slug={slug} className={cn("border-r max-md:border-r-0", inChannel && "max-md:hidden")} />
      <div className={cn("bg-card min-h-0 min-w-0", !inChannel && "max-md:hidden")}>{children}</div>
    </div>
  );
}
