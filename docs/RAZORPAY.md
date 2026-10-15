# Razorpay (or any payment provider) approval

This lists what a payment provider's reviewer looks for on a website, what UniSphere now provides, and what only
you can supply. Approval is Razorpay's decision, and nothing here guarantees it.

> **Update:** UniSphere now has one paid item, the optional one-time **blue tick** (`docs/BLUE_TICK.md`). The pricing,
> refund and delivery pages describe it and read the live price from settings. The rest of this page was written
> before that and is kept for the checklist of what a reviewer expects.

## The hard requirement: you must sell something

Razorpay approves businesses that **charge for a product or service** (or accept donations as a registered
non-profit). UniSphere is free and has no paid feature, so a reviewer will see a site with nothing to pay for. The
pages below say that truthfully; they do not invent a price. Before you apply, decide what the payment is for, for
example a paid plan, a sponsored listing, a college or club subscription, or event tickets, and tell me so the
product, prices and checkout can be built and the policy pages rewritten with real terms.

## What the website now provides

| Reviewer expects | Where | Status |
| --- | --- | --- |
| Contact Us with business details | `/contact` | Email, form, grievance officer. **Address, phone, legal name appear only when you set the variables below.** |
| Terms and conditions | `/terms` | Includes "Pricing and payments" |
| Privacy policy | `/privacy` | Describes data, providers, advertising |
| Refund and cancellation policy | `/refund-policy` | States there are no charges today and what will happen if there are |
| Shipping / delivery policy | `/shipping-policy` | Digital service, no physical shipping |
| Pricing / what is sold | `/pricing` | Free; no payments taken |
| About the business | `/about` | Independent platform, no invented company details |
| Working site, no dummy content, HTTPS | whole site | Needs your live domain on HTTPS |

All of these are linked from the footer and listed in the sitemap.

## What only you can supply

Set these where the site is built (`.env.example` has them), then rebuild:

- `NEXT_PUBLIC_BUSINESS_LEGAL_NAME`: the name on your PAN, bank account and GST/registration.
- `NEXT_PUBLIC_BUSINESS_ADDRESS`: a real address, lines separated by ` | `.
- `NEXT_PUBLIC_BUSINESS_PHONE`: a number that is answered.
- `NEXT_PUBLIC_BUSINESS_GSTIN`: only if registered.

Razorpay's onboarding also asks, outside the website, for: PAN, a business bank account whose name matches,
business proof (registration, Udyam or GST, or a proprietor's identity documents), and a website that you own
(the domain must be yours and the pages must be reachable without login). Keep the contact details consistent
across the site, the Razorpay form and your documents.

## Things that commonly delay approval

- Contact details on the site that do not match the application, or no phone/address at all.
- Policy pages that are generic or promise terms for products that are not on sale.
- Pop-ups, push-notification prompts or heavy third-party ads on the pages the reviewer sees. This site loads an ad
  network tag on `/`, `/about`, `/features` and `/faq` (`docs/MONETAG.md`); consider turning it off with
  `NEXT_PUBLIC_MONETAG_ENABLED=false` while the application is being reviewed.
- A site that is "coming soon", behind a login, or that has no visible product and price.

## When payments are added

Needed then, and not present today: a checkout using the provider's server-side order API (amounts decided on the
server, never in the browser), webhook signature verification, an idempotent order/payment table, receipts, refund
handling, and updated `/pricing`, `/refund-policy`, `/terms` and `/privacy`. Card and UPI details must never touch
this server; the provider's hosted checkout handles them.
