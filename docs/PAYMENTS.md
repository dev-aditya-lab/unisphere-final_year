# Payments: connecting a payment gateway

UniSphere does not depend on one payment company. The blue tick (`docs/BLUE_TICK.md`) is paid for through a **gateway
adapter**: one small file that says how to create an order, ask what happened to it, refund it and read its webhook.
Nothing else in the app names a gateway, so switching companies means changing a file and four environment values.

**PayU** (India) is built in: see "Using PayU" below. For any other gateway, write its adapter from the worked example
(usually 60 to 100 lines) and register it.

## How a payment flows

```
member            UniSphere server                         payment gateway
  |-- Pay ------->| price read from settings, order created |
  |               |---------- createOrder ------------------>|
  |               |<--------- order id + checkout ----------|
  |<-- open hosted checkout (a redirect, or a form post) ----|   no gateway script ever runs on UniSphere
  |------------------------ pays on the gateway's own page ->|
  |<-- sent back to /api/payments/return?o=<our order id> ---|   (and/or)  webhook -> /api/payments/webhook
  |               |---------- getOrderPayment -------------->|   the gateway is asked; nothing else is believed
  |               |<--------- paid, amount, currency --------|
  |               | order PAID, application opens            |
```

- The browser never sends an amount, and the page the member comes back to is not trusted: `?o=` only names one of
  UniSphere's own orders. Whether it was paid is whatever the gateway answers when asked.
- Card, UPI and bank details never reach UniSphere. The checkout is the gateway's page, so UniSphere loads no payment
  script and its Content-Security-Policy admits no payment company.
- The member reaches the gateway through `/api/payments/checkout?t=...`: a plain navigation to a tiny UniSphere page that
  either redirects, or posts the gateway's form (it submits itself). The link is sealed (AES-256-GCM, key from `APP_SECRET`),
  bound to the signed-in member and valid for 15 minutes, so it cannot be read, altered or used by anyone else. That page has a
  Content-Security-Policy of its own (one script, nothing else, a form that may only go to https); no other page may post a
  form anywhere but UniSphere. The form is never submitted from the blue tick page itself, because a page's policy is fixed
  by the document the browser loaded, which after in-app navigation is often not the one for that page.
- The webhook is the safety net for a member who closes the window before coming back. It also records refunds made in the
  gateway's dashboard. Both paths end in the same idempotent database functions, so a repeated event changes nothing.

## Connecting a gateway

1. Write the adapter (next section) in `lib/payments/gateways/<id>.js` and list it in
   `lib/payments/gateways/index.js`.
2. Set these in the **server** environment (never in code, never `NEXT_PUBLIC_`). `.env.example` has them.

   | Variable | What it holds |
   | --- | --- |
   | `PAYMENT_GATEWAY` | the adapter's `id`. Empty means the blue tick cannot be bought. |
   | `PAYMENT_KEY_ID` | the gateway's public key / app id / merchant id (whatever it calls it) |
   | `PAYMENT_KEY_SECRET` | its secret key / salt |
   | `PAYMENT_WEBHOOK_SECRET` | the value that signs its webhooks. Without it `/api/payments/webhook` refuses everything. |
   | `PAYMENT_API_BASE_URL` | optional: its API address, to switch between sandbox and live |

   An adapter that needs more than this can read its own variables from `process.env`.
3. In the gateway's dashboard add the webhook `https://<your-domain>/api/payments/webhook` with the same secret, and tick
   the events for a successful payment, a failed payment and a processed refund.
4. Apply the migrations (`supabase db push`).
5. At `/admin/payments` the page says in plain words whether the gateway is connected. Set the price and switch it on.

## Using PayU

