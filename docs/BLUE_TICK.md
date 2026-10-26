# Blue tick and payments

An optional badge, bought once through the payment gateway you connect (`docs/PAYMENTS.md`) and confirmed by an
administrator against an Aadhaar card, or given free by an administrator.

## How it works

```
member                         server                          administrator
  | Settings > Blue tick         |                                   |
  |--- Pay (no amount sent) ---->| reads price from settings,        |
  |                              | creates an order at the gateway   |
  |<-- where to pay (hosted page)|                                   |
  | pays on the gateway's page   |                                   |
  |--- sent back, ?o=<order> --->| asks the gateway what happened,   |
  |                              | matches order/amount/currency     |
  |                              | -> order PAID, application opens  |
  | upload masked Aadhaar        |                                   |
  |--------------------------------------------------------------->| /admin/blue-tick
  |                              |<---- approve / send back / refund -|
  |                              | tick on, document deleted         |
```

- **Price and on/off** are set at `/admin/payments` ("Blue tick price"). The default is off at ₹0, so nothing is sold
  until an administrator chooses a price. Changing it affects new purchases only.
- **One-time**: there is no subscription and no expiry.
- **Free tick**: `/admin/blue-tick?status=ticks`, "Give a blue tick free of charge". Needs a reason. When
  other administrators exist, nobody can give a tick to themselves or review their own application; the only
  administrator can, and the audit log marks it `self_grant` / `self_review`.
- **Webhook** (`/api/payments/webhook`) is the safety net if a member closes the browser before coming back, and it
  records refunds made in the gateway's dashboard. Both paths ask the gateway about the order and use the same idempotent
  database functions, so a repeated event changes nothing.

## Setup

1. Connect a payment gateway. PayU is built in: set `PAYMENT_GATEWAY=payu` and the keys in the server environment. Any other
   gateway needs a small adapter. Everything about this, with the PayU URLs and a worked example, is in `docs/PAYMENTS.md`.
2. In the gateway's dashboard add the webhook `https://<your-domain>/api/payments/webhook` for a successful payment, a failed
   payment and a refund (and, for gateways that use one, the same secret in `PAYMENT_WEBHOOK_SECRET`).
3. Apply the migrations (`supabase db push`): `20260121000027_blue_tick.sql`, then the later payment ones.
4. At `/admin/payments` check that it says the gateway is connected, set the price and switch it on.

Use the gateway's **test** credentials until you have paid and refunded once end to end. Any keys that were ever pasted
into a chat or a ticket should be treated as exposed: regenerate them, and keep live keys separate from test keys.

## Security model

| Concern | How it is handled |
| --- | --- |
| Member sets their own tick | `profiles.blue_tick` is not in the column-level UPDATE grant. Only the functions below change it. |
| Member picks the price | The browser never sends an amount. The server reads the price and creates the order. |
| Forged "payment done" | Nothing the browser sends is believed. The return page only names an order; the server asks the gateway about that order, and its order id, amount, currency and `paid` status must match what UniSphere created. |
| Someone else's order | A payment is credited to the member the order was created for, whoever opens the return link; a guessed or replayed link only re-asks the gateway. |
| Double payment | A second payment while a tick is held or in progress is recorded and refunded automatically. |
| Webhook spoofing | The adapter verifies the signature over the raw body with the webhook secret (constant time); no secret configured means the route refuses everything, and repeated bad signatures from one address are rate limited. A "paid" event is also checked against the gateway before it counts. |
| Staff misuse | Three separate permissions (`payments.view`, `bluetick.review`, `bluetick.manage`), global administrators only, re-checked in the database. Every decision is written to the audit log. A reviewer cannot review their own application. |
| Price through a side door | `set_system_setting` refuses `blue_tick_*` keys. |
| Card data | Never reaches UniSphere: the member pays on the gateway's own page. UniSphere loads no payment script and its CSP admits no payment company. The hand-over to the gateway is one small page (`/api/payments/checkout`) with a policy of its own, reached by a sealed, short-lived link tied to the signed-in member. |
| A malicious or buggy adapter result | Ids, amounts and the checkout address are re-validated before use; only an `https:` address ever reaches the browser. |

## The Aadhaar document

Aadhaar is sensitive. The design keeps as little as possible:

- The member is told to upload a **masked Aadhaar** (first 8 digits hidden); only name and photo are needed.
- It is stored in the private bucket. Only the owner and administrators with `bluetick.review` can open it, through
  a short-lived signed link, and only while the application is waiting for review.
- It is **deleted from storage as soon as a decision is made** (approve, send back, refund). The Aadhaar number is
  never typed into a field or stored in the database.
- Policy pages (`/privacy`, `/refund-policy`) say all of this. Have it reviewed against your own obligations before
  going live; this document is not legal advice.

## Known limits

- Some gateways refuse API refunds on a test account. If a refund fails in production, refund from the gateway's own
  dashboard; the webhook records it.
- Each click on "Pay" creates a new order at the gateway, so a member who gives up and tries again leaves an unfinished
  order behind. They show as "Not completed" in `/admin/payments` and cost nothing.
- Members are not notified by email or in-app when a decision is made; they see the state on Settings, Blue tick.
- The refund wording on `/refund-policy` is a draft default (refund if verification fails, none after approval).
  Confirm it is the policy you want.
