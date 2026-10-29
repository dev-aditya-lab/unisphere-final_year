import { CONTACT_EMAIL, REQUEST_HANDLER, RESPONSE_TARGET } from "@/lib/constants";
import { formatInr } from "@/lib/blue-tick";

// Pricing, refund and delivery wording. UniSphere is free; the one paid item is the optional blue tick, a one-time
// payment confirmed by an administrator against an ID document. The price is set by an administrator and shown here
// from the live setting, so this text never states a number that is not what is charged.
//
// `blueTick` is { open, pricePaise } from the live settings, or null when it is not known.

const MAIL = `[${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL})`;

export const COMMERCE_UPDATED = "29 October 2026";

const priceLine = (blueTick) =>
  blueTick?.open
    ? `The blue tick costs ${formatInr(blueTick.pricePaise)}, paid once. It is not a subscription and never renews.`
    : "The blue tick is not on sale at the moment. When it is, its price will be shown here and before you pay.";

// `inApp`: the page as the Android app shows it. Google Play requires its own billing for digital goods sold inside an app, so there
// no price, no payment steps and no payments section are shown (lib/native-app.js). The web page is unchanged.
export function getPricingSections({ blueTick = null, inApp = false } = {}) {
  const badge = "The blue tick is a badge shown next to your name on posts, comments, people lists and your profile. It tells other members that an administrator has checked an identity document against the name on the account. It does not change what you can do on UniSphere.";
  if (inApp) {
    return [
      {
        heading: "UniSphere is free",
        body: [
          "Creating an account and using UniSphere costs nothing. That includes the feed, profiles, projects, ideas, events, communities, messages, the college directory and the AI discovery features. There is no subscription and no paid tier.",
        ],
      },
      { heading: "The blue tick", body: [badge] },
      ...getPricingSections({ blueTick }).filter((s) => s.heading === "What is limited" || s.heading === "Sponsorship and partnerships"),
    ];
  }
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
        badge,
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
      heading: "UniSphere Academy (optional)",
      body: [
        "[UniSphere Academy](/academy) offers courses, programs and project internships. Some are free and some are paid. Each one is priced separately by the Academy team and there is no subscription. The page of each course shows the list price, any sale, the tax if any applies, and the total you will pay; checkout shows the total again before you confirm, and the amount is worked out on our servers, not in your browser.",
        "A coupon code can lower the price when it applies to that course, person and date. A sale price runs between the dates shown. An order keeps the price it was bought at.",
        "A project internship is a paid training programme. It is not employment, and neither it nor a certificate is a promise of a job. Paid Academy courses are bought in a web browser, not inside the Android app.",
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
        "The blue tick and paid Academy courses are the things you can pay for. Payments are processed by a licensed payment gateway, on its own secure page. UniSphere never sees or stores your card, UPI or bank details.",
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
        "UniSphere is free. The paid items are the optional blue tick and paid Academy courses, each a one-time payment. If we cannot verify your identity, something went wrong with a payment, or an Academy refund is approved, you get your money back.",
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
      heading: "Academy courses",
      list: [
        "Free Academy courses cost nothing, so there is nothing to refund.",
        "You can ask for a refund on a paid course within 7 days of paying, unless the course page states a different window. Ask from Academy, Payments: choose the order and tell us why. A person on the Academy team reviews every request and tells you the outcome. Nothing is refunded automatically except an accidental second payment for the same course.",
        "A refund can be for part of the amount and never exceeds what you paid. If you paid less because of a coupon or a sale, you get back what you paid, including any tax that was part of it. A coupon used on an order is not given back.",
        "When a full refund is completed, access to that course ends. Anything you made stays yours. If a certificate had already been issued, the Academy team decides whether it stays valid or is revoked, and tells you.",
        "If we cancel a cohort or remove a course before you could finish it, you can choose a refund of the unused part or a place in a replacement.",
        "If you paid but are not enrolled, write to us with the order number (like AO-2026-000123) and we will settle it with the payment provider.",
      ],
    },
    {
      heading: "How a refund is paid",
      body: [
        "Refunds go back to the payment method you used, through the payment gateway, for the full amount you paid. Banks and card networks usually take 5 to 7 working days to show it.",
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
