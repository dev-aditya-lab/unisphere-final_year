import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { verifyWebhookSignature } from "@/lib/payments/signature";
import { handleWebhookEvent } from "@/lib/services/blue-tick";

export const dynamic = "force-dynamic";

// A real event is a few KB. Anything larger is not from the provider.
const MAX_BYTES = 256 * 1024;

/**
 * Razorpay webhook. There is no session here: the request is authenticated by an HMAC over the raw body using
 * RAZORPAY_WEBHOOK_SECRET, compared in constant time, and refused outright when no secret is configured.
 * Handlers are idempotent, so a retried delivery changes nothing.
 *
 * Answers: 401 bad signature (never retried usefully), 200 handled or not ours, 500 so the provider retries.
 */
export async function POST(request) {
  const secret = getEnv().RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413 });

  const rawBody = await request.text();
  if (rawBody.length > MAX_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413 });
  const signature = request.headers.get("x-razorpay-signature");
  if (!verifyWebhookSignature({ rawBody, signature, secret })) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const result = await handleWebhookEvent(event);
  return NextResponse.json({ ok: result.ok }, { status: result.ok ? 200 : 500 });
}
