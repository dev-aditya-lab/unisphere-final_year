import { z } from "zod";
import { communityGuard, failed, json, notFound, readJson, unavailable, uuid } from "@/lib/api/community";
import { pinMessage } from "@/lib/services/community-workspace";

export const dynamic = "force-dynamic";

/** Pin or unpin (moderators and above; the database decides). */
export async function POST(request, { params }) {
  const { response } = await communityGuard(request, { write: true, limit: { scope: "chan-pin", limit: 30, windowSec: 60 } });
  if (response) return response;
  const { messageId } = await params;
  if (!uuid.safeParse(messageId).success) return notFound();
  const parsed = z.object({ pinned: z.boolean() }).safeParse(await readJson(request));
  if (!parsed.success) return json({ ok: false, error: "Invalid request.", code: "validation" }, 400);
  try {
    const res = await pinMessage({ messageId, pinned: parsed.data.pinned });
    return res.ok ? json({ ok: true }) : failed(res);
  } catch {
    return unavailable();
  }
}
