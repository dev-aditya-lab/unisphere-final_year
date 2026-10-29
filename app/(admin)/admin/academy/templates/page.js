import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { DataTable, EmptyRow, Panel, fmtDate } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EntityForm } from "@/components/academy/admin/entity-form";
import { saveTemplateAction } from "@/lib/actions/academy-admin";
import { TEMPLATE_FIELDS } from "@/lib/academy/forms";
import { needAcademy } from "@/lib/services/academy-admin";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Academy certificate templates" };

export default async function Templates() {
  await needAcademy("academy.templates.manage", "academy.certificates.issue");
  const supabase = await createClient();
  const [{ data: templates }, { data: versions }, { data: courses }] = await Promise.all([
    supabase.from("academy_cert_templates").select("*").order("created_at", { ascending: false }),
    supabase.from("academy_cert_template_versions").select("id, template_id, version, status, created_at, page_count"),
    supabase.from("academy_courses").select("certificate_template_id").not("certificate_template_id", "is", null),
  ]);
  const used = new Map();
  for (const c of courses ?? []) used.set(c.certificate_template_id, (used.get(c.certificate_template_id) ?? 0) + 1);

  return (
    <>
      <PageHeader eyebrow="Academy" title="Certificate templates" description="Upload your own PDF design, place the student's name, the course, the date and a QR code on it, test it, then activate it. A new layout is a new version; certificates already issued keep the version they were made with." />
      <DataTable caption="Templates" columns={["Template", "Versions", "Live version", "Courses", ""]} empty={(templates ?? []).length === 0 && <EmptyRow>No templates yet. Create one below.</EmptyRow>}>
        {(templates ?? []).map((t) => {
          const vs = (versions ?? []).filter((v) => v.template_id === t.id);
          const live = vs.find((v) => v.status === "active");
          return (
            <tr key={t.id}>
              <td className="px-4 py-3"><Link href={`/admin/academy/templates/${t.id}`} className="font-semibold hover:underline">{t.name}</Link>{t.is_default && <Badge variant="soft" className="ml-2">default</Badge>}{!t.active && <Badge variant="mono" className="ml-2">off</Badge>}</td>
              <td className="px-4 py-3">{vs.length}</td>
              <td className="px-4 py-3">{live ? <Badge variant="success">v{live.version}</Badge> : <Badge variant="warning">none live</Badge>}</td>
              <td className="px-4 py-3">{used.get(t.id) ?? 0}{t.is_default ? " + those without one" : ""}</td>
              <td className="px-4 py-3 text-right"><Button asChild variant="outline" size="sm"><Link href={`/admin/academy/templates/${t.id}`}>Open</Link></Button></td>
            </tr>
          );
        })}
      </DataTable>
      <p className="sr-only">{fmtDate(new Date().toISOString())}</p>
      <Panel title="New template" description="Then upload its PDF on the next page." className="mt-6">
        <EntityForm fields={TEMPLATE_FIELDS} initial={{ active: true }} action={saveTemplateAction.bind(null, null)} submitLabel="Create template" onDoneHref="/admin/academy/templates/{id}" />
      </Panel>
    </>
  );
}
