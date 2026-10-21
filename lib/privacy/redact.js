// Masks the contact details and ID numbers that are easy to recognise before text is sent to an outside service.
// It is a safety net, not a guarantee: names and free-form personal details cannot be found reliably, which is why
// AI features also depend on the member's consent and never receive private messages or files.

const PATTERNS = [
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email removed]"],
  // Aadhaar-style numbers: 12 digits, optionally in groups of four.
  [/(?<![\d])\d{4}[\s-]?\d{4}[\s-]?\d{4}(?![\d])/g, "[id number removed]"],
  // PAN.
  [/\b[A-Z]{5}\d{4}[A-Z]\b/g, "[id number removed]"],
  // Card-like runs of 13 to 19 digits.
  [/(?<![\d])(?:\d[\s-]?){13,19}(?![\d])/g, "[number removed]"],
  // Indian mobile numbers, with or without +91 / 0.
  [/(?<![\d])(?:\+?91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}(?![\d])/g, "[phone removed]"],
];

export function maskPersonalData(text) {
  let out = String(text ?? "");
  for (const [re, label] of PATTERNS) out = out.replace(re, label);
  return out;
}
