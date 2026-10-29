import { NextResponse } from "next/server";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { parseWebhook } from "@/lib/payments/gateway";
import { handleWebhookEvent } from "@/lib/services/blue-tick";
import { handleAcademyWebhookEvent, ownsAcademyEvent } from "@/lib/services/academy-commerce";

export const dynamic = "force-dynamic";

// A real event is a few KB. Anything larger is not from the gateway.
const MAX_BYTES = 256 * 1024;

/**
 * Payment gateway webhook, for whichever gateway PAYMENT_GATEWAY names. There is no session here: the adapter authenticates
 * the request from the raw body and its headers using PAYMENT_WEBHOOK_SECRET, and everything is refused outright when no
 * secret is configured. Handlers are idempotent, so a retried delivery changes nothing, and a "paid" event is only acted on
 * after the gateway is asked about the order itself.
 *
 * Answers: 401 bad signature (never retried usefully), 400 unreadable, 200 handled or not ours, 500 so the gateway retries.
 */
export async function POST(request) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413 });

  const rawBody = await request.text();
  if (rawBody.length > MAX_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413 });

  const parsed = await parseWebhook({ rawBody, headers: request.headers });
  if (!parsed.ok) {
    if (parsed.status === 401) {
      // Only failed attempts are counted, so a real gateway (however busy, and always signing correctly) is never slowed.
      const limit = await rateLimit({ key: `pay-webhook-bad:${await getClientIp()}`, limit: 30, windowSec: 600 });
      if (!limit.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.resetSec) } });
    }
    return NextResponse.json({ error: parsed.code }, { status: parsed.status });
  }
  if (!parsed.event) return NextResponse.json({ ok: true, ignored: true });

  // One gateway account serves both the blue tick and the Academy: the order the event names says whose it is.
  const result = (await ownsAcademyEvent(parsed.event)) ? await handleAcademyWebhookEvent(parsed.event) : await handleWebhookEvent(parsed.event);
  return NextResponse.json({ ok: result.ok }, { status: result.ok ? 200 : 500 });
}
