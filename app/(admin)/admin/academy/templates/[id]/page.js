import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "@/components/shell/page-header";
import { Panel, StatusBadge, fmtDateTime } from "@/components/admin/ui";
import { ActionDialog } from "@/components/admin/action-dialog";
import { EntityForm } from "@/components/academy/admin/entity-form";
import { TemplateEditor } from "@/components/academy/admin/template-editor";
import { TemplateUpload } from "@/components/academy/admin/template-upload";
import { deactivateTemplateVersionAction, saveTemplateAction } from "@/lib/actions/academy-admin";
import { TEMPLATE_FIELDS } from "@/lib/academy/forms";
import { CERT_VARIABLES } from "@/lib/academy/cert-vars";
import { can, needAcademy } from "@/lib/services/academy-admin";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Certificate template" };

export default async function TemplatePage({ params, searchParams }) {
  await needAcademy("academy.templates.manage", "academy.certificates.issue");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const sp = await searchParams;
  const manage = await can("academy.templates.manage");
  const supabase = await createClient();
  const [{ data: template }, { data: versions }, { data: courses }] = await Promise.all([
    supabase.from("academy_cert_templates").select("*").eq("id", id).maybeSingle(),
    supabase.from("academy_cert_template_versions").select("*").eq("template_id", id).order("version", { ascending: false }),
    supabase.from("academy_courses").select("id, code, title").eq("certificate_template_id", id),
  ]);
  if (!template) notFound();
  const current = (versions ?? []).find((v) => v.id === sp.v) ?? (versions ?? []).find((v) => v.status === "draft") ?? (versions ?? [])[0] ?? null;

  return (
    <>
      <PageHeader eyebrow="Certificate template" title={template.name} description={template.is_default ? "Default template: used by every course that has none of its own." : "Assign it to a course on that course's Mentors & certificate tab."} actions={<Link href="/admin/academy/templates" className="text-primary-text text-sm underline">All templates</Link>} />

      {current ? (
        <Panel title={`Version ${current.version}`} description={`${current.page_count} page${current.page_count > 1 ? "s" : ""} · ${current.status === "draft" ? "draft: place the fields, test, then activate" : current.status === "active" ? "live" : "archived"} · uploaded ${fmtDateTime(current.created_at)}`}
          actions={manage && current.status === "active" ? <ActionDialog label="Deactivate" askReason={false} args={{}} action={deactivateTemplateVersionAction.bind(null, current.id)} title="Deactivate this version?" description="Courses using this template cannot issue certificates until another version is active. Already issued certificates are not affected." /> : undefined}>
          <TemplateEditor key={current.id} versionId={current.id} pageCount={current.page_count} pageWidth={Number(current.page_width)} pageHeight={Number(current.page_height)} initialFields={current.fields} status={manage ? current.status : "archived"} />
        </Panel>
      ) : <Panel><p className="text-muted-foreground text-sm">No version yet. Upload the PDF below.</p></Panel>}

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Panel title="Versions">
          <ul className="divide-y text-sm">{(versions ?? []).map((v) => <li key={v.id} className="flex items-center justify-between gap-3 py-2"><Link href={`/admin/academy/templates/${id}?v=${v.id}`} className="font-semibold hover:underline">Version {v.version}</Link><span className="text-muted-foreground text-xs">{fmtDateTime(v.created_at)}{v.notes ? ` · ${v.notes}` : ""}</span><StatusBadge value={v.status === "draft" ? "pending" : v.status === "active" ? "approved" : "mono"} /></li>)}{(versions ?? []).length === 0 && <li className="text-muted-foreground py-2">None.</li>}</ul>
          {manage && <div className="mt-5 border-t pt-4"><h3 className="mb-3 text-sm font-bold">Upload a new version</h3><TemplateUpload templateId={id} /></div>}
        </Panel>
        <div className="space-y-5">
          {manage && <Panel title="Settings"><EntityForm fields={TEMPLATE_FIELDS} initial={template} action={saveTemplateAction.bind(null, id)} compact /></Panel>}
          <Panel title="Used by"><ul className="text-sm">{(courses ?? []).map((c) => <li key={c.id}><Link className="text-primary-text underline" href={`/admin/academy/courses/${c.id}?tab=people`}>{c.code} {c.title}</Link></li>)}{(courses ?? []).length === 0 && <li className="text-muted-foreground">No course is assigned to this template{template.is_default ? ", but it is the default" : ""}.</li>}</ul></Panel>
          <Panel title="Variables" description="Write them in a text field exactly like this."><ul className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">{CERT_VARIABLES.map((v) => <li key={v.key}><code>{`{{${v.key}}}`}</code> <span className="text-muted-foreground">{v.label}</span></li>)}</ul></Panel>
        </div>
      </div>
    </>
  );
}
