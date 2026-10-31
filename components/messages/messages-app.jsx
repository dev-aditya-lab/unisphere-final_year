"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { MessageCircle } from "@/components/icons/lucide-compat";
import { ConversationList } from "@/components/messages/conversation-list";
import { MessagesProvider } from "@/components/messages/messages-provider";
import { ThreadView } from "@/components/messages/thread-view";
import { Immersive } from "@/components/shell/immersive";

const UUID = /^\/messages\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;

/**
 * Keeps the bottom of the screen above the on-screen keyboard. `dvh` alone does not shrink on Android Chrome (the
 * keyboard overlays the page), so the visual viewport tells us how much of the layout it covers.
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

function Frame({ viewerId, children }) {
  const pathname = usePathname();
  const activeId = pathname?.match(UUID)?.[1]?.toLowerCase() ?? null;
  const frame = useRef(null);
  const cameFromList = useRef(false);
  useKeyboardInset(frame);

  // Switching conversation is a history entry, not a server request: the thread is already on this device.
  const open = useCallback((id) => {
    cameFromList.current = true;
    window.history.pushState(null, "", `/messages/${id}`);
  }, []);
  const back = useCallback(() => {
    if (cameFromList.current) {
      cameFromList.current = false;
      window.history.back();
    } else window.history.pushState(null, "", "/messages");
  }, []);

  return (
    <div ref={frame} className="chat-frame bg-card grid grid-cols-1 overflow-hidden md:grid-cols-[20rem_minmax(0,1fr)] xl:grid-cols-[23rem_minmax(0,1fr)]">
      <Immersive mode={activeId ? "thread" : "inbox"} />
      {/* Page children render nothing visible: they only seed the engine from the server's first answer. */}
      {children}
      <section aria-label="Inbox" className={`${activeId ? "max-md:hidden" : ""} flex min-h-0 flex-col border-r`}>
        <ConversationList activeId={activeId} onOpen={open} />
      </section>
      <section aria-label="Conversation" className={`${activeId ? "" : "max-md:hidden"} bg-sunken min-h-0 min-w-0`}>
        {activeId ? (
          <ThreadView key={activeId} conversationId={activeId} viewerId={viewerId} onBack={back} />
        ) : (
          <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
            <span className="bg-card grid size-16 place-items-center rounded-full border shadow-xs">
              <MessageCircle className="size-7" aria-hidden="true" />
            </span>
            <p className="text-foreground font-heading mt-2 text-lg font-bold">Your messages</p>
            <p className="max-w-xs text-sm">Pick a conversation, or start one from a person&rsquo;s profile. You can message people who allow messages from you.</p>
          </div>
        )}
      </section>
    </div>
  );
}

export function MessagesApp({ viewerId, children }) {
  return (
    <MessagesProvider userId={viewerId}>
      <Frame viewerId={viewerId}>{children}</Frame>
    </MessagesProvider>
  );
}
