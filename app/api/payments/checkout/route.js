import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/session";
import { publicEnv } from "@/lib/env-public";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { BLUE_TICK_PATH } from "@/lib/blue-tick";
import { openCheckout } from "@/lib/payments/checkout-token";
import { isNativeAppUserAgent } from "@/lib/native-app";

export const dynamic = "force-dynamic";

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  // The gateway should not learn which UniSphere address sent the member.
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex",
};

/**
 * Where the blue tick page sends a member to pay: /api/payments/checkout?t=<token> (see lib/payments/checkout-token.js).
 *
 * The browser arrives here by an ordinary navigation, never by submitting a form from a UniSphere page, so the app's own
 * Content-Security-Policy (form-action 'self') has nothing to say about it. This response carries a policy of its own (proxy.js:
 * no content except the one inline script that submits the form, and a form that may only go to https). That policy is
 * deliberately not tied to a list of gateway addresses, because a gateway can redirect the post to other addresses of its own and the
 * browser checks every hop. The destination is not chosen by the request: it is whatever the sealed token, made by this server
 * for this member, says.
 */
export async function GET(request) {
  const back = (notice) => {
    const url = new URL(BLUE_TICK_PATH, publicEnv.appUrl);
    if (notice) url.searchParams.set("payment", notice);
    return NextResponse.redirect(url, 303);
  };

  // The Android app never takes a payment (Google Play requires its own billing for digital goods sold in an app).
  if (isNativeAppUserAgent(request.headers.get("user-agent"))) return back(null);

  const limit = await rateLimit({ key: `pay-checkout:${await getClientIp()}`, limit: 30, windowSec: 600 });
  if (!limit.ok) return back("failed");

  let user = null;
  try {
    user = await getAuthUser();
  } catch {
    return back(null); // the sign-in service could not be reached: the blue tick page explains and offers a retry
  }
  if (!user) return back(null);

  const checkout = openCheckout(new URL(request.url).searchParams.get("t"), { userId: user.id });
  // An expired, altered or someone else's link: the member simply starts again from the blue tick page.
  if (!checkout) return back("failed");

  if (checkout.type === "redirect") {
    return NextResponse.redirect(checkout.url, { status: 303, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  }

  const nonce = request.headers.get("x-nonce");
  const fields = Object.entries(checkout.fields ?? {})
    .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`)
    .join("");
  // Normally the page submits itself. If scripts cannot run, the button does the same.
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Opening payment</title>
<style${nonce ? ` nonce="${escapeHtml(nonce)}"` : ""}>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; font: 16px/1.5 system-ui, sans-serif; background: #fff; color: #111; text-align: center; padding: 24px; }
  button { font: inherit; font-weight: 600; padding: 10px 18px; border-radius: 8px; border: 0; background: #1a8cd8; color: #fff; cursor: pointer; }
  @media (prefers-color-scheme: dark) { body { background: #0b0b0c; color: #f3f3f3; } }
</style>
</head>
<body>
<main>
<p>Opening the secure payment page…</p>
<form id="pay" method="${checkout.method === "GET" ? "GET" : "POST"}" action="${escapeHtml(checkout.action)}">${fields}<noscript><button type="submit">Continue to payment</button></noscript></form>
</main>
${nonce ? `<script nonce="${escapeHtml(nonce)}">document.getElementById("pay").submit();</script>` : ""}
</body>
</html>`;
  // Without a nonce (a request that did not come through the proxy) there is no script, so the button is shown instead.
  return new NextResponse(nonce ? html : html.replace("<noscript><button", "<button").replace("</button></noscript>", "</button>"), { status: 200, headers: HEADERS });
}
