# Blue tick and payments

An optional badge, bought once through Razorpay and confirmed by an administrator against an Aadhaar card, or given
free by an administrator.

## How it works

```
member                         server                          administrator
  | Settings > Blue tick         |                                   |
  |--- Pay (no amount sent) ---->| reads price from settings,        |
  |                              | creates a Razorpay order          |
  |<-- order id, public key id --|                                   |
  | Razorpay Checkout            |                                   |
  |--- order|payment|signature ->| verify HMAC, re-read payment from |
  |                              | Razorpay, match order/amount      |
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
- **Webhook** (`/api/payments/razorpay/webhook`) is the safety net if a member closes the browser before the page
  confirms, and it records refunds made in the Razorpay dashboard. Both paths use the same idempotent database
  functions, so a repeated event changes nothing.

## Setup

1. Set in the server environment (never in code, never `NEXT_PUBLIC_`):

   | Variable | Value |
   | --- | --- |
   | `RAZORPAY_KEY_ID` | `rzp_test_...` while testing, `rzp_live_...` in production |
   | `RAZORPAY_KEY_SECRET` | the matching key secret |
   | `RAZORPAY_WEBHOOK_SECRET` | any long random string; the same value goes in the Razorpay webhook |

2. In the Razorpay dashboard: Settings, Webhooks, add
   `https://<your-domain>/api/payments/razorpay/webhook`, paste the secret, and tick `payment.captured`,
   `order.paid`, `payment.failed`, `refund.processed`.
3. Apply the migration `20260121000027_blue_tick.sql` (`supabase db push`).
4. At `/admin/payments` set the price and switch it on.

**The test keys that were pasted into a chat session should be treated as exposed.** They only move test money, but
regenerate them in the Razorpay dashboard, and generate fresh live keys separately for production.

## Security model

| Concern | How it is handled |
| --- | --- |
| Member sets their own tick | `profiles.blue_tick` is not in the column-level UPDATE grant. Only the functions below change it. |
| Member picks the price | The browser never sends an amount. The server reads the price and creates the order. |
| Forged "payment done" | The checkout signature is verified (HMAC-SHA256, constant time) and the payment is read back from Razorpay: order id, amount, currency and `captured` must match. |
| Someone else's order | An order is only confirmable by the member it was created for. |
| Double payment | A second payment while a tick is held or in progress is recorded and refunded automatically. |
| Webhook spoofing | HMAC over the raw body with the webhook secret; no secret configured means the route refuses everything. |
| Staff misuse | Three separate permissions (`payments.view`, `bluetick.review`, `bluetick.manage`), global administrators only, re-checked in the database. Every decision is written to the audit log. A reviewer cannot review their own application. |
| Price through a side door | `set_system_setting` refuses `blue_tick_*` keys. |
| Card data | Never reaches UniSphere; Razorpay Checkout handles it. The CSP admits Razorpay only on `/settings/blue-tick`. |

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

- Refunds through the API returned `invalid request sent` for the test account during development (reads and
  payments worked). If that happens in production, refund from the Razorpay dashboard; the webhook records it.
- Members are not notified by email or in-app when a decision is made; they see the state on Settings, Blue tick.
- The refund wording on `/refund-policy` is a draft default (refund if verification fails, none after approval).
  Confirm it is the policy you want.
