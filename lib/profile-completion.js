/**
 * Profile completeness: a transparent checklist, not a hidden score.
 * Each item has a fixed weight; the percentage is the sum of weights of completed items.
 */
export const COMPLETION_ITEMS = [
  { key: "photo", label: "Add a profile photo", weight: 15, href: "/settings/profile#photo", done: (p) => Boolean(p.avatar_key) },
  { key: "headline", label: "Write a headline", weight: 10, href: "/settings/profile#headline", done: (p) => Boolean(p.headline?.trim()) },
  { key: "bio", label: "Add a short bio", weight: 15, href: "/settings/profile#bio", done: (p) => Boolean(p.bio?.trim()) },
  { key: "college", label: "Choose your college", weight: 15, href: "/settings/profile#college", done: (p) => Boolean(p.college_id) },
  { key: "department", label: "Select your department", weight: 10, href: "/settings/profile#college", done: (p) => Boolean(p.department_id) },
  { key: "skills", label: "List at least three skills", weight: 15, href: "/settings/profile#skills", done: (p) => (p.skills?.length ?? 0) >= 3 },
  { key: "interests", label: "Add your interests", weight: 5, href: "/settings/profile#skills", done: (p) => (p.interests?.length ?? 0) >= 1 },
  { key: "links", label: "Link GitHub or a portfolio", weight: 10, href: "/settings/profile#links", done: (p) => Boolean(p.github_url || p.portfolio_url) },
  { key: "verified", label: "Verify your college", weight: 5, href: "/settings/verification", done: (p) => p.verification_status === "verified" },
];

export function profileCompletion(profile) {
  const items = COMPLETION_ITEMS.map((i) => ({ ...i, complete: Boolean(profile && i.done(profile)) }));
  const percent = items.reduce((sum, i) => sum + (i.complete ? i.weight : 0), 0);
  return { percent, items, missing: items.filter((i) => !i.complete) };
}
