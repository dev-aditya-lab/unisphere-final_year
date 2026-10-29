"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/forms/field";
import { FormAlert } from "@/components/forms/form-alert";
import { SubmitButton } from "@/components/forms/submit-button";
import {
  approveIncidentNoticeAction, createIncidentAction, draftIncidentNoticeAction, incidentAffectedAction, incidentEventAction, incidentStatusAction,
  markBoardNoticeSentAction, patchIncidentAction, recordAccessReviewAction, runRetentionNowAction, saveIncidentNoticeAction, sendIncidentNoticeAction,
  setPrivacySettingAction, updatePrivacyRequestAction,
} from "@/lib/actions/privacy-admin";

const field = "border-input bg-card h-9 w-full rounded-md border px-2 text-sm";

/** Runs a Server Action, reports the outcome, refreshes the page. */
function useRun() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);
  function run(fn, onOk) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res?.ok) {
        toast.success(res.message ?? "Done.");
        onOk?.(res);
        router.refresh();
      } else setError(res?.fieldErrors ? Object.values(res.fieldErrors).join(" ") : (res?.error ?? "Something went wrong."));
    });
  }
  return { pending, error, run };
}

// ── Requests ───────────────────────────────────────────────────────────────

const REQUEST_NEXT = [
  { value: "", label: "Keep the status" },
  { value: "verifying", label: "Checking it is the requester" },
  { value: "in_progress", label: "In progress" },
  { value: "awaiting_requester", label: "Waiting for the requester" },
  { value: "completed", label: "Done" },
  { value: "partially_completed", label: "Done, with exceptions" },
  { value: "rejected", label: "Not carried out" },
];

export function RequestStaffForm({ id, kind, assigned }) {
  const { pending, error, run } = useRun();
  const [status, setStatus] = useState("");
  const [noteRequester, setNoteRequester] = useState("");
  const [noteInternal, setNoteInternal] = useState("");
  const [outcomeReason, setOutcomeReason] = useState("");
  const needsReason = status === "partially_completed" || status === "rejected";
  const options = kind === "erasure" ? REQUEST_NEXT.filter((o) => !["completed", "partially_completed"].includes(o.value)) : REQUEST_NEXT;

  return (
    <form
      noValidate
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => updatePrivacyRequestAction({ id, status: status || undefined, noteRequester: noteRequester || undefined, noteInternal: noteInternal || undefined, outcomeReason: outcomeReason || undefined }), () => {
          setStatus(""); setNoteRequester(""); setNoteInternal(""); setOutcomeReason("");
        });
      }}
    >
      {error && <FormAlert>{error}</FormAlert>}
      <div className="space-y-1.5">
        <Label htmlFor="rq-status" className="text-[13px] font-semibold">Set status</Label>
        <select id="rq-status" value={status} onChange={(e) => setStatus(e.target.value)} className={field}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      {needsReason && (
        <Field id="rq-reason" label="Lawful reason it is not carried out in full" hint="The requester sees this. Name the law or the exception." required>
          <Textarea id="rq-reason" placeholder="e.g. We could not verify the requester after two attempts" rows={2} maxLength={1000} value={outcomeReason} onChange={(e) => setOutcomeReason(e.target.value)} aria-describedby="rq-reason-desc" />
        </Field>
      )}
      <Field id="rq-public" label="Message to the requester" hint="Shown on their request. Do not include other people's information.">
        <Textarea id="rq-public" placeholder="e.g. We have deleted your profile and posts. Backups clear within 30 days." rows={3} maxLength={2000} value={noteRequester} onChange={(e) => setNoteRequester(e.target.value)} aria-describedby="rq-public-desc" />
      </Field>
      <Field id="rq-internal" label="Internal note" hint="Only privacy staff see this. Keep personal data out of it.">
        <Textarea id="rq-internal" placeholder="e.g. Checked with engineering; backups purge on the 30th" rows={2} maxLength={2000} value={noteInternal} onChange={(e) => setNoteInternal(e.target.value)} aria-describedby="rq-internal-desc" />
      </Field>
      <div className="flex flex-wrap gap-2">
        <SubmitButton pending={pending} pendingText="Saving…" size="sm">Save</SubmitButton>
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => run(() => updatePrivacyRequestAction({ id, assign: !assigned }))}>
          {assigned ? "Unassign me" : "Assign to me"}
        </Button>
      </div>
    </form>
  );
}

// ── Incidents ──────────────────────────────────────────────────────────────

