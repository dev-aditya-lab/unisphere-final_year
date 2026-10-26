import { NextResponse } from "next/server";
import { publicEnv } from "@/lib/env-public";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { BLUE_TICK_PATH } from "@/lib/blue-tick";
import { confirmReturn } from "@/lib/services/blue-tick";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// What the member sees on the blue tick page for each answer.
const NOTICE = { done: "done", duplicate: "duplicate", pending: "pending", error: "pending", failed: "failed", refunded: null, unknown: null };

/**
 * Where a payment gateway sends the member back to after they pay (or give up): /api/payments/return?o=<order id>.
 *
 * It does not trust anything it is sent. `o` only says which of our orders to look at; whether it was paid is whatever the
 * gateway answers when asked (see settleOrder in lib/services/blue-tick.js), so replaying or guessing a link gains nothing.
 * No session is needed either, which matters because some gateways send the member back with a cross-site POST, and a
 * browser does not attach sign-in cookies to that. The member then lands on the blue tick page by an ordinary redirect
 * (a GET), where they are signed in again.
 */
async function handle(request) {
  const back = new URL(BLUE_TICK_PATH, publicEnv.appUrl);
  const limit = await rateLimit({ key: `pay-return:${await getClientIp()}`, limit: 40, windowSec: 600 });
  if (!limit.ok) return NextResponse.redirect(back, 303);

  const order = request.nextUrl.searchParams.get("o");
  if (order && UUID.test(order)) {
    const state = await confirmReturn(order.toLowerCase());
    const notice = NOTICE[state] ?? null;
    if (notice) {
      back.searchParams.set("payment", notice);
      // "Check again" on a payment that has not been confirmed yet comes back here with the same reference.
      if (notice === "pending") back.searchParams.set("o", order.toLowerCase());
    }
  }
  // 303 so the browser follows with a GET, whatever it sent us.
  return NextResponse.redirect(back, 303);
}

export const GET = handle;
export const POST = handle;
