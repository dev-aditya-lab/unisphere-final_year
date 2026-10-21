// Drafts for breach notices. They state only what is recorded on the incident. Every fact the record does not hold is
// left as a visible "[to be completed: ...]" marker, and the database refuses to approve a notice that still has one,
// so a draft can never go out with an invented or missing fact. A person must read, complete and approve every notice.
//
// Contents follow Rule 7 of the Digital Personal Data Protection Rules, 2025:
//   7(1)  to each affected person: what happened (nature, extent, timing), what it may mean for them, what has been done,
//         what they can do to protect themselves, and who to ask;
//   7(2)  to the Data Protection Board: without delay a description (nature, extent, timing, location, likely impact), then
//         within 72 hours (or longer if the Board allows) the detailed report.

const TBC = (what) => `[to be completed: ${what}]`;
const or = (value, what) => (value && String(value).trim() ? String(value).trim() : TBC(what));
const list = (arr, what) => (arr?.length ? arr.join(", ") : TBC(what));
const when = (iso) => (iso ? new Intl.DateTimeFormat("en-IN", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(iso)) + " IST" : null);

export const NOTICE_AUDIENCES = {
  principals: { label: "Affected members (Rule 7(1))" },
  board_initial: { label: "Data Protection Board: first report (Rule 7(2)(a))" },
  board_detailed: { label: "Data Protection Board: detailed report within 72 hours (Rule 7(2)(b))" },
};

export function draftNotice(audience, incident, { contactName, contactEmail, contactPhone } = {}) {
  const happened = incident.occurred_at ? when(incident.occurred_at) : incident.occurred_note;
  const contact = [contactName, contactEmail, contactPhone].filter(Boolean).join(", ") || TBC("contact person and email");

  if (audience === "principals") {
    return {
      subject: "Important: a security incident involving your UniSphere information",
      body: [
        "We are writing to tell you about a security incident that involved your personal information on UniSphere.",
        `What happened: ${or(incident.description, "description of the incident in plain language")}`,
        `When: ${or(happened, "when it happened")}. We became aware of it on ${when(incident.aware_at) ?? TBC("date and time UniSphere became aware")}.`,
        `What information was involved: ${list(incident.data_categories, "categories of information involved")}.`,
        `What this may mean for you: ${TBC("the consequences likely to affect this person, in plain words")}`,
        `What we have done: ${or([incident.containment, incident.remediation].filter(Boolean).join(" "), "measures taken to contain the incident and reduce the risk")}`,
        `What you can do to protect yourself: ${TBC("specific steps, for example change your password, watch for phishing emails")}`,
        `Who to ask: ${contact}. You can also use the grievance form at UniSphere's privacy centre.`,
      ].join("\n\n"),
    };
  }
  if (audience === "board_initial") {
    return {
      subject: `Personal data breach report (initial): ${incident.reference}`,
      body: [
        `Reporting entity: UniSphere. Contact for this report: ${contact}.`,
        `Reference: ${incident.reference}. Severity assessed as ${incident.severity}.`,
        `Nature of the breach: ${or(incident.description, "nature of the breach")}`,
        `Extent: ${incident.affected_count_estimate != null ? `about ${incident.affected_count_estimate} people` : TBC("number of people affected")}. Information involved: ${list(incident.data_categories, "categories of information involved")}.`,
        `Timing: occurred ${or(happened, "when it occurred")}; UniSphere became aware on ${when(incident.aware_at) ?? TBC("date and time of awareness")}.`,
        `Location of occurrence (systems): ${list(incident.systems, "systems or services where it occurred")}.`,
        `Likely impact: ${TBC("likely impact on the people affected")}`,
        `Measures so far: ${or([incident.containment, incident.remediation].filter(Boolean).join(" "), "measures taken or proposed")}`,
      ].join("\n\n"),
    };
  }
  return {
    subject: `Personal data breach report (detailed): ${incident.reference}`,
    body: [
      `This updates our report ${incident.board_reference ? `(Board reference ${incident.board_reference}) ` : ""}for incident ${incident.reference}, within 72 hours of UniSphere becoming aware on ${when(incident.aware_at) ?? TBC("date and time of awareness")}.`,
      `Description and updated detail: ${or(incident.description, "updated description")}`,
      `Broad facts, events, circumstances and reasons leading to the breach: ${or(incident.root_cause, "events and reasons leading to the breach")}`,
      `Measures implemented or proposed to mitigate risk: ${or(incident.containment, "mitigation measures")}`,
      `Findings regarding the person who caused the breach: ${or(incident.findings_on_person, "findings, or state that none have been made yet")}`,
      `Remedial measures to prevent recurrence: ${or(incident.remediation, "remedial measures")}`,
      `Intimations given to affected people: ${incident.principals_notified_at ? `notified on ${when(incident.principals_notified_at)}` : TBC("report on the notices given to affected people")}.`,
    ].join("\n\n"),
  };
}

/** Hours left to the 72-hour report, counted from when UniSphere became aware. Negative means overdue. */
export function hoursToBoardDeadline(awareAt, now = Date.now()) {
  if (!awareAt) return null;
  return (Date.parse(awareAt) + 72 * 3600 * 1000 - now) / 3600000;
}
