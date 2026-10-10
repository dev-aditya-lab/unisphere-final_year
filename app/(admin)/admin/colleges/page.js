import { PageHeader } from "@/components/shell/page-header";
import { Panel, StatusBadge } from "@/components/admin/ui";
import { CollegeForm } from "@/components/admin/college-form";
import { getMyPermissions } from "@/lib/auth/session";
import { listColleges } from "@/lib/services/admin";

export const metadata = { title: "Colleges" };

export default async function CollegesPage() {
  const [colleges, perms] = await Promise.all([listColleges(), getMyPermissions()]);
  const managed = perms.filter((p) => p.permission === "college.manage");
  const global = managed.some((p) => p.college_id === null);
  const editable = (id) => global || managed.some((p) => p.college_id === id);

  return (
    <>
      <PageHeader
        eyebrow="Community" title="Colleges"
        description="How each college verifies its members. Students prove they belong with their student ID; nothing about verification ever grants a staff role."
      />
      <div className="space-y-5">
        {colleges.filter((c) => global || editable(c.id)).map((c) => (
          <Panel key={c.id} title={c.name} description={`/${c.slug}${c.city ? ` · ${c.city}` : ""}`} actions={<StatusBadge value={c.is_active ? "active" : "deactivated"} />}>
            <CollegeForm college={c} canEdit={editable(c.id)} />
          </Panel>
        ))}
      </div>
    </>
  );
}
