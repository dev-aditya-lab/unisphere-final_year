import { CONTACT_EMAIL, REQUEST_HANDLER, RESPONSE_TARGET } from "@/lib/constants";
import { formatInr } from "@/lib/blue-tick";

// Pricing, refund and delivery wording. UniSphere is free; the one paid item is the optional blue tick, a one-time
// payment confirmed by an administrator against an ID document. The price is set by an administrator and shown here
// from the live setting, so this text never states a number that is not what is charged.
//
// `blueTick` is { open, pricePaise } from the live settings, or null when it is not known.

const MAIL = `[${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL})`;

export const COMMERCE_UPDATED = "15 October 2026";

const priceLine = (blueTick) =>
  blueTick?.open
    ? `The blue tick costs ${formatInr(blueTick.pricePaise)}, paid once. It is not a subscription and never renews.`
    : "The blue tick is not on sale at the moment. When it is, its price will be shown here and before you pay.";

export function getPricingSections({ blueTick = null } = {}) {
  return [
    {
      heading: "UniSphere is free",
      body: [
        "Creating an account and using UniSphere costs nothing. That includes the feed, profiles, projects, ideas, events, communities, messages, the college directory and the AI discovery features. There is no subscription and no paid tier.",
      ],
    },
    {
      heading: "The blue tick (optional)",
      body: [
        priceLine(blueTick),
        "The blue tick is a badge shown next to your name on posts, comments, people lists and your profile. It tells other members that an administrator has checked an identity document against the name on the account. It does not change what you can do on UniSphere.",
      ],
      list: [
        "Pay once. The amount charged is the price shown on this page.",
        "Send a clear photo or PDF of your Aadhaar card. A masked Aadhaar, with the first 8 digits hidden, is enough.",
        "An administrator checks that the name and photo match your profile and approves or asks for a better document.",
        "If your identity cannot be verified, your payment is refunded in full. See the [refund and cancellation policy](/refund-policy).",
        "Administrators may also give a blue tick without payment, for example to recognised contributors.",
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
        "The blue tick is the only thing you can pay for. Payments are processed by Razorpay, a licensed payment provider. UniSphere never sees or stores your card, UPI or bank details.",
        "If you are asked to pay money to someone claiming to be UniSphere anywhere else, it is not us: please tell us through the [contact form](/contact?topic=report-content).",
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
        "UniSphere is free. The only paid item is the optional blue tick, a one-time payment. If we cannot verify your identity, or something went wrong with the payment, you get your money back in full.",
      ],
    },
    {
      heading: "When you are refunded",
      list: [
        "Your identity document could not be verified and the request is rejected.",
        "You were charged twice for the same blue tick. A second payment is refunded automatically.",
        "You were charged but the payment was not applied to your account.",
        "The blue tick was removed by an administrator because of a mistake on our side.",
      ],
    },
    {
      heading: "After the blue tick is approved",
      body: [
        "Once an administrator has approved your document and the blue tick is on your profile, the purchase is complete and is not refundable, unless the law requires it or we made an error. If you think this applies to you, contact us and we will look at it.",
      ],
    },
    {
      heading: "How a refund is paid",
      body: [
        "Refunds go back to the payment method you used, through Razorpay, for the full amount you paid. Banks and card networks usually take 5 to 7 working days to show it.",
        "Your identity document is deleted as soon as a decision is made, whether approved or not. See the [privacy policy](/privacy).",
      ],
    },
    {
      heading: "Cancelling your account",
      list: [
        "Sign in, open Settings, then Security, and request account deletion.",
        "There is a 14-day grace period. You can cancel the request during it. After it, your profile and personal data are removed; limited records, including payment records, may be kept where needed for safety, to resolve a dispute or to meet a legal obligation (see the [privacy policy](/privacy)).",
        "A blue tick does not carry over to another account.",
      ],
    },
    {
      heading: "Asking for a refund or reporting a charge",
      body: [
        `Send the date, amount and payment reference through the [contact form](/contact?topic=support) or to ${MAIL}. Payments and refunds are handled by ${REQUEST_HANDLER}, and we aim to reply within ${RESPONSE_TARGET}.`,
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
        "Access to UniSphere begins as soon as you create an account and confirm your email address.",
        "Some features depend on choices you make, such as connecting a college or completing your profile. They are available as soon as you have done so.",
        "UniSphere works in a modern web browser and can be installed on a phone or computer from the browser. You need an internet connection.",
      ],
    },
    {
      heading: "When the blue tick is delivered",
      list: [
        "After payment you are asked to send your identity document. Nothing is delivered until you do.",
        `An administrator reviews it, and we aim to do so within ${RESPONSE_TARGET}. If the document is unclear you are asked for a new one.`,
        "When it is approved the blue tick appears on your profile and next to your name straight away. You can see where you are at any time under Settings, then Blue tick.",
      ],
    },
    {
      heading: "If something is not working",
      body: [
        `If you cannot sign in, do not receive a verification email, were charged and see no change, or a feature does not work, use the [contact form](/contact?topic=support) or email ${MAIL}. We aim to reply within ${RESPONSE_TARGET}.`,
      ],
    },
  ];
}
