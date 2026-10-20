"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { ChatEngine } from "@/lib/chat/engine";
import { createChatApi } from "@/lib/chat/api";
import { getEngine, releaseEngine, retainEngine } from "@/lib/chat/registry";
import { setLiveUnread } from "@/lib/chat/unread-store";

const EngineContext = createContext(null);

/**
 * Gives the messages area its engine. In the browser that is the account's long-lived engine (see lib/chat/registry);
 * during server rendering it is a fresh, storage-less one per render, so no member's data can outlive a request.
 */
export function MessagesProvider({ userId, children }) {
  const [engine] = useState(() => {
    if (typeof window === "undefined") return new ChatEngine({ userId, api: createChatApi(() => Promise.reject(new Error("server"))) });
    return getEngine(userId);
  });

  useEffect(() => {
    retainEngine(userId);
    const off = engine.onUnread((total) => setLiveUnread(total));
    setLiveUnread(engine.unreadTotal());
    return () => {
      off();
      setLiveUnread(null);
      releaseEngine(userId);
    };
  }, [engine, userId]);

  return <EngineContext.Provider value={engine}>{children}</EngineContext.Provider>;
}

export function useEngine() {
  const engine = useContext(EngineContext);
  if (!engine) throw new Error("useEngine must be used inside MessagesProvider");
  return engine;
}

export function useInbox() {
  const engine = useEngine();
  return useSyncExternalStore(engine.subscribe, engine.getInbox, engine.getInbox);
}

export function useThread(id) {
  const engine = useEngine();
  return useSyncExternalStore(
    engine.subscribe,
    () => engine.getThread(id),
    () => engine.getThread(id),
  );
}

export function useConnection() {
  const engine = useEngine();
  return useSyncExternalStore(engine.subscribe, engine.getConnection, engine.getConnection);
}
