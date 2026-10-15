// The topics offered on the contact form. One list, used by the form (which topic is preselected), the server action
// (which values are accepted) and by every public page that links to "report this" / "contact us about that".
// Stored as free text in contact_messages.subject (3 to 150 characters), so adding a topic needs no migration.

export const CONTACT_TOPICS = [
  { value: "General", slug: "general" },
  { value: "Support", slug: "support" },
  { value: "Privacy", slug: "privacy" },
  { value: "Report content", slug: "report-content" },
  { value: "Copyright complaint", slug: "copyright" },
  { value: "Accessibility", slug: "accessibility" },
  { value: "Report a problem", slug: "problem" },
  { value: "Partnerships", slug: "partnerships" },
];

export const CONTACT_SUBJECTS = CONTACT_TOPICS.map((t) => t.value);

/** Link to the contact form with a topic preselected. */
export const contactHref = (slug) => `/contact?topic=${slug}`;

/** The subject for a `?topic=` slug, or "General" when it is missing or unknown. */
export function subjectFromSlug(slug) {
  return CONTACT_TOPICS.find((t) => t.slug === slug)?.value ?? "General";
}
