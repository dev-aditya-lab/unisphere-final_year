"use client";

import { useState } from "react";
import { useEngine } from "@/components/messages/messages-provider";

// The server renders the first answer for a direct link or a reload; these hand it to the engine during render (the
// seed is idempotent and never overwrites something newer), so the server HTML and the first client render agree.
// They draw nothing.

export function InboxSeed({ conversations }) {
  const engine = useEngine();
  useState(() => {
    engine.seedInbox(conversations);
    return null;
  });
  return null;
}

export function ThreadSeed({ conversationId, header, items, hasMore }) {
  const engine = useEngine();
  useState(() => {
    engine.seedThread(conversationId, header, items, hasMore);
    return null;
  });
  return null;
}