const SEVERITIES = ["low", "medium", "high", "critical"];
const toLocalInput = (iso) => (iso ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
const lines = (text) => text.split(/\n|,/).map((s) => s.trim()).filter(Boolean);

export function IncidentCreateForm({ categories }) {
  const { pending, error, run } = useRun();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [detectedAt, setDetectedAt] = useState(toLocalInput(new Date().toISOString()));
  const [description, setDescription] = useState("");
  const [systems, setSystems] = useState("");
  const [chosen, setChosen] = useState([]);
  const toggle = (v) => setChosen((c) => (c.includes(v) ? c.filter((x) => x !== v) : [...c, v]));
  return (
    <form
      noValidate
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => createIncidentAction({ title, severity, detectedAt: new Date(detectedAt).toISOString(), description, systems: lines(systems), categories: chosen }), (res) => router.push(`/admin/privacy/incidents/${res.id}`));
      }}
    >
      {error && <FormAlert>{error}</FormAlert>}
      <Field id="inc-title" label="Title" required><Input id="inc-title" placeholder="e.g. Unauthorised access to a support mailbox" value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="inc-sev" className="text-[13px] font-semibold">Severity (first assessment)</Label>
          <select id="inc-sev" value={severity} onChange={(e) => setSeverity(e.target.value)} className={field}>{SEVERITIES.map((s) => <option key={s}>{s}</option>)}</select>
        </div>
        <Field id="inc-detected" label="First detected" required><Input id="inc-detected" type="datetime-local" value={detectedAt} onChange={(e) => setDetectedAt(e.target.value)} /></Field>
      </div>
      <Field id="inc-desc" label="What is known so far" hint="Facts only. Leave out anything you have not confirmed."><Textarea id="inc-desc" placeholder="e.g. An old API key was used to read member emails between 2 and 4 am" rows={3} maxLength={4000} value={description} onChange={(e) => setDescription(e.target.value)} aria-describedby="inc-desc-desc" /></Field>
      <Field id="inc-systems" label="Systems involved" hint="One per line, e.g. database, file storage, email provider"><Textarea id="inc-systems" placeholder="e.g. database, file storage, email provider" rows={2} value={systems} onChange={(e) => setSystems(e.target.value)} aria-describedby="inc-systems-desc" /></Field>
      <fieldset>
        <legend className="text-[13px] font-semibold">Kinds of data possibly involved</legend>
        <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
          {categories.map((c) => (
            <label key={c.value} className="flex items-center gap-2 text-sm"><Checkbox checked={chosen.includes(c.value)} onCheckedChange={() => toggle(c.value)} />{c.label}</label>
          ))}
        </div>
      </fieldset>
      <SubmitButton pending={pending} pendingText="Opening…">Open incident</SubmitButton>
    </form>
  );
}