The adapter is `lib/payments/gateways/payu.js`, written against PayU's Hosted Checkout documentation
([hash](https://docs.payu.in/docs/generate-hash-payu-hosted), [_payment](https://docs.payu.in/reference/_payment_payu_hosted_checkout),
[Verify Payment](https://docs.payu.in/docs/verify_payment_api), [Refund](https://docs.payu.in/reference/refund_transaction_api),
[webhooks](https://docs.payu.in/docs/webhook-events-and-sample-payloads)).

**Set in the server environment** (`.env.local` for development, the host's settings in production):

| Variable | PayU value |
| --- | --- |
| `PAYMENT_GATEWAY` | `payu` |
| `PAYMENT_KEY_ID` | your **Merchant Key** (PayU dashboard, Payment Gateway, Key Salt Details) |
| `PAYMENT_KEY_SECRET` | your **Salt**, from the same page. It is never sent to PayU: it only goes into hashes. |
| `PAYMENT_API_BASE_URL` | `https://test.payu.in` while testing; empty for live |
| `PAYMENT_WEBHOOK_SECRET` | not used: PayU signs its webhooks with the salt |

PayU has separate **test and live** keys and salts: change all of the values above together when going live, and restart the
server after any change (the settings are read once at start-up).

### The URLs

Replace `https://<your-domain>` with `NEXT_PUBLIC_APP_URL` (a webhook cannot reach `localhost`; use a tunnel such as
`cloudflared` or `ngrok` to test webhooks on your own machine).

| What | URL | Where you set it |
| --- | --- | --- |
| **Webhook, Payments, Successful** | `https://<your-domain>/api/payments/webhook` | PayU dashboard, Developers, Webhooks, Create Webhook |
| **Webhook, Payments, Failed** | `https://<your-domain>/api/payments/webhook` | the same, one webhook per event |
| **Webhook, Payments, Refund** | `https://<your-domain>/api/payments/webhook` | the same. PayU must enable the refund callback for your account: ask your PayU contact or support. |
| **Webhook, Payments, Dispute** | `https://<your-domain>/api/payments/webhook` | the same. It is acknowledged and not acted on: handle disputes in the PayU dashboard. |
| Success URL (`surl`) | `https://<your-domain>/api/payments/return` | nothing to set: UniSphere sends it with every payment |
| Failure URL (`furl`) | `https://<your-domain>/api/payments/return` | nothing to set: sent with every payment |
| Cancel URL (`curl`) | `https://<your-domain>/api/payments/return` | nothing to set: sent with every payment |
| Refund callback (`var5`) | `https://<your-domain>/api/payments/webhook` | nothing to set: sent with every refund made from `/admin/payments` (only when the site is on https) |

One address serves every webhook event. In the PayU dashboard: **Developers, Webhooks, Create Webhook**, choose Type
**Payments**, choose the Event, enter the URL, Create; repeat for each event. Check deliveries under Developers, Webhook logs.
PayU lists the addresses it calls from; allow-listing them at your firewall is optional extra hardening (see its webhook page).

### How PayU is checked

- A payment webhook (form post) is accepted only if its `hash` matches PayU's reverse hash computed with your salt, and the
  `key` is yours. A "paid" event is also checked with PayU's Verify Payment API before anything is recorded.
- The refund webhook (JSON) carries no hash, so it is not believed: UniSphere asks PayU (`check_action_status`) whether that
  refund really exists first.
- After paying, the member is posted back to `/api/payments/return`. The posted fields are not trusted either; only the `txnid`
  is used to find the order, then Verify Payment decides.
- PayU limits `surl` and `furl` to 50 characters, so the return address is short and carries no query string.
- A payment PayU has only authorised (not captured) is never counted as paid. Keep PayU on automatic capture.

### First test

With test credentials: open Settings, Blue tick, pay with one of PayU's test cards or the test UPI/netbanking flow described in
its test-mode documentation, and confirm: success sends you back with "Payment received"; a failed payment says so; closing
the PayU page after paying still records the payment once the webhook arrives; a refund from `/admin/payments` shows as refunded
in the PayU dashboard. Pressing Pay should take you through a brief "Opening the secure payment page" screen to PayU's page.

## Writing an adapter

An adapter is a plain object. Its methods receive `cfg` (`{ keyId, keySecret, webhookSecret, baseUrl }`) first, and return
`{ ok: false, error, code }` for an expected failure instead of throwing. The full contract is the comment at the top of
`lib/payments/gateway.js`. Two helpers do the fiddly parts:

- `gatewayRequest()` in `lib/payments/http.js`: JSON or form request with a hard timeout, no caching, and errors that are
  logged but never shown to a member.
- `verifyHmac()` in `lib/payments/signature.js`: constant-time HMAC check (sha256 or sha512, hex or base64).

Whatever an adapter returns is re-checked before the app uses it: ids must be plain printable text, amounts whole numbers of
paise, and a checkout must be an `https:` address.

### The checkout

`createOrder` returns where to send the member:

- `{ type: "redirect", url }`: the gateway's hosted payment page. This is what nearly every gateway offers (a payment link,
  a hosted checkout session, a payment page). Nothing else is needed.
- `{ type: "form", action, method: "POST", fields }`: for gateways whose hosted checkout is reached by posting a form (PayU
  is one). `/api/payments/checkout` submits it for the member; only `https:` addresses are accepted.

Pass the gateway `returnUrl` as the address to send the member back to. It already carries `?o=<order id>`, so use a
gateway field that keeps the query string. If the gateway limits the length of that address, or drops its query string, send
a short address instead (`returnUrl` without its query) and add `parseReturn(cfg, { query, form })` to the adapter: it
reads the gateway's own order id out of what the gateway posts back, as the PayU adapter does. Set `PAYMENT_API_BASE_URL`
for sandbox versus live.

### Worked example

A made-up gateway "ExamplePay", to show every method. Replace the paths, field names and status words with the real
gateway's.

```js
// lib/payments/gateways/examplepay.js
import { gatewayRequest } from "@/lib/payments/http";
import { verifyHmac } from "@/lib/payments/signature";

const STATUS = { succeeded: "paid", requires_capture: "authorized", processing: "pending", failed: "failed" };

const call = (cfg, method, path, body) =>
  gatewayRequest({
    tag: "examplepay",
    method,
    url: `${cfg.baseUrl ?? "https://api.examplepay.example/v1"}${path}`,
    headers: { Authorization: `Basic ${Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString("base64")}` },
    body,
    describeError: (json) => ({ code: json?.error?.code, message: json?.error?.message }), // for the log and the admin panel
  });

const toPayment = (p) => ({ id: p.id, orderId: p.order_id, amountPaise: p.amount, currency: p.currency, status: STATUS[p.status] ?? "pending", method: p.method });

export default {
  id: "examplepay",
  label: "ExamplePay",
  isConfigured: (cfg) => Boolean(cfg.keyId && cfg.keySecret),

  async createOrder(cfg, { amountPaise, currency, reference, description, returnUrl, customer }) {
    const res = await call(cfg, "POST", "/orders", { amount: amountPaise, currency, reference, description, return_url: returnUrl, customer });
    if (!res.ok) return res;
    return { ok: true, orderId: res.data.id, checkout: { type: "redirect", url: res.data.hosted_url } };
  },

  // The successful payment if there is one, else the latest attempt, else null.
  async getOrderPayment(cfg, { orderId }) {
    const res = await call(cfg, "GET", `/orders/${encodeURIComponent(orderId)}/payments`);
    if (!res.ok) return res;
    const attempts = res.data.items ?? [];
    const best = attempts.find((p) => p.status === "succeeded" || p.status === "requires_capture") ?? attempts[0];
    return { ok: true, payment: best ? toPayment(best) : null };
  },

  // Only for gateways that authorise first and capture later. Leave it out if yours captures straight away.
  async capturePayment(cfg, { paymentId, amountPaise }) {
    const res = await call(cfg, "POST", `/payments/${encodeURIComponent(paymentId)}/capture`, { amount: amountPaise });
    return res.ok ? { ok: true, payment: toPayment(res.data) } : res;
  },

  async refundPayment(cfg, { paymentId, amountPaise, reason }) {
    const res = await call(cfg, "POST", `/payments/${encodeURIComponent(paymentId)}/refunds`, { amount: amountPaise, reason });
    return res.ok ? { ok: true } : res;
  },

  // `headers` is a standard Headers object; `rawBody` is the exact text received (sign over that, never over re-serialised JSON).
  async parseWebhook(cfg, { rawBody, headers }) {
    if (!verifyHmac({ message: rawBody, signature: headers.get("x-examplepay-signature"), secret: cfg.webhookSecret })) return { ok: false, status: 401 };
    let e;
    try {
      e = JSON.parse(rawBody);
    } catch {
      return { ok: false, status: 400 };
    }
    if (e.type === "payment.succeeded") return { ok: true, event: { type: "payment.paid", orderId: e.data.order_id, paymentId: e.data.id } };
    if (e.type === "payment.failed") return { ok: true, event: { type: "payment.failed", orderId: e.data.order_id, reason: e.data.failure_code } };
    if (e.type === "refund.succeeded") return { ok: true, event: { type: "refund.done", paymentId: e.data.payment_id } };
    return { ok: true, event: null }; // an event we do not use
  },
};
```

Register it:

```js
// lib/payments/gateways/index.js
import examplepay from "./examplepay";
export const GATEWAYS = { [examplepay.id]: examplepay };
```

Then `PAYMENT_GATEWAY=examplepay`.

### Testing an adapter

Test the adapter with a faked `fetch` (see `tests/unit/payment-gateway.test.js` for how the rest of the app is tested
against a fake adapter, with no network), and always check the real flow in the gateway's **test mode** before going live:
a successful payment, a failed one, closing the window after paying (the webhook must still record it), and a refund from
both UniSphere and the gateway's dashboard.

## Approval by a payment gateway

This lists what a gateway's reviewer looks for on a website, what UniSphere provides, and what only you can supply.
Approval is the gateway's decision, and nothing here guarantees it.

Gateways approve businesses that **charge for a product or service** (or accept donations as a registered non-profit).
UniSphere's one paid item is the optional one-time **blue tick**. The pricing, refund and delivery pages describe it and
read the live price from settings.

| Reviewer expects | Where | Status |
| --- | --- | --- |
| Contact Us with business details | `/contact` | Email, form, grievance officer. **Address, phone and legal name appear only when you set the variables below.** |
| Terms and conditions | `/terms` | Includes "Pricing and payments" |
| Privacy policy | `/privacy` | Describes data and providers; the payment gateway appears in the privacy notice once one is connected |
| Refund and cancellation policy | `/refund-policy` | When a refund is given and how it is paid |
| Shipping / delivery policy | `/shipping-policy` | Digital service, no physical shipping |
| Pricing / what is sold | `/pricing` | The blue tick and its live price |
| About the business | `/about` | Independent platform, no invented company details |
| Working site, no dummy content, HTTPS | whole site | Needs your live domain on HTTPS |

Set these where the site is built (`.env.example` has them), then rebuild:

- `NEXT_PUBLIC_BUSINESS_LEGAL_NAME`: the name on your PAN, bank account and GST/registration.
- `NEXT_PUBLIC_BUSINESS_ADDRESS`: a real address, lines separated by ` | `.
- `NEXT_PUBLIC_BUSINESS_PHONE`: a number that is answered.
- `NEXT_PUBLIC_BUSINESS_GSTIN`: only if registered.

Gateway onboarding also asks, outside the website, for: PAN, a business bank account whose name matches, business proof
(registration, Udyam or GST, or a proprietor's identity documents), and a website that you own (the domain must be yours and
the pages must be reachable without login). Keep the contact details consistent across the site, the gateway's form and your
documents.

Things that commonly delay approval: contact details that do not match the application or are missing; policy pages that
are generic or promise terms for products that are not on sale; pop-ups, push-notification prompts or heavy third-party ads
on the pages the reviewer sees (this site loads no third-party advertising); a site that is "coming soon", behind a login,
or has no visible product and price.
