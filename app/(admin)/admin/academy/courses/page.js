import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { DataTable, EmptyRow, FilterTabs, Pager, Panel, StatusBadge, fmtDate } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { EntityForm } from "@/components/academy/admin/entity-form";
import { ActionDialog } from "@/components/admin/action-dialog";
import { deleteEntityAction, saveEntityAction } from "@/lib/actions/academy-admin";
import { KINDS } from "@/lib/academy/constants";
import { categoryFields } from "@/lib/academy/forms";
import { formatMoney } from "@/lib/academy/money";
import { allCourses, categoriesAll, needAcademy } from "@/lib/services/academy-admin";

export const metadata = { title: "Academy courses" };

const KIND_TABS = [{ value: "all", label: "All" }, ...Object.entries(KINDS).map(([value, k]) => ({ value, label: k.plural }))];
const STATUS_TABS = [{ value: "all", label: "Any status" }, { value: "draft", label: "Draft" }, { value: "published", label: "Published" }, { value: "unpublished", label: "Unpublished" }, { value: "archived", label: "Archived" }];

export default async function AcademyCourses({ searchParams }) {
  await needAcademy("academy.courses.manage");
  const sp = await searchParams;
  const kind = KINDS[sp.kind] ? sp.kind : null;
  const status = STATUS_TABS.some((t) => t.value === sp.status) && sp.status !== "all" ? sp.status : null;
  const page = Math.max(1, Number(sp.page) || 1);
  const q = typeof sp.q === "string" ? sp.q.slice(0, 60) : "";
  const [{ courses, total }, categories] = await Promise.all([allCourses({ kind, status, q, page }), categoriesAll()]);

  return (
    <>
      <PageHeader eyebrow="Academy" title="Courses, programs and internships" description="One list for all three: the type is a setting on each. Codes like USA-WD-001 are assigned by the server and never change."
        actions={<Button asChild size="sm"><Link href="/admin/academy/courses/new"><Plus aria-hidden />New</Link></Button>} />
      <FilterTabs label="Type" basePath="/admin/academy/courses" param="kind" current={kind ?? "all"} options={KIND_TABS} extra={{ status: status ?? "", q }} />
      <FilterTabs label="Status" basePath="/admin/academy/courses" param="status" current={status ?? "all"} options={STATUS_TABS} extra={{ kind: kind ?? "", q }} />
      <form method="get" role="search" className="mb-4 flex gap-2">
        <input type="hidden" name="kind" value={kind ?? ""} /><input type="hidden" name="status" value={status ?? ""} />
        <input name="q" defaultValue={q} placeholder="Title or code" aria-label="Search courses" className="border-input bg-card h-9 w-64 rounded-md border px-3 text-sm" />
        <Button type="submit" size="sm" variant="outline">Search</Button>
      </form>
      <DataTable caption="Courses" columns={["Code", "Title", "Type", "Status", "Price", "Updated", ""]} empty={courses.length === 0 && <EmptyRow>No courses match. Create the first one.</EmptyRow>}>
        {courses.map((c) => (
          <tr key={c.id} className="hover:bg-muted/40">
            <td className="px-4 py-3 font-mono text-xs">{c.code}</td>
            <td className="px-4 py-3"><Link href={`/admin/academy/courses/${c.id}`} className="font-semibold hover:underline">{c.title}</Link><p className="text-muted-foreground text-xs">{c.category?.name}</p></td>
            <td className="px-4 py-3">{KINDS[c.kind]?.label}</td>
            <td className="px-4 py-3"><StatusBadge value={c.status} /></td>
            <td className="px-4 py-3 tabular-nums">{c.price_minor == null ? <span className="text-warning-text">not set</span> : c.price_minor === 0 ? "Free" : formatMoney(c.price_minor, { withZero: true })}</td>
            <td className="px-4 py-3 whitespace-nowrap">{fmtDate(c.updated_at)}</td>
            <td className="px-4 py-3 text-right"><Button asChild variant="outline" size="sm"><Link href={`/admin/academy/courses/${c.id}`}>Edit</Link></Button></td>
          </tr>
        ))}
      </DataTable>
      <Pager basePath="/admin/academy/courses" page={page} total={total} params={{ kind, status, q }} />

      <Panel title="Subjects" description="A subject groups courses and sets the prefix of their codes. Switching one off hides it from visitors." className="mt-8">
        <ul className="mb-5 divide-y text-sm">
          {categories.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <details className="min-w-0 flex-1">
                <summary className="cursor-pointer"><span className="font-mono text-xs">{c.code_prefix}</span> <strong>{c.name}</strong> {!c.active && <span className="text-muted-foreground">(hidden)</span>}</summary>
                <div className="mt-3"><EntityForm fields={categoryFields} initial={c} action={saveEntityAction.bind(null, "category", c.id)} compact /></div>
              </details>
              <ActionDialog label="Delete" destructive askReason={false} title={`Delete ${c.name}?`} description="Only possible when no course uses it." action={deleteEntityAction.bind(null, "category", c.id)} args={{}} confirmLabel="Delete" />
            </li>
          ))}
        </ul>
        <h3 className="mb-3 text-sm font-bold">Add a subject</h3>
        <EntityForm fields={categoryFields} action={saveEntityAction.bind(null, "category", null)} submitLabel="Add subject" resetOnSuccess compact />
      </Panel>
    </>
  );
}