export function IncidentEditor({ incident, categories }) {
  const { pending, error, run } = useRun();
  const [v, setV] = useState({
    title: incident.title, severity: incident.severity, description: incident.description ?? "", occurred_at: toLocalInput(incident.occurred_at),
    occurred_note: incident.occurred_note ?? "", systems: (incident.systems ?? []).join("\n"), data_categories: incident.data_categories ?? [],
    affected_count_estimate: incident.affected_count_estimate ?? "", containment: incident.containment ?? "", root_cause: incident.root_cause ?? "",
    remediation: incident.remediation ?? "", findings_on_person: incident.findings_on_person ?? "", board_reference: incident.board_reference ?? "",
    aware_at: toLocalInput(incident.aware_at),
  });
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  const closed = ["closed", "not_a_breach"].includes(incident.status);
  const toggle = (c) => setV((s) => ({ ...s, data_categories: s.data_categories.includes(c) ? s.data_categories.filter((x) => x !== c) : [...s.data_categories, c] }));

  function save(e) {
    e.preventDefault();
    const patch = {
      title: v.title, severity: v.severity, description: v.description, occurred_at: v.occurred_at ? new Date(v.occurred_at).toISOString() : "",
      occurred_note: v.occurred_note, systems: lines(v.systems), data_categories: v.data_categories,
      affected_count_estimate: v.affected_count_estimate === "" ? "" : Number(v.affected_count_estimate),
      containment: v.containment, root_cause: v.root_cause, remediation: v.remediation, findings_on_person: v.findings_on_person, board_reference: v.board_reference,
      ...(incident.aware_at && v.aware_at ? { aware_at: new Date(v.aware_at).toISOString() } : {}),
    };
    run(() => patchIncidentAction({ id: incident.id, patch }));
  }
  return (
    <form noValidate onSubmit={save} className="space-y-3">
      {error && <FormAlert>{error}</FormAlert>}
      <fieldset disabled={closed || pending} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="e-title" label="Title"><Input id="e-title" placeholder="e.g. Unauthorised access to a support mailbox" value={v.title} onChange={set("title")} /></Field>
          <div className="space-y-1.5"><Label htmlFor="e-sev" className="text-[13px] font-semibold">Severity</Label><select id="e-sev" value={v.severity} onChange={set("severity")} className={field}>{SEVERITIES.map((s) => <option key={s}>{s}</option>)}</select></div>
        </div>
        <Field id="e-desc" label="Description (nature of the breach)"><Textarea id="e-desc" placeholder="e.g. An old API key was used to read member emails" rows={3} value={v.description} onChange={set("description")} aria-describedby="e-desc-desc" /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="e-occ" label="Occurred at"><Input id="e-occ" type="datetime-local" value={v.occurred_at} onChange={set("occurred_at")} /></Field>
          <Field id="e-occn" label="…or when, in words (if the time is not exact)"><Input id="e-occn" placeholder="e.g. Overnight, between 2 and 4 am" value={v.occurred_note} onChange={set("occurred_note")} /></Field>
        </div>
        {incident.aware_at && <Field id="e-aware" label="UniSphere became aware at" hint="Starts the 72-hour clock. Correct it only if the confirmation time was wrong."><Input id="e-aware" type="datetime-local" value={v.aware_at} onChange={set("aware_at")} aria-describedby="e-aware-desc" /></Field>}
        <Field id="e-systems" label="Systems involved (one per line)"><Textarea id="e-systems" placeholder="e.g. database, file storage" rows={2} value={v.systems} onChange={set("systems")} aria-describedby="e-systems-desc" /></Field>
        <fieldset>
          <legend className="text-[13px] font-semibold">Kinds of data involved</legend>
          <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">{categories.map((c) => <label key={c.value} className="flex items-center gap-2 text-sm"><Checkbox checked={v.data_categories.includes(c.value)} onCheckedChange={() => toggle(c.value)} />{c.label}</label>)}</div>
        </fieldset>
        <Field id="e-count" label="People affected (estimate)"><Input id="e-count" type="number" min={0} value={v.affected_count_estimate} onChange={set("affected_count_estimate")} /></Field>
        <Field id="e-cont" label="Containment: what was done to stop it"><Textarea id="e-cont" placeholder="e.g. Rotated the key and disabled the account" rows={2} value={v.containment} onChange={set("containment")} aria-describedby="e-cont-desc" /></Field>
        <Field id="e-root" label="Reasons and events that led to it (root cause)"><Textarea id="e-root" placeholder="e.g. A key was left active after a staff member moved teams" rows={2} value={v.root_cause} onChange={set("root_cause")} aria-describedby="e-root-desc" /></Field>
        <Field id="e-rem" label="Remedial measures to prevent a repeat"><Textarea id="e-rem" placeholder="e.g. Expire keys automatically after 90 days" rows={2} value={v.remediation} onChange={set("remediation")} aria-describedby="e-rem-desc" /></Field>
        <Field id="e-person" label="Findings about the person who caused it"><Textarea id="e-person" placeholder="e.g. Followed the process; no action needed" rows={2} value={v.findings_on_person} onChange={set("findings_on_person")} aria-describedby="e-person-desc" /></Field>
        <Field id="e-bref" label="Board reference (once the Board gives one)"><Input id="e-bref" placeholder="e.g. DPB/2026/014" value={v.board_reference} onChange={set("board_reference")} /></Field>
      </fieldset>
      {!closed && <SubmitButton pending={pending} pendingText="Saving…" size="sm">Save facts</SubmitButton>}
    </form>
  );
}

const STATUS_STEPS = {
  suspected: ["investigating", "confirmed", "not_a_breach"],
  investigating: ["contained", "confirmed", "not_a_breach"],
  contained: ["investigating", "confirmed", "not_a_breach"],
  confirmed: ["notified", "resolved"],
  notified: ["resolved"],
  resolved: ["closed"],
};

export function IncidentStatusForm({ id, status }) {
  const { pending, error, run } = useRun();
  const next = STATUS_STEPS[status] ?? [];
  const [to, setTo] = useState(next[0] ?? "");
  const [note, setNote] = useState("");
  if (!next.length) return <p className="text-muted-foreground text-sm">No further status changes.</p>;
  return (
    <form noValidate className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(() => incidentStatusAction({ id, to, note }), () => setNote("")); }}>
      {error && <FormAlert>{error}</FormAlert>}
      <div className="space-y-1.5">
        <Label htmlFor="st-to" className="text-[13px] font-semibold">Move to</Label>
        <select id="st-to" value={to} onChange={(e) => setTo(e.target.value)} className={field}>{next.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}</select>
      </div>
      <Field id="st-note" label={to === "confirmed" ? "Why this is a confirmed breach (this starts the 72-hour clock)" : "Why"} required><Textarea id="st-note" placeholder="e.g. Logs confirm an outsider read personal data" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} aria-describedby="st-note-desc" /></Field>
      <SubmitButton pending={pending} pendingText="Saving…" size="sm" variant={to === "confirmed" ? "destructive" : "default"}>Update status</SubmitButton>
    </form>
  );
}

