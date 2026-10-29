// The variables a certificate template can use, and how text with {{variables}} is filled in. Isomorphic and pure: the template
// editor previews with it in the browser, the server renders the real PDF with it. The database knows the same list
// (_academy_cert_variables) and refuses to activate a template that uses anything else.

export const CERT_VARIABLES = [
  { key: "student_name", label: "Student name", required: true, sample: "Aarav Sharma" },
  { key: "course_title", label: "Course or program title", required: true, sample: "Full-Stack Web Development" },
  { key: "course_code", label: "Course code", required: true, sample: "USA-WD-001" },
  { key: "certificate_id", label: "Certificate ID", required: true, sample: "US-2026-WD-00142" },
  { key: "issue_date", label: "Issue date", required: true, sample: "2026-10-29" },
  { key: "issuing_organization", label: "Issuing organisation", required: true, sample: "UniSphere Academy" },
  { key: "completion_date", label: "Completion date", required: false, sample: "2026-10-27" },
  { key: "program_duration", label: "Program duration", required: false, sample: "12 weeks" },
  { key: "skills_covered", label: "Skills covered", required: false, sample: "React, Node.js, PostgreSQL" },
  { key: "project_title", label: "Project title", required: false, sample: "Campus event planner" },
  { key: "project_url", label: "Project link", required: false, sample: "https://example.com/project" },
  { key: "assessment_score", label: "Assessment score", required: false, sample: "86%" },
  { key: "mentor_name", label: "Mentor", required: false, sample: "Priya Nair" },
];
export const CERT_VARIABLE_KEYS = CERT_VARIABLES.map((v) => v.key);
export const REQUIRED_VARIABLES = CERT_VARIABLES.filter((v) => v.required).map((v) => v.key);

export const CERT_FONTS = [
  { value: "Helvetica", label: "Sans" },
  { value: "HelveticaBold", label: "Sans bold" },
  { value: "HelveticaOblique", label: "Sans italic" },
  { value: "TimesRoman", label: "Serif" },
  { value: "TimesRomanBold", label: "Serif bold" },
  { value: "TimesRomanItalic", label: "Serif italic" },
  { value: "Courier", label: "Mono" },
  { value: "CourierBold", label: "Mono bold" },
];

const VAR_RE = /\{\{\s*([a-zA-Z0-9_]*)\s*\}\}/g;

export const sampleData = (certificateId = "US-2026-WD-00142") => ({
  ...Object.fromEntries(CERT_VARIABLES.map((v) => [v.key, v.sample])),
  certificate_id: certificateId,
});

/** Variables a text uses, in order, once each. */
export function variablesIn(text) {
  const out = [];
  for (const m of String(text ?? "").matchAll(VAR_RE)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

/** Control characters and line breaks never reach a PDF; the text is trimmed and kept to a sensible length. */
export const cleanText = (value, max = 300) =>
  String(value ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

export function formatDateLong(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  if (!m) return "";
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[1]}`;
}

/**
 * The value of every variable, from the snapshot taken when the certificate was begun. Unknown variables do not exist, optional
 * ones that have no value are empty strings. Nothing is HTML: the text is drawn into a PDF, never into a page.
 */
export function certificateData(snapshot, certificateId) {
  const s = snapshot ?? {};
  const skills = Array.isArray(s.skills) ? s.skills.map((x) => cleanText(x, 40)).filter(Boolean).join(", ") : "";
  return {
    student_name: cleanText(s.recipient_name, 80),
    course_title: cleanText(s.course_title, 120),
    course_code: cleanText(s.course_code, 30),
    certificate_id: cleanText(certificateId, 40),
    issue_date: formatDateLong(s.issue_date),
    completion_date: formatDateLong(s.completion_date),
    issuing_organization: cleanText(s.issuing_organization, 80),
    program_duration: cleanText(s.program_duration, 60),
    skills_covered: skills,
    project_title: cleanText(s.project_title, 100),
    project_url: cleanText(s.project_url, 200),
    assessment_score: Number.isFinite(Number(s.score_pct)) && s.score_pct !== null ? `${Math.round(Number(s.score_pct))}%` : "",
    mentor_name: cleanText(s.mentor_name, 80),
  };
}

/** Fill a field's text. `missing` lists the variables that were empty (so a required field can stop issuance). */
export function fillText(template, data) {
  const missing = [];
  const text = String(template ?? "").replace(VAR_RE, (_, key) => {
    const v = CERT_VARIABLE_KEYS.includes(key) ? String(data?.[key] ?? "") : "";
    if (!v) missing.push(key);
    return v;
  });
  return { text: text.replace(/\s+/g, " ").trim(), missing };
}

/** Variables every certificate must have a value for, whatever the template says. Returns the ones that are empty. */
export function missingRequired(data) {
  return REQUIRED_VARIABLES.filter((k) => !String(data?.[k] ?? "").trim());
}
