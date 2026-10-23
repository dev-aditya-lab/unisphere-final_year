import { communityGuard, failed, json, notFound, readCursor, readJson, unavailable, uuid } from "@/lib/api/community";
import { getChannel, getChannelPage, sendMessage } from "@/lib/services/community-workspace";
import { sendMessageSchema } from "@/lib/validators/community-workspace";

export const dynamic = "force-dynamic";

/**
 * A page of one channel.
 *   GET /api/community-channels/:id/messages                       the channel and the newest messages (opening it)
 *   GET …?beforeTs=…&beforeId=…                                    older messages (scrolling back)
 *   GET …?afterTs=…&afterId=…                                      newer messages (catching up after a disconnect)
 * A channel the caller may not see answers 404, exactly like one that does not exist.
 */
export async function GET(request, { params }) {
  const { user, response } = await communityGuard(request);
  if (response) return response;
  const { channelId } = await params;
  if (!uuid.safeParse(channelId).success) return notFound();
  const { searchParams } = new URL(request.url);
  const before = readCursor(searchParams, "before");
  const after = readCursor(searchParams, "after");
  if (before === false || after === false || (before && after)) return json({ ok: false, error: "Invalid request.", code: "validation" }, 400);
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 40, 1), 100);
  try {
    const opening = !before && !after;
    const [channel, page] = await Promise.all([opening ? getChannel(channelId, user.id) : null, getChannelPage(channelId, { before, after, limit })]);
    if (opening && !channel) return notFound();
    return json({ ok: true, channel, ...page });
  } catch {
    return unavailable();
  }
}

/** Send a message. `clientOpId` makes the call idempotent: a retry, a second tab or a lost response never posts twice. */
export async function POST(request, { params }) {
  const { response } = await communityGuard(request, { write: true });
  if (response) return response;
  const { channelId } = await params;
  if (!uuid.safeParse(channelId).success) return notFound();
  const parsed = sendMessageSchema.safeParse(await readJson(request));
  if (!parsed.success) return json({ ok: false, error: "Invalid message.", code: "validation" }, 400);
  const { body, fileIds, replyTo, clientOpId } = parsed.data;
  if (!body.trim() && fileIds.length === 0) return json({ ok: false, error: "Write a message first.", code: "validation" }, 400);
  try {
    const res = await sendMessage({ channelId, body, fileIds, replyTo, clientOpId });
    return res.ok ? json({ ok: true, message: res.message, replayed: res.replayed }) : failed(res);
  } catch {
    return unavailable();
  }
}