export function IncidentEventForm({ id }) {
  const { pending, error, run } = useRun();
  const [kind, setKind] = useState("note");
  const [body, setBody] = useState("");
  return (
    <form noValidate className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(() => incidentEventAction({ id, kind, body }), () => setBody("")); }}>
      {error && <FormAlert>{error}</FormAlert>}
      <div className="space-y-1.5">
        <Label htmlFor="ev-kind" className="text-[13px] font-semibold">Entry type</Label>
        <select id="ev-kind" value={kind} onChange={(e) => setKind(e.target.value)} className={field}>
          <option value="note">Note</option><option value="containment">Containment step</option><option value="evidence">Evidence kept (describe where; do not paste personal data)</option>
        </select>
      </div>
      <Field id="ev-body" label="Entry" required><Textarea id="ev-body" placeholder="e.g. Contacted the email provider; waiting for access logs" rows={2} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} aria-describedby="ev-body-desc" /></Field>
      <SubmitButton pending={pending} pendingText="Adding…" size="sm">Add to timeline</SubmitButton>
    </form>
  );
}

export function AffectedForm({ id }) {
  const { pending, error, run } = useRun();
  const [usernames, setUsernames] = useState("");
  return (
    <form noValidate className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(() => incidentAffectedAction({ id, usernames }), () => setUsernames("")); }}>
      {error && <FormAlert>{error}</FormAlert>}
      <Field id="af-names" label="Add affected members by username" hint="One per line, or separated by commas. Only add people you have confirmed were affected." required>
        <Textarea id="af-names" placeholder="One username per line, e.g. aarav_sharma" rows={3} value={usernames} onChange={(e) => setUsernames(e.target.value)} aria-describedby="af-names-desc" />
      </Field>
      <SubmitButton pending={pending} pendingText="Adding…" size="sm">Add to the list</SubmitButton>
    </form>
  );
}

export function NoticeEditor({ incidentId, audience, label, notice, canApprove, canSend }) {
  const { pending, error, run } = useRun();
  const [subject, setSubject] = useState(notice?.subject ?? "");
  const [body, setBody] = useState(notice?.body ?? "");
  const [reference, setReference] = useState("");
  const sent = notice?.status === "sent";
  return (
    <div className="space-y-3">
      {error && <FormAlert>{error}</FormAlert>}
      {notice && <p className="text-muted-foreground text-xs">Status: <strong>{notice.status}</strong>{notice.approved_at ? `, approved ${new Date(notice.approved_at).toLocaleString("en-IN")}` : ""}{notice.sent_at ? `, sent ${new Date(notice.sent_at).toLocaleString("en-IN")}` : ""}</p>}
      <fieldset disabled={sent || pending} className="space-y-3">
        <Field id={`n-${audience}-s`} label="Subject"><Input id={`n-${audience}-s`} placeholder="e.g. Notice of a personal data breach" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} /></Field>
        <Field id={`n-${audience}-b`} label="Text" hint="Every [to be completed: …] must be replaced before it can be approved."><Textarea id={`n-${audience}-b`} rows={12} value={body} onChange={(e) => setBody(e.target.value)} maxLength={8000} aria-describedby={`n-${audience}-b-desc`} /></Field>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => run(async () => { const r = await draftIncidentNoticeAction({ id: incidentId, audience }); if (r.ok) { setSubject(r.subject); setBody(r.body); return { ok: true, message: "Draft generated from the incident record. Complete and save it." }; } return r; })}>
            Generate draft from the record
          </Button>
          <Button type="button" size="sm" disabled={subject.length < 3 || body.length < 40} onClick={() => run(() => saveIncidentNoticeAction({ id: incidentId, audience, subject, body }))}>Save draft</Button>
          {notice?.status === "draft" && canApprove && <Button type="button" variant="outline" size="sm" onClick={() => run(() => approveIncidentNoticeAction({ noticeId: notice.id }))}>Approve</Button>}
        </div>
      </fieldset>
      {notice?.status === "approved" && audience === "principals" && canSend && (
        <Button type="button" size="sm" variant="destructive" disabled={pending} onClick={() => run(() => sendIncidentNoticeAction({ noticeId: notice.id }))}>Send to affected members now</Button>
      )}
      {notice?.status === "approved" && audience !== "principals" && (
        <div className="bg-muted/40 space-y-2 rounded-md border p-3">
          <p className="text-[13px]">Submit this report to the Data Protection Board through the Board&rsquo;s own channel, then record it here. UniSphere does not submit it for you.</p>
          <Field id={`n-${audience}-ref`} label="Board reference (if given)"><Input id={`n-${audience}-ref`} placeholder="e.g. DPB/2026/014" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} /></Field>
          <Button type="button" size="sm" disabled={pending} onClick={() => run(() => markBoardNoticeSentAction({ noticeId: notice.id, reference }))}>I submitted it: record</Button>
        </div>
      )}
      <p className="sr-only">{label}</p>
    </div>
  );
}

