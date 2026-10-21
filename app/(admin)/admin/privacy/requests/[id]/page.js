import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "@/components/shell/page-header";
import { Panel, fmtDateTime } from "@/components/admin/ui";
import { RequestStatusBadge } from "@/components/privacy/request-status";
import { RequestStaffForm } from "@/components/admin/privacy-admin";
import { requirePermission } from "@/lib/auth/session";
import { requestDetailForStaff } from "@/lib/privacy/requests";
import { OPEN_STATUSES, REQUEST_KINDS, REQUEST_STATUS, isPast } from "@/lib/privacy/registry";

export const metadata = { title: "Privacy request" };

export default async function PrivacyRequestAdminPage({ params }) {
  await requirePermission("privacy.requests");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const detail = await requestDetailForStaff(id);
  if (!detail) notFound();
  const { request: r, requester, events } = detail;
  const open = OPEN_STATUSES.includes(r.status);

  return (
    <>
      <PageHeader eyebrow={`${REQUEST_KINDS[r.kind]?.label ?? r.kind} · ${r.reference}`} title={r.subject} actions={<RequestStatusBadge status={r.status} />} />
      <p className="text-muted-foreground -mt-3 mb-5 text-sm">
        <Link href="/admin/privacy/requests" className="text-blue-text underline">All requests</Link> · received {fmtDateTime(r.created_at)} ·{" "}
        {open ? <span className={isPast(r.due_at) ? "text-destructive-text font-semibold" : ""}>due {fmtDateTime(r.due_at)}</span> : <>closed {fmtDateTime(r.closed_at)}</>}
        {r.assigned_to && " · assigned"}
      </p>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="space-y-5">
          <Panel title="Requester" description="Identity is shown only so you can find the account and confirm it is the same person. Do not copy it elsewhere.">
            <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[7rem_1fr]">
              {requester?.username && (<><dt className="text-muted-foreground">Username</dt><dd>@{requester.username}</dd></>)}
              {requester?.full_name && (<><dt className="text-muted-foreground">Name</dt><dd>{requester.full_name}</dd></>)}
              {requester?.email && (<><dt className="text-muted-foreground">Email</dt><dd className="break-all">{requester.email}</dd></>)}
              {requester?.joined && (<><dt className="text-muted-foreground">Joined</dt><dd>{fmtDateTime(requester.joined)}</dd></>)}
              {!requester?.email && !requester?.username && (<><dt className="text-muted-foreground">Account</dt><dd>Erased</dd></>)}
              <dt className="text-muted-foreground">Channel</dt><dd>{r.channel === "visitor" ? "Visitor (no account, no sign-in)" : "Signed-in member"}</dd>
            </dl>
            {r.channel === "visitor" && <p className="text-muted-foreground mt-3 text-xs">A visitor has not been verified. Share nothing about any account with them.</p>}
          </Panel>

          {r.anonymised_at ? (
            <Panel title="What was asked"><p className="text-muted-foreground text-sm">The text of this request was removed after the retention window.</p></Panel>
          ) : (
            <Panel title="What was asked">
              <p className="text-sm break-words whitespace-pre-wrap">{r.details || "(no further text)"}</p>
              {r.kind === "erasure" && <p className="text-muted-foreground mt-2 text-xs">Erasure is finished automatically when the data is gone; it cannot be marked done here. See <Link href="/admin/privacy/retention" className="text-blue-text underline">Retention & erasure</Link>.</p>}
            </Panel>
          )}

          {r.outcome_reason && <Panel title="Outcome given to the requester"><p className="text-sm whitespace-pre-wrap">{r.outcome_reason}</p></Panel>}

          <Panel title="History">
            <ol className="space-y-3">
              {events.map((e) => (
                <li key={e.id} className="border-l-2 pl-4">
                  <p className="text-sm font-semibold">
                    {REQUEST_STATUS[e.to_status]?.label ?? e.to_status}
                    <span className="text-muted-foreground ml-2 text-xs font-normal">{fmtDateTime(e.created_at)} · {e.actor_kind}{e.visibility === "staff" ? " · internal" : ""}</span>
                  </p>
                  {e.note && <p className="text-muted-foreground mt-0.5 text-[13px] whitespace-pre-wrap">{e.note}</p>}
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <div>
          {open ? (
            <Panel title="Handle this request"><RequestStaffForm id={r.id} kind={r.kind} assigned={Boolean(r.assigned_to)} /></Panel>
          ) : (
            <Panel title="Closed"><p className="text-muted-foreground text-sm">This request is closed.</p></Panel>
          )}
        </div>
      </div>
    </>
  );
}
