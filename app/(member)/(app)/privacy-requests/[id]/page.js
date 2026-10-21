import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { RequestStatusBadge, RequestTimeline, fmtDate } from "@/components/privacy/request-status";
import { CancelRequestButton, ReplyForm } from "@/components/privacy/request-forms";
import { requireProfile } from "@/lib/auth/session";
import { getMyRequest } from "@/lib/privacy/requests";
import { OPEN_STATUSES, REQUEST_KINDS, REQUEST_STATUS } from "@/lib/privacy/registry";
import { z } from "zod";

export const metadata = { title: "Privacy request", robots: { index: false, follow: false } };

export default async function PrivacyRequestPage({ params }) {
  await requireProfile({ allowIncomplete: true });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const found = await getMyRequest(id);
  if (!found) notFound();
  const { request: r, events } = found;
  const open = OPEN_STATUSES.includes(r.status);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow={`${REQUEST_KINDS[r.kind]?.label ?? "Request"} · ${r.reference}`}
        title={r.subject}
        actions={<RequestStatusBadge status={r.status} />}
      />
      <p className="text-muted-foreground -mt-3 mb-6 text-sm">
        <Link href="/privacy-requests#mine" className="text-blue-text underline">All your requests</Link> · sent {fmtDate(r.created_at)}
        {open ? <> · we aim to reply by {fmtDate(r.due_at)}</> : r.closed_at ? <> · closed {fmtDate(r.closed_at)}</> : null}
      </p>

      <p className="surface mb-6 p-4 text-sm">{REQUEST_STATUS[r.status]?.hint}</p>
      {r.outcome_reason && (
        <section className="surface mb-6 p-4" aria-labelledby="outcome">
          <h2 id="outcome" className="text-sm font-bold">Why it was not carried out in full</h2>
          <p className="text-muted-foreground mt-1 text-sm whitespace-pre-wrap">{r.outcome_reason}</p>
        </section>
      )}
      {r.details && (
        <section className="surface mb-6 p-4" aria-labelledby="what">
          <h2 id="what" className="text-sm font-bold">What you sent</h2>
          <p className="text-muted-foreground mt-1 text-sm whitespace-pre-wrap">{r.details}</p>
        </section>
      )}
      <section className="surface mb-6 p-5" aria-labelledby="history">
        <h2 id="history" className="mb-3 text-base font-bold">History</h2>
        <RequestTimeline events={events} />
      </section>

      {open && r.kind !== "erasure" && (
        <div className="space-y-4">
          <section className="surface p-5">
            <ReplyForm id={r.id} />
          </section>
          <CancelRequestButton id={r.id} />
        </div>
      )}
      {open && r.kind === "erasure" && (
        <p className="text-sm">
          To change your mind, <Link href="/delete-account" className="text-blue-text underline">cancel the deletion</Link>.
        </p>
      )}
      {!open && r.status !== "cancelled" && (
        <p className="text-muted-foreground text-sm">
          Not happy with the outcome? <Link href="/grievance" className="text-blue-text underline">Make a grievance</Link>, quoting {r.reference}.
        </p>
      )}
    </div>
  );
}
