import { CONTACT_EMAIL, REQUEST_HANDLER, RESPONSE_TARGET } from "@/lib/constants";

// Pricing, refund and delivery wording. Written for what UniSphere is today: a free service with no paid features and
// no payments taken. Nothing here promises a price, a refund window or a delivery time for something that is not on
// sale. If paid features are ever introduced, these pages must be rewritten with the real terms first.

const MAIL = `[${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL})`;

export const COMMERCE_UPDATED = "15 October 2026";

export function getPricingSections() {
  return [
    {
      heading: "UniSphere is free",
      body: [
        "Creating an account and using UniSphere costs nothing. That includes the feed, profiles, projects, ideas, events, communities, messages, the college directory and the AI discovery features. There is no subscription, no paid tier and no in-app purchase.",
      ],
    },
    {
      heading: "What is limited",
      list: [
        "AI features have a daily usage limit per member, set by the administrators, so the service stays available to everyone.",
        "Rate limits on actions such as posting, messaging and searching protect the service from abuse.",
        "File uploads have size limits. The limits are shown where you upload.",
      ],
    },
    {
      heading: "Payments",
      body: [
        "UniSphere does not currently take payments of any kind, and it does not ask for card, UPI or bank details. If you are ever asked to pay money to someone claiming to be UniSphere, it is not us: please tell us through the [contact form](/contact?topic=report-content).",
        "If paid features are introduced, their price, what they include, and how to cancel and get a refund will be published on this page and on the [refund and cancellation policy](/refund-policy) before anyone can be charged.",
      ],
    },
    {
      heading: "Sponsorship and partnerships",
      body: [
        `Colleges, clubs and organisations that would like to work with UniSphere can reach us through the [contact form](/contact?topic=partnerships) or at ${MAIL}.`,
      ],
    },
  ];
}

export function getRefundSections() {
  return [
    {
      heading: "In short",
      body: [
        "UniSphere is free to use and we do not currently charge for anything, so there is nothing to refund and nothing to cancel in the billing sense. You can stop using UniSphere, or delete your account, at any time.",
      ],
    },
    {
      heading: "Cancelling your account",
      list: [
        "Sign in, open Settings, then Security, and request account deletion.",
        "There is a 14-day grace period. You can cancel the request during it. After it, your profile and personal data are removed; limited records may be kept where needed for safety, to resolve a dispute or to meet a legal obligation (see the [privacy policy](/privacy)).",
        "You do not pay anything to cancel.",
      ],
    },
    {
      heading: "If paid features are introduced",
      body: [
        "Before any paid feature is offered, its price, what it includes, and its refund and cancellation terms will be published on this page and shown before you confirm a purchase. Nothing will be charged without a clear price and your explicit confirmation.",
      ],
    },
    {
      heading: "If you see a charge you do not recognise",
      body: [
        `UniSphere does not currently take payments. If a charge appears that you believe relates to UniSphere, send the date, amount and transaction reference through the [contact form](/contact?topic=support) or to ${MAIL}. Charges are handled by ${REQUEST_HANDLER}, and we aim to reply within ${RESPONSE_TARGET}.`,
      ],
    },
  ];
}

export function getDeliverySections() {
  return [
    {
      heading: "A digital service",
      body: [
        "UniSphere is delivered over the internet. There are no physical goods, so nothing is shipped and there are no shipping charges, couriers or delivery addresses.",
      ],
    },
    {
      heading: "When access starts",
      list: [
        "Access begins as soon as you create an account and confirm your email address.",
        "Some features depend on choices you make, such as connecting a college or completing your profile. They are available as soon as you have done so.",
        "UniSphere works in a modern web browser and can be installed on a phone or computer from the browser. You need an internet connection.",
      ],
    },
    {
      heading: "If something is not working",
      body: [
        `If you cannot sign in, do not receive a verification email, or a feature does not work, use the [contact form](/contact?topic=support) or email ${MAIL}. We aim to reply within ${RESPONSE_TARGET}.`,
      ],
    },
  ];
}
