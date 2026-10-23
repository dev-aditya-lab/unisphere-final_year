import { z } from "zod";
import { communityGuard, failed, json, notFound, readJson, unavailable, uuid } from "@/lib/api/community";
import { deleteMessage, editMessage } from "@/lib/services/community-workspace";
import { editMessageSchema } from "@/lib/validators/community-workspace";

export const dynamic = "force-dynamic";

/** Edit your own message. */
export async function PATCH(request, { params }) {
  const { response } = await communityGuard(request, { write: true, limit: { scope: "chan-edit", limit: 30, windowSec: 60 } });
  if (response) return response;
  const { messageId } = await params;
  if (!uuid.safeParse(messageId).success) return notFound();
  const parsed = editMessageSchema.safeParse(await readJson(request));
  if (!parsed.success) return json({ ok: false, error: "Invalid message.", code: "validation" }, 400);
  try {
    const res = await editMessage({ messageId, body: parsed.data.body });
    return res.ok ? json({ ok: true, message: res.message }) : failed(res);
  } catch {
    return unavailable();
  }
}

const removeSchema = z.object({ reason: z.string().trim().max(1000).nullable().optional(), reportId: z.uuid().nullable().optional() });

/**
 * Delete your own message, or (for a moderator) remove someone else's with a reason. Which one it is, and whether the caller
 * may, is decided by the database from who they are, never from the request.
 */
export async function DELETE(request, { params }) {
  const { response } = await communityGuard(request, { write: true, limit: { scope: "chan-delete", limit: 30, windowSec: 60 } });
  if (response) return response;
  const { messageId } = await params;
  if (!uuid.safeParse(messageId).success) return notFound();
  const parsed = removeSchema.safeParse((await readJson(request)) ?? {});
  if (!parsed.success) return json({ ok: false, error: "Invalid request.", code: "validation" }, 400);
  try {
    const res = await deleteMessage({ messageId, reason: parsed.data.reason ?? null, reportId: parsed.data.reportId ?? null });
    return res.ok ? json({ ok: true, status: res.data?.status ?? "deleted" }) : failed(res);
  } catch {
    return unavailable();
  }
}
