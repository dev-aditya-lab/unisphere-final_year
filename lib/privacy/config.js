// The people and details the privacy pages show. Nothing here is invented: each value is either a verified constant
// from lib/constants.js (the owner confirmed the contact email and the person who answers requests) or comes from an
// environment variable, and is simply absent from the pages until the owner sets it.
//
//   NEXT_PUBLIC_PRIVACY_CONTACT_NAME    who answers privacy questions and grievances (default: lib/constants REQUEST_HANDLER)
//   NEXT_PUBLIC_PRIVACY_CONTACT_TITLE   their role, e.g. "Grievance Officer" (default: a neutral description)
//   NEXT_PUBLIC_PRIVACY_EMAIL           a dedicated privacy mailbox (default: the verified contact email)
//   NEXT_PUBLIC_PRIVACY_PHONE           optional phone number for privacy queries
//   NEXT_PUBLIC_DPO_NAME / _EMAIL       set ONLY if a Data Protection Officer has really been appointed
//   NEXT_PUBLIC_BUSINESS_*              the operating entity and address (see lib/business.js)
//
// NEXT_PUBLIC_* values must be read as literal `process.env.NEXT_PUBLIC_X` so the bundler can inline them.
import { CONTACT_EMAIL, REQUEST_HANDLER, RESPONSE_TARGET } from "@/lib/constants";
import { business } from "@/lib/business";

const clean = (v) => String(v ?? "").trim();

const officerName = clean(process.env.NEXT_PUBLIC_PRIVACY_CONTACT_NAME);
const officerTitle = clean(process.env.NEXT_PUBLIC_PRIVACY_CONTACT_TITLE);
const privacyEmail = clean(process.env.NEXT_PUBLIC_PRIVACY_EMAIL);
const privacyPhone = clean(process.env.NEXT_PUBLIC_PRIVACY_PHONE);
const dpoName = clean(process.env.NEXT_PUBLIC_DPO_NAME);
const dpoEmail = clean(process.env.NEXT_PUBLIC_DPO_EMAIL);

export const privacyContact = {
  name: officerName || REQUEST_HANDLER,
  title: officerTitle || "Answers privacy questions and grievances",
  email: privacyEmail || CONTACT_EMAIL,
  phone: privacyPhone || business.phone,
  postal: business.addressLines,
  entity: business.legalName,
  /** Only when a DPO is actually appointed. UniSphere must not describe itself as having one otherwise. */
  dpo: dpoName ? { name: dpoName, email: dpoEmail || privacyEmail || CONTACT_EMAIL } : null,
  responseTarget: RESPONSE_TARGET,
  /** Rule 14(3): a grievance system must respond within a stated period of at most 90 days. */
  grievanceMaxDays: 90,
};

/**
 * What the owner still has to confirm or supply before launch. Shown to privacy staff in the admin console and
 * mirrored in docs/DPDP_COMPLIANCE.md. `done` is computed from what is actually configured.
 */
export function readinessItems() {
  return [
    {
      id: "contact_email",
      label: "A monitored email address for privacy requests and grievances",
      done: Boolean(CONTACT_EMAIL),
      detail: `Using ${privacyEmail || CONTACT_EMAIL}. Confirm someone reads it every working day.`,
    },
    {
      id: "contact_person",
      label: "A named person who answers privacy questions (Rule 9)",
      done: Boolean(officerName || REQUEST_HANDLER),
      detail: `Currently ${officerName || REQUEST_HANDLER}. Confirm this person is happy to be published and has the authority to act.`,
    },
    {
      id: "legal_entity",
      label: "The legal entity that operates UniSphere (name and registered address)",
      done: Boolean(business.legalName && business.addressLines.length),
      detail: "Set NEXT_PUBLIC_BUSINESS_LEGAL_NAME and NEXT_PUBLIC_BUSINESS_ADDRESS. Nothing is shown until you do; none is invented.",
    },
    {
      id: "phone",
      label: "A phone number for privacy queries (optional but expected by payment providers)",
      done: Boolean(privacyPhone || business.phone),
      detail: "Set NEXT_PUBLIC_PRIVACY_PHONE or NEXT_PUBLIC_BUSINESS_PHONE.",
    },
    {
      id: "dpo",
      label: "Data Protection Officer: only if UniSphere is notified as a Significant Data Fiduciary",
      done: true,
      detail: dpoName
        ? `A DPO is published: ${dpoName}.`
        : "None appointed and none published. Do not set NEXT_PUBLIC_DPO_NAME unless one really is appointed.",
    },
  ];
}
