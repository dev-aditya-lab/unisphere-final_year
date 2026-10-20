import { z } from "zod";
import { guard, json, readCursor, unavailable, uuid } from "@/lib/api/messaging";
import { getConversationHeader, getThreadPage, sendMessage } from "@/lib/services/messages";

export const dynamic = "force-dynamic";

/**
 * A page of one conversation.
 *   GET  /api/messages/:id                               header + the newest messages (opening a thread)
 *   GET  /api/messages/:id?beforeTs=…&beforeId=…         older messages (scrolling back)
 *   GET  /api/messages/:id?afterTs=…&afterId=…           newer messages (catching up after a disconnect)
 * A conversation the caller is not part of answers 404, exactly like one that does not exist.
 */
export async function GET(request, { params }) {
  const { user, response } = await guard(request);
  if (response) return response;
  const { conversationId } = await params;
  if (!uuid.safeParse(conversationId).success) return json({ ok: false, error: "Not found", code: "not_found" }, 404);

  const { searchParams } = new URL(request.url);
  const before = readCursor(searchParams, "before");
  const after = readCursor(searchParams, "after");
  if (before === false || after === false || (before && after)) return json({ ok: false, error: "Invalid request.", code: "validation" }, 400);
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 30, 1), 100);
  const opening = !before && !after;

  try {
    const [header, page] = await Promise.all([
      opening ? getConversationHeader(conversationId, user.id) : null,
      getThreadPage(conversationId, { before, after, limit }),
    ]);
    if (opening && !header) return json({ ok: false, error: "Not found", code: "not_found" }, 404);
    return json({ ok: true, conversation: header, items: page.items, hasMore: page.hasMore });
  } catch {
    return unavailable();
  }
}

const sendSchema = z.object({
  body: z.string().max(4000),
  fileIds: z.array(uuid).max(3).default([]),
  clientOpId: uuid,
});

/**
 * Send a message. `clientOpId` makes the call idempotent: repeating it (a retry after a lost response, a second
 * tab, the offline outbox) returns the message that was already stored instead of creating another.
 */
export async function POST(request, { params }) {
  const { user, response } = await guard(request, { write: true });
  if (response) return response;
  const { conversationId } = await params;
  if (!uuid.safeParse(conversationId).success) return json({ ok: false, error: "Not found", code: "not_found" }, 404);

  const parsed = sendSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ ok: false, error: "Invalid message.", code: "validation" }, 400);
  const { body, fileIds, clientOpId } = parsed.data;
  if (!body.trim() && fileIds.length === 0) return json({ ok: false, error: "Write a message first.", code: "validation" }, 400);

  try {
    const res = await sendMessage({ user, conversationId, body, fileIds, clientOpId });
    if (res.ok) return json({ ok: true, message: res.message, replayed: res.replayed });
    const status = res.status ?? 400;
    return json({ ok: false, error: res.error, code: res.code }, status, status === 429 ? { "Retry-After": "15" } : {});
  } catch {
    return unavailable();
  }
}
