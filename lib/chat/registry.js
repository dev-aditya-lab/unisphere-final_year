"use client";

// One engine per signed-in account in this browser tab, kept alive while the messages area is mounted and while it
// still has something to deliver. Client only: on the server every render gets a throw-away engine (see
// components/messages/messages-provider.jsx), so nothing about one member can ever be shared between requests.
import { ChatEngine } from "./engine";
import { createChatApi } from "./api";
import { createChatDb, deleteChatDatabases } from "./db";
import { createSupabaseRealtime } from "./realtime";
import { deleteMessageAction } from "@/lib/actions/messages";

let current = null; // { userId, engine, users, disposeTimer }

function build(userId) {
  return new ChatEngine({
    userId,
    api: createChatApi(),
    openDb: typeof indexedDB === "undefined" ? null : (id) => createChatDb(id),
    realtimeFactory: createSupabaseRealtime,
    channelFactory: typeof BroadcastChannel === "undefined" ? null : (name) => new BroadcastChannel(name),
    locks: typeof navigator !== "undefined" ? navigator.locks ?? null : null,
    backgroundSync: () =>
      navigator.serviceWorker?.ready
        ?.then((reg) => reg.sync?.register("unisphere-outbox"))
        .catch(() => {}),
    isOnline: () => typeof navigator === "undefined" || navigator.onLine !== false,
    deleteMessage: (id) => deleteMessageAction(id),
  });
}

/** This account's engine, created and started on first use. Safe to call during render (no reference counting). */
export function getEngine(userId) {
  if (current && current.userId !== userId) {
    // A different account on the same tab (sign-out and sign-in without a reload): drop the old one completely.
    current.engine.dispose();
    current = null;
  }
  if (!current) {
    const engine = build(userId);
    current = { userId, engine, users: 0, disposeTimer: null };
    engine.start();
    // Other accounts' chat data does not belong on this device once this member is here.
    deleteChatDatabases({ exceptUserId: userId });
  }
  return current.engine;
}

/** Called from an effect while the messages area is mounted; pair with releaseEngine. */
export function retainEngine(userId) {
  const engine = getEngine(userId);
  clearTimeout(current.disposeTimer);
  current.users += 1;
  return engine;
}

export function releaseEngine(userId) {
  if (!current || current.userId !== userId) return;
  current.users = Math.max(0, current.users - 1);
  if (current.users > 0) return;
  const entry = current;
  // Leaving the messages area must not abandon a message that is still being sent.
  let waited = 0;
  const tick = () => {
    if (current !== entry || entry.users > 0) return;
    if (entry.engine.hasWork() && waited < 120_000) {
      waited += 2000;
      entry.disposeTimer = setTimeout(tick, 2000);
      return;
    }
    entry.engine.dispose();
    current = null;
  };
  entry.disposeTimer = setTimeout(tick, 30_000);
}

/**
 * Removes everything chat-related from this device (log out, account deletion). Tells other tabs to forget too.
 * Pending messages that were never delivered are discarded with it: signing out is the member's decision.
 */
export async function wipeChatData() {
  try {
    if (typeof BroadcastChannel !== "undefined" && current) {
      const bc = new BroadcastChannel(`unisphere-chat:${current.userId}`);
      bc.postMessage({ type: "wipe", tab: "logout" });
      bc.close();
    }
  } catch {
    /* no broadcast support */
  }
  if (current) {
    current.engine.wipeLocal();
    current.engine.dispose();
    current = null;
  }
  await deleteChatDatabases();
}
