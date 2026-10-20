import { guard, json, unavailable, uuid } from "@/lib/api/messaging";
import { markConversationRead } from "@/lib/services/messages";

export const dynamic = "force-dynamic";

/** Marks the conversation read for the caller (also clears its message notifications). */
export async function POST(request, { params }) {
  const { response } = await guard(request, { write: true });
  if (response) return response;
  const { conversationId } = await params;
  if (!uuid.safeParse(conversationId).success) return json({ ok: false, error: "Not found", code: "not_found" }, 404);
  try {
    const res = await markConversationRead(conversationId);
    return res.ok ? json({ ok: true, readAt: res.readAt }) : json({ ok: false, error: res.error, code: res.code }, res.status ?? 503);
  } catch {
    return unavailable();
  }
}
