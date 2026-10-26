import { NextResponse } from "next/server";
import { publicEnv } from "@/lib/env-public";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { BLUE_TICK_PATH } from "@/lib/blue-tick";
import { parseReturn } from "@/lib/payments/gateway";
import { confirmReturn } from "@/lib/services/blue-tick";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// A gateway's return post is a few KB of form fields.
const MAX_BYTES = 64 * 1024;

// What the member sees on the blue tick page for each answer.
const NOTICE = { done: "done", duplicate: "duplicate", pending: "pending", error: "pending", failed: "failed", refunded: null, unknown: null };

/**
 * Where a payment gateway sends the member back to after they pay (or give up): /api/payments/return.
 *
 * It does not trust anything it is sent. It only works out which of our orders the member is coming back about, from `?o=` (our
 * own order id) or, for a gateway that posts its own order id back instead, from that post. Whether it was paid is whatever
 * the gateway answers when asked (see settleOrder in lib/services/blue-tick.js), so replaying or guessing a request gains
 * nothing. No session is needed either, which matters because gateways commonly send the member back with a cross-site POST,
 * and a browser does not attach sign-in cookies to that. The member then lands on the blue tick page by an ordinary redirect
 * (a GET), where they are signed in again.
 */
async function handle(request) {
  const back = new URL(BLUE_TICK_PATH, publicEnv.appUrl);
  const limit = await rateLimit({ key: `pay-return:${await getClientIp()}`, limit: 40, windowSec: 600 });
  if (!limit.ok) return NextResponse.redirect(back, 303);

  const url = new URL(request.url);
  const ref = url.searchParams.get("o");
  let target = ref && UUID.test(ref) ? { rowId: ref.toLowerCase() } : null;
  if (!target) {
    let form = null;
    if (request.method === "POST" && Number(request.headers.get("content-length") ?? 0) <= MAX_BYTES) {
      form = await request.formData().catch(() => null);
    }
    const providerOrderId = await parseReturn({ query: url.searchParams, form });
    if (providerOrderId) target = { providerOrderId };
  }

  if (target) {
    const { state, id } = await confirmReturn(target);
    const notice = NOTICE[state] ?? null;
    if (notice) {
      back.searchParams.set("payment", notice);
      // "Check again" on a payment that has not been confirmed yet comes back here with the same reference.
      if (notice === "pending" && id) back.searchParams.set("o", id);
    }
  }
  // 303 so the browser follows with a GET, whatever it sent us.
  return NextResponse.redirect(back, 303);
}

export const GET = handle;
export const POST = handle;
