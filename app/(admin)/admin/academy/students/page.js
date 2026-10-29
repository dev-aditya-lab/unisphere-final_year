import Link from "next/link";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { DataTable, EmptyRow, FilterTabs, Pager, Panel, StatusBadge, fmtDate } from "@/components/admin/ui";
import { ActionDialog } from "@/components/admin/action-dialog";
import { Button } from "@/components/ui/button";
import { EntityForm } from "@/components/academy/admin/entity-form";
import { enrollStudentAction, setEnrollmentAction } from "@/lib/actions/academy-admin";
import { ENROLLMENT_STATUSES, ENROLL_SOURCES } from "@/lib/academy/constants";
import { ENROLL_FIELDS } from "@/lib/academy/forms";
import { PAGE_SIZE } from "@/lib/admin/paging";
import { can, courseOptions, needAcademy, offset, rows } from "@/lib/services/academy-admin";

export const metadata = { title: "Academy students" };

const STATUSES = [{ value: "all", label: "All" }, ...Object.entries(ENROLLMENT_STATUSES).map(([value, label]) => ({ value, label }))];

export default async function AcademyStudents({ searchParams }) {
  await needAcademy("academy.students.view", "academy.students.manage", "academy.assignments.review");
  const sp = await searchParams;
  const manage = await can("academy.students.manage");
  const exporter = await can("academy.export");
  const status = STATUSES.some((s) => s.value === sp.status) && sp.status !== "all" ? sp.status : null;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : "";
  const course = typeof sp.course === "string" && /^[0-9a-f-]{36}$/.test(sp.course) ? sp.course : null;
  const page = Math.max(1, Number(sp.page) || 1);
  const [list, courses] = await Promise.all([rows("academy_admin_enrollments", { p_search: q || null, p_status: status, p_course: course, p_limit: PAGE_SIZE, p_offset: offset(page) }), courseOptions()]);
  const total = Number(list[0]?.total_count ?? 0);

  return (
    <>
      <PageHeader eyebrow="Academy" title="Students and enrolments" description="Each row is one enrolment. Mentors see only the students of their own courses."
        actions={exporter ? <Button asChild variant="outline" size="sm"><a href="/api/admin/academy/export?kind=enrollments"><Download aria-hidden />Export CSV</a></Button> : undefined} />
      <FilterTabs label="Status" basePath="/admin/academy/students" current={status ?? "all"} options={STATUSES} extra={{ q, course }} />
      <form method="get" role="search" className="mb-4 flex flex-wrap items-end gap-2">
        <input type="hidden" name="status" value={status ?? ""} />
        <input name="q" defaultValue={q} placeholder="Name, username, course code" aria-label="Search students" className="border-input bg-card h-9 w-64 rounded-md border px-3 text-sm" />
        <select name="course" defaultValue={course ?? ""} aria-label="Course" className="border-input bg-card h-9 rounded-md border px-2 text-sm"><option value="">All courses</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</select>
        <Button type="submit" size="sm" variant="outline">Search</Button>
      </form>
      <DataTable caption="Enrolments" columns={["Student", "Course", "Status", "Progress", "Enrolled", "Certificate", ""]} empty={list.length === 0 && <EmptyRow>No enrolments match.</EmptyRow>}>
        {list.map((e) => (
          <tr key={e.id} className="align-top">
            <td className="px-4 py-3"><Link href={`/u/${e.username}`} className="font-semibold hover:underline">{e.full_name}</Link><p className="text-muted-foreground text-xs">@{e.username}{e.email ? ` · ${e.email}` : ""}</p></td>
            <td className="px-4 py-3"><span className="font-mono text-xs">{e.course_code}</span><p className="text-xs">{e.course_title}</p>{e.cohort_name && <p className="text-muted-foreground text-xs">{e.cohort_name}</p>}</td>
            <td className="px-4 py-3"><StatusBadge value={e.status === "revoked" ? "removed" : e.status === "refunded" ? "refunded" : e.status} /><p className="text-muted-foreground mt-1 text-xs">{ENROLL_SOURCES[e.source]}{e.access_expires_at ? ` · until ${fmtDate(e.access_expires_at)}` : ""}</p></td>
            <td className="px-4 py-3 tabular-nums">{e.completion_pct}%</td>
            <td className="px-4 py-3 text-xs whitespace-nowrap">{fmtDate(e.enrolled_at)}</td>
            <td className="px-4 py-3 text-xs">{e.certificate_status ?? "—"}</td>
            <td className="px-4 py-3"><div className="flex flex-wrap justify-end gap-1.5">
              {manage && ["active", "completed"].includes(e.status) && <ActionDialog label="Pause" args={{ enrollmentId: e.id, action: "suspend" }} action={setEnrollmentAction} title="Pause this student's access?" description="They can no longer open the course until you restore it." />}
              {manage && e.status === "suspended" && <ActionDialog label="Restore" args={{ enrollmentId: e.id, action: "restore" }} action={setEnrollmentAction} title="Restore access?" />}
              {manage && ["active", "completed", "expired"].includes(e.status) && <ActionDialog label="+30 days" args={{ enrollmentId: e.id, action: "extend", days: 30 }} action={setEnrollmentAction} title="Extend access by 30 days?" />}
              {manage && ["active", "completed", "suspended", "expired"].includes(e.status) && <ActionDialog label="Remove" destructive args={{ enrollmentId: e.id, action: "revoke" }} action={setEnrollmentAction} title="Remove this student from the course?" description="Their access ends. Their work and any payment record stay. To give money back, use Orders." />}
            </div></td>
          </tr>
        ))}
      </DataTable>
      <Pager basePath="/admin/academy/students" page={page} total={total} params={{ status, q, course }} />

      {manage && (
        <Panel title="Enrol someone by hand" description="For complimentary places and scholarships. The student is told, and the reason is kept in the audit log. You cannot enrol yourself." className="mt-8">
          <EntityForm fields={ENROLL_FIELDS(courses.filter((c) => c.status !== "draft"))} action={enrollStudentAction} submitLabel="Enrol" resetOnSuccess />
        </Panel>
      )}
    </>
  );
}
