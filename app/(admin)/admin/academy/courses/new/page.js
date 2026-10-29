import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/admin/ui";
import { EntityForm } from "@/components/academy/admin/entity-form";
import { saveEntityAction } from "@/lib/actions/academy-admin";
import { courseFields } from "@/lib/academy/forms";
import { categoriesAll, needAcademy } from "@/lib/services/academy-admin";

export const metadata = { title: "New course" };

export default async function NewCourse() {
  await needAcademy("academy.courses.manage");
  const categories = (await categoriesAll()).filter((c) => c.active);
  return (
    <>
      <PageHeader eyebrow="Academy" title="New course, program or internship" description="It starts as a draft. The server assigns its unique code (for example USA-WD-004) when you save. Set the price and publish it from its page." />
      <Panel>
        {categories.length === 0 ? <p className="text-sm">Add a subject first, on the Courses page.</p> : (
          <EntityForm fields={courseFields(categories)} initial={{ cert_min_completion: 100, cert_min_score: 0, cert_require_assignments: true, category_id: categories[0].id }} action={saveEntityAction.bind(null, "course", null)} submitLabel="Create draft" onDoneHref="/admin/academy/courses/{id}" />
        )}
      </Panel>
    </>
  );
}