// ── Access review, settings, retention ─────────────────────────────────────

export function AccessReviewForm() {
  const { pending, error, run } = useRun();
  const [notes, setNotes] = useState("");
  return (
    <form noValidate className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(() => recordAccessReviewAction({ notes }), () => setNotes("")); }}>
      {error && <FormAlert>{error}</FormAlert>}
      <Field id="ar-notes" label="Review notes" hint="Who you checked, and what you decided. Saves a snapshot of the list above."><Textarea id="ar-notes" placeholder="e.g. Checked all four officers; removed access for one who left" rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} aria-describedby="ar-notes-desc" /></Field>
      <SubmitButton pending={pending} pendingText="Recording…" size="sm">Record this review</SubmitButton>
    </form>
  );
}

export function RunRetentionButton() {
  const { pending, error, run } = useRun();
  return (
    <div>
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => run(() => runRetentionNowAction({}))}>{pending ? "Running…" : "Run retention now"}</Button>
      {error && <p role="alert" className="text-destructive-text mt-2 text-xs">{error}</p>}
    </div>
  );
}

const SETTING_FIELDS = {
  privacy_review_mode: { label: "Privacy review for accounts from before consent was recorded", kind: "select", options: [["soft", "Soft: a banner, nothing is blocked"], ["required", "Required: a page they must complete (use once the Rules apply)"]] },
  privacy_response_days: { label: "Target days to reply, by kind of request", kind: "json" },
  privacy_grievance_max_days: { label: "Longest period to resolve a grievance (days; the Rules allow up to 90)", kind: "number" },
  privacy_retention: { label: "Retention windows in days (placeholders pending legal review)", kind: "json" },
  privacy_incident_self_approval: { label: "Let the person who drafted a breach notice approve it too", kind: "boolean" },
};

export function PrivacySettingRow({ settingKey, value }) {
  const { pending, error, run } = useRun();
  const meta = SETTING_FIELDS[settingKey];
  const [v, setV] = useState(meta.kind === "json" ? JSON.stringify(value, null, 2) : meta.kind === "boolean" ? Boolean(value) : String(value ?? ""));
  function save(e) {
    e.preventDefault();
    let out = v;
    try {
      if (meta.kind === "json") out = JSON.parse(v);
      else if (meta.kind === "number") out = Number(v);
    } catch {
      return toast.error("That is not valid JSON.");
    }
    run(() => setPrivacySettingAction({ key: settingKey, value: out }));
  }
  return (
    <form onSubmit={save} className="space-y-2 border-b py-4 last:border-b-0">
      <Label htmlFor={`ps-${settingKey}`} className="text-sm font-semibold">{meta.label}</Label>
      {meta.kind === "select" && <select id={`ps-${settingKey}`} value={v} onChange={(e) => setV(e.target.value)} className={field}>{meta.options.map(([val, l]) => <option key={val} value={val}>{l}</option>)}</select>}
      {meta.kind === "number" && <Input id={`ps-${settingKey}`} type="number" value={v} onChange={(e) => setV(e.target.value)} />}
      {meta.kind === "json" && <Textarea id={`ps-${settingKey}`} rows={7} className="font-mono text-xs" value={v} onChange={(e) => setV(e.target.value)} />}
      {meta.kind === "boolean" && <label className="flex items-center gap-2 text-sm"><Checkbox id={`ps-${settingKey}`} checked={v} onCheckedChange={(c) => setV(c === true)} /> Allow</label>}
      {error && <p role="alert" className="text-destructive-text text-xs">{error}</p>}
      <SubmitButton pending={pending} pendingText="Saving…" size="sm" variant="outline">Save</SubmitButton>
    </form>
  );
}
