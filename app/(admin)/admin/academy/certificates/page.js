import Link from "next/link";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { DataTable, EmptyRow, FilterTabs, Pager, Panel, StatusBadge, fmtDateTime } from "@/components/admin/ui";
import { ActionDialog, QuickAction } from "@/components/admin/action-dialog";
import { Button } from "@/components/ui/button";
import { approveCertificateAction, bulkIssueAction, issueCertificateAction, reissueCertificateAction, revokeCertificateAction } from "@/lib/actions/academy-admin";
import { CERT_STATUSES } from "@/lib/academy/constants";
import { PAGE_SIZE } from "@/lib/admin/paging";
import { can, courseOptions, needAcademy, offset, rows } from "@/lib/services/academy-admin";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Academy certificates" };

const STATUSES = [{ value: "all", label: "All" }, ...Object.entries(CERT_STATUSES).map(([value, label]) => ({ value, label }))];

export default async function AcademyCertificates({ searchParams }) {
  await needAcademy("academy.certificates.issue", "academy.certificates.revoke");
  const [issuer, revoker, exporter] = await Promise.all([can("academy.certificates.issue"), can("academy.certificates.revoke"), can("academy.export")]);
  const sp = await searchParams;
  const status = STATUSES.some((s) => s.value === sp.status) && sp.status !== "all" ? sp.status : null;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : "";
  const course = typeof sp.course === "string" && /^[0-9a-f-]{36}$/.test(sp.course) ? sp.course : null;
  const page = Math.max(1, Number(sp.page) || 1);
  const supabase = await createClient();
  const [list, courses, ready, awaiting] = await Promise.all([
    rows("academy_admin_certificates", { p_search: q || null, p_status: status, p_course: course, p_limit: PAGE_SIZE, p_offset: offset(page) }),
    courseOptions(),
    issuer ? rows("academy_issuable_enrollments", { p_course: course, p_limit: 100 }) : [],
    issuer ? supabase.from("academy_enrollments").select("id, course:academy_courses(code, title, certificate_criteria), user_id").is("certificate_approved_at", null).eq("status", "completed").limit(100) : { data: [] },
  ]);
  const total = Number(list[0]?.total_count ?? 0);
  const needApproval = (awaiting.data ?? []).filter((e) => e.course?.certificate_criteria?.manual_approval === true);

  return (
    <>
      <PageHeader eyebrow="Academy" title="Certificates" description="Every certificate keeps its ID, the template version used and the data it was issued with, even after a course changes. Revoking never deletes anything."
        actions={exporter ? <Button asChild variant="outline" size="sm"><a href="/api/admin/academy/export?kind=certificates"><Download aria-hidden />Export CSV</a></Button> : undefined} />

      {issuer && (
        <Panel title={`Ready to issue (${ready.length})`} description="Students who meet the requirements, have agreed to the public verification page, and have no certificate yet." className="mb-6"
          actions={ready.length > 0 && <ActionDialog label="Issue all" askReason={false} args={{ courseId: course ?? "" }} action={bulkIssueAction} title={`Issue ${ready.length} certificates?`} description="Up to 25 are issued at a time. Each student is told." variant="default" />}>
          {ready.length === 0 ? <EmptyRow>No one is waiting.</EmptyRow> : (
            <ul className="divide-y text-sm">{ready.slice(0, 30).map((r) => <li key={r.enrollment_id} className="flex items-center justify-between gap-3 py-2"><span><strong>{r.full_name}</strong> <span className="text-muted-foreground">· {r.course_code} {r.course_title}</span></span><QuickAction label="Issue" variant="default" action={issueCertificateAction} args={{ enrollmentId: r.enrollment_id }} /></li>)}</ul>
          )}
          {needApproval.length > 0 && (
            <div className="mt-5 border-t pt-4"><h3 className="mb-2 text-sm font-bold">Waiting for your approval ({needApproval.length})</h3>
              <ul className="divide-y text-sm">{needApproval.map((e) => <li key={e.id} className="flex items-center justify-between gap-3 py-2"><span className="text-muted-foreground">{e.course?.code} {e.course?.title}</span><QuickAction label="Approve" action={approveCertificateAction} args={{ enrollmentId: e.id }} /></li>)}</ul></div>
          )}
        </Panel>
      )}

      <FilterTabs label="Status" basePath="/admin/academy/certificates" current={status ?? "all"} options={STATUSES} extra={{ q, course }} />
      <form method="get" role="search" className="mb-4 flex flex-wrap items-end gap-2">
        <input type="hidden" name="status" value={status ?? ""} />
        <input name="q" defaultValue={q} placeholder="Certificate ID, student, course" aria-label="Search certificates" className="border-input bg-card h-9 w-64 rounded-md border px-3 text-sm" />
        <select name="course" defaultValue={course ?? ""} aria-label="Course" className="border-input bg-card h-9 rounded-md border px-2 text-sm"><option value="">All courses</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</select>
        <Button type="submit" size="sm" variant="outline">Search</Button>
      </form>
      <DataTable caption="Certificates" columns={["Certificate", "Student", "Course", "Template", "Status", "Issued", ""]} empty={list.length === 0 && <EmptyRow>No certificates match.</EmptyRow>}>
        {list.map((c) => (
          <tr key={c.id} className="align-top">
            <td className="px-4 py-3"><Link href={`/academy/verify/${c.certificate_id}`} className="font-mono text-xs font-semibold hover:underline">{c.certificate_id}</Link>{c.replaces_certificate_id && <p className="text-muted-foreground text-xs">replaces {c.replaces_certificate_id}</p>}<p className="text-muted-foreground text-xs">{c.verify_count} checks</p></td>
            <td className="px-4 py-3">{c.recipient_name}</td>
            <td className="px-4 py-3"><span className="font-mono text-xs">{c.course_code}</span><p className="text-xs">{c.course_title}</p></td>
            <td className="px-4 py-3 text-xs">{c.template_name} v{c.template_version}</td>
            <td className="px-4 py-3"><StatusBadge value={c.status === "issued" ? "approved" : c.status === "revoked" ? "rejected" : c.status === "failed" ? "failed" : "pending"} /><p className="text-muted-foreground mt-1 text-xs">{CERT_STATUSES[c.status]}</p>{c.revoke_reason && <p className="text-muted-foreground max-w-44 text-xs">{c.revoke_reason}</p>}</td>
            <td className="px-4 py-3 text-xs whitespace-nowrap">{fmtDateTime(c.issued_at)}{c.issued_by_name && <p className="text-muted-foreground">by {c.issued_by_name}</p>}</td>
            <td className="px-4 py-3"><div className="flex flex-wrap justify-end gap-1.5">
              {c.has_pdf && <Button asChild variant="outline" size="sm"><a href={`/api/academy/certificates/${c.id}/pdf`}>PDF</a></Button>}
              {issuer && c.status === "failed" && c.enrollment_id && <QuickAction label="Retry" variant="default" action={issueCertificateAction} args={{ enrollmentId: c.enrollment_id }} />}
              {issuer && c.status === "issued" && c.enrollment_id && <ActionDialog label="Reissue" reasonField="note" reasonLabel="What was corrected" args={{ enrollmentId: c.enrollment_id, certificateId: c.id }} action={reissueCertificateAction} title="Issue a corrected certificate?" description="The student gets a new certificate with a new ID. The old one is marked as replaced and keeps pointing to it." />}
              {revoker && c.status === "issued" && <ActionDialog label="Revoke" destructive args={{ id: c.id }} reasonLabel="Reason (kept internally, never shown publicly)" action={revokeCertificateAction} title="Revoke this certificate?" description="The public verification page shows it as revoked at once. The record and its ID stay. The holder is told." />}
            </div></td>
          </tr>
        ))}
      </DataTable>
      <Pager basePath="/admin/academy/certificates" page={page} total={total} params={{ status, q, course }} />
    </>
  );
}
