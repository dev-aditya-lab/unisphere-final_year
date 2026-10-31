import { toast } from "sonner";
import { describeNotification } from "@/lib/notification-text";

/** The conversation or channel the member has open, if the address says so (it already shows what the notification is about). */
function isOpenHere(row, pathname) {
  if (row.type === "message" && row.entity_id) return pathname.startsWith(`/messages/${row.entity_id}`);
  return false;
}

async function actorName(actorId) {
  if (!actorId) return null;
  try {
    const { getBrowserClient } = await import("@/lib/supabase/client");
    const { data } = await getBrowserClient().from("profiles").select("full_name").eq("id", actorId).maybeSingle();
    return data?.full_name ?? null;
  } catch {
    return null; // the toast then says "Someone", which is still true
  }
}

/**
 * A heads-up for a notification that arrives while the app is open, with a button that opens what it is about.
 * Nothing is shown for a message in the conversation the member is looking at, or while the tab is in the background
 * (the push notification covers that).
 */
export async function announceNotification(row, navigate) {
  if (!row || typeof window === "undefined") return;
  if (document.visibilityState === "hidden" || isOpenHere(row, window.location.pathname)) return;
  const view = describeNotification(row, await actorName(row.actor_id));
  toast(view.text, {
    id: row.id,
    description: view.detail || undefined,
    duration: 6000,
    action: { label: "Open", onClick: () => navigate(view.href) },
  });
}
