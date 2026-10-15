// The business details a payment provider (Razorpay, for one) asks the public site to show: who operates it, where,
// and how to reach them. Nothing here is invented. Each value comes from an environment variable and is simply absent
// from the pages until the owner sets it, so a page can never display a made-up address or number.
//
//   NEXT_PUBLIC_BUSINESS_LEGAL_NAME   the name your business is registered under (as on your PAN / GST / bank account)
//   NEXT_PUBLIC_BUSINESS_ADDRESS      the registered or operating address; use " | " between lines
//   NEXT_PUBLIC_BUSINESS_PHONE        a phone number customers can call, with country code
//   NEXT_PUBLIC_BUSINESS_GSTIN        optional, if you are GST registered
//
// NEXT_PUBLIC_* values must be read as literal `process.env.NEXT_PUBLIC_X` so the bundler can inline them.
import { CONTACT_EMAIL, REQUEST_HANDLER } from "@/lib/constants";

const clean = (v) => String(v ?? "").trim();

const legalName = clean(process.env.NEXT_PUBLIC_BUSINESS_LEGAL_NAME);
const address = clean(process.env.NEXT_PUBLIC_BUSINESS_ADDRESS);
const phone = clean(process.env.NEXT_PUBLIC_BUSINESS_PHONE);
const gstin = clean(process.env.NEXT_PUBLIC_BUSINESS_GSTIN);

export const business = {
  name: "UniSphere",
  legalName,
  addressLines: address ? address.split("|").map((l) => l.trim()).filter(Boolean) : [],
  phone,
  gstin,
  email: CONTACT_EMAIL,
  /** The person who answers complaints and requests (see lib/constants.js). */
  grievanceOfficer: REQUEST_HANDLER,
  /** True when a postal address and phone are both published, which payment providers expect. */
  get hasContactDetails() {
    return this.addressLines.length > 0 && Boolean(this.phone);
  },
};
