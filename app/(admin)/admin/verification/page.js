import { PageHeader } from "@/components/shell/page-header";
import { EmptyRow, FilterTabs, Panel, StatusBadge, fmtDateTime } from "@/components/admin/ui";
import { VerificationReview } from "@/components/admin/verification-review";
import { listVerifications } from "@/lib/services/admin";

export const metadata = { title: "Verification" };

const VIEWS = [
  { value: "pending", label: "Pending" },
  { value: "needs_info", label: "Needs info" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" },
];

export default async function VerificationPage({ searchParams }) {
  const sp = await searchParams;
  const status = VIEWS.some((v) => v.value === sp.status) ? sp.status : "pending";
  const rows = await listVerifications({ status });

  return (
    <>
      <PageHeader
        eyebrow="Review queues" title="College verification"
        description="Confirm that a member really belongs to the college and account type they chose. Students on the college list verify themselves with their student ID, so this queue is mostly faculty, staff and students who are not on the list yet. Approving never grants any staff access."
      />
      <FilterTabs label="Verification views" basePath="/admin/verification" current={status} options={VIEWS} />
      {rows.length === 0 ? (
        <div className="surface"><EmptyRow>No requests here.</EmptyRow></div>
      ) : (
        <ul className="space-y-4">
          {rows.map((v) => (
            <li key={v.id}>
              <Panel
                title={`${v.full_name} (@${v.username})`}
                description={`${v.college_name} · wants to be verified as ${v.account_type} · ${fmtDateTime(v.created_at)}`}
                actions={<StatusBadge value={v.status} />}
              >
                <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  <div><dt className="eyebrow">Method</dt><dd className="capitalize">{v.method.replace(/_/g, " ")}</dd></div>
                  {v.supporting_info && <div className="sm:col-span-2"><dt className="eyebrow">What they told us</dt><dd className="break-words whitespace-pre-wrap">{v.supporting_info}</dd></div>}
                  {v.document_file_id && (
                    <div className="sm:col-span-2">
                      <dt className="eyebrow">Document</dt>
                      <dd><a href={`/api/files/${v.document_file_id}`} target="_blank" rel="noopener noreferrer" className="text-blue-text font-semibold hover:underline">Open the uploaded document (opens in a new tab)</a></dd>
                    </div>
                  )}
                  {v.rejection_reason && <div className="sm:col-span-2"><dt className="eyebrow">Message sent to the member</dt><dd className="break-words whitespace-pre-wrap">{v.rejection_reason}</dd></div>}
                  {v.reviewer_notes && <div className="sm:col-span-2"><dt className="eyebrow">Internal notes</dt><dd className="break-words whitespace-pre-wrap">{v.reviewer_notes}</dd></div>}
                </dl>
                {(v.status === "pending" || v.status === "needs_info") && <VerificationReview id={v.id} />}
              </Panel>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
