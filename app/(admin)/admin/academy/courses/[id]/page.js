import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ArrowDown, ArrowUp, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Panel, StatusBadge, fmtDateTime } from "@/components/admin/ui";
import { ActionDialog, QuickAction } from "@/components/admin/action-dialog";
import { Badge } from "@/components/ui/badge";
import { EntityForm } from "@/components/academy/admin/entity-form";
import { CoverUpload, PricePreview, ResourceUploader } from "@/components/academy/admin/course-tools";
import { CourseCover } from "@/components/academy/ui/course-cover";
import {
  assignMentorAction, assignTemplateFormAction, deleteEntityAction, deleteQuizQuestionAction, deleteResourceAction, moveEntityAction,
  saveEntityAction, saveLessonContentAction, saveQuizQuestionAction, setCoursePricingAction, setCourseStatusAction, unassignMentorAction,
} from "@/lib/actions/academy-admin";
import { KINDS } from "@/lib/academy/constants";
import { ADD_MENTOR_TO_COURSE, ASSIGNMENT_FIELDS, COHORT_FIELDS, LESSON_CONTENT_FIELDS, LESSON_FIELDS, MODULE_FIELDS, PRICE_FIELDS, PRICE_RULE_FIELDS, QUESTION_FIELDS, courseFields, courseInitial } from "@/lib/academy/forms";
import { minorToInput } from "@/lib/academy/money";
import { categoriesAll, courseOptions, courseWorkspace, mentorsAll, needAcademy } from "@/lib/services/academy-admin";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Edit course" };

const TABS = [["details", "Details"], ["curriculum", "Curriculum"], ["pricing", "Pricing & cohorts"], ["people", "Mentors & certificate"], ["assignments", "Assignments"]];

const STATUS_ACTIONS = {
  draft: [["published", "Publish", "default"]],
  published: [["unpublished", "Unpublish", "outline"], ["archived", "Archive", "outline"]],
  unpublished: [["published", "Publish again", "default"], ["archived", "Archive", "outline"]],
  archived: [["unpublished", "Restore", "outline"]],
};

const ruleInitial = (r) => ({ ...r, price: minorToInput(r.price_minor) });
const assignmentInitial = (a) => ({ ...a, objectives: (a.objectives ?? []).join("\n"), rubric_text: (a.rubric ?? []).map((r) => `${r.key} | ${r.label} | ${r.max}`).join("\n") });

function MoveButtons({ entity, id }) {
  return (
    <span className="inline-flex gap-1">
      <QuickAction label="Up" variant="ghost" size="xs" icon={ArrowUp} action={moveEntityAction.bind(null, entity, id, "up")} args={{}} />
      <QuickAction label="Down" variant="ghost" size="xs" icon={ArrowDown} action={moveEntityAction.bind(null, entity, id, "down")} args={{}} />
    </span>
  );
}

export default async function CourseEditor({ params, searchParams }) {
  const held = await needAcademy("academy.courses.manage");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const sp = await searchParams;
  const tab = TABS.some(([t]) => t === sp.tab) ? sp.tab : "details";
  const ws = await courseWorkspace(id);
  if (!ws) notFound();
  const { course } = ws;
  const [categories, mentors, options] = await Promise.all([categoriesAll(), mentorsAll(), courseOptions()]);
  const publish = await (async () => (await (await createClient()).rpc("has_permission", { p_permission: "academy.courses.publish", p_college_id: null })).data === true)();
  const pricing = await (async () => (await (await createClient()).rpc("has_permission", { p_permission: "academy.pricing.manage", p_college_id: null })).data === true)();
  const { data: templates } = await (await createClient()).from("academy_cert_templates").select("id, name").order("name");
  void held;
  const href = (t) => `/admin/academy/courses/${id}?tab=${t}`;
  const lessonsOf = (m) => ws.lessons.filter((l) => l.module_id === m.id);

  return (
    <>
      <PageHeader
        eyebrow={`${KINDS[course.kind].label} · ${course.code}`} title={course.title}
        description={<span className="inline-flex flex-wrap items-center gap-2"><StatusBadge value={course.status} />{course.price_minor == null && <Badge variant="warning">no price yet</Badge>}<span>Updated {fmtDateTime(course.updated_at)}</span></span>}
        actions={<>
          {course.status === "published" && <Link href={`${KINDS[course.kind].path}/${course.slug}`} className="text-primary-text inline-flex items-center gap-1 text-sm underline" target="_blank">View public page<ExternalLink className="size-3.5" aria-hidden /></Link>}
          {publish && (STATUS_ACTIONS[course.status] ?? []).map(([to, label, variant]) => (
            <ActionDialog key={to} label={label} variant={variant} askReason={false} title={`${label}?`} description={to === "published" ? "It becomes visible to everyone. It needs a price, and a course needs at least one lesson." : to === "archived" || to === "unpublished" ? "New students can no longer find or buy it. People already enrolled keep their access." : undefined} action={setCourseStatusAction.bind(null, id, to)} args={{}} confirmLabel={label} />
          ))}
          {publish && course.status !== "draft" && course.status !== "archived" && !ws.hasOrders && <QuickAction label="Back to draft" action={setCourseStatusAction.bind(null, id, "draft")} args={{}} />}
        </>}
      />
      <nav aria-label="Sections" className="mb-5 flex flex-wrap gap-1.5">
        {TABS.map(([t, label]) => <Link key={t} href={href(t)} aria-current={t === tab ? "page" : undefined} className={`rounded-md border px-3 py-1.5 text-[13px] font-medium ${t === tab ? "bg-accent border-transparent" : "text-muted-foreground hover:bg-muted"}`}>{label}</Link>)}
      </nav>

      {tab === "details" && (
        <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
          <Panel title="Details"><EntityForm fields={courseFields(categories)} initial={courseInitial(course)} action={saveEntityAction.bind(null, "course", id)} /></Panel>
          <Panel title="Cover image" description="Shown on cards and the course page. Without one, a drawn cover is used.">
            <div className="overflow-hidden rounded-lg border"><CourseCover course={{ ...course, category: course.category }} /></div>
            <div className="mt-3"><CoverUpload courseId={id} /></div>
            <p className="text-muted-foreground mt-4 text-xs">Course code <span className="font-mono">{course.code}</span> is fixed for good. The type cannot change once students enrol.</p>
          </Panel>
        </div>
      )}

      {tab === "curriculum" && (
        <div className="space-y-5">
          {ws.modules.length === 0 && <Panel><p className="text-muted-foreground text-sm">No modules yet. Add the first one below, then its lessons.</p></Panel>}
          {ws.modules.map((m, i) => (
            <Panel key={m.id} title={`${String(i + 1).padStart(2, "0")} · ${m.title}`} actions={<div className="flex items-center gap-1"><MoveButtons entity="module" id={m.id} /><ActionDialog label="Delete module" destructive askReason={false} title="Delete this module and its lessons?" description="Lessons, quiz questions and progress in it are removed." action={deleteEntityAction.bind(null, "module", m.id)} args={{}} confirmLabel="Delete" /></div>}>
              <details className="mb-4"><summary className="text-primary-text cursor-pointer text-sm font-semibold">Rename or describe</summary><div className="mt-3"><EntityForm fields={MODULE_FIELDS} initial={m} extra={{ course_id: id }} action={saveEntityAction.bind(null, "module", m.id)} compact /></div></details>
              <ul className="space-y-3">
                {lessonsOf(m).map((l) => {
                  const content = ws.contents.get(l.id);
                  const qs = ws.questions.filter((q) => q.lesson_id === l.id);
                  return (
                    <li key={l.id} className="rounded-lg border p-3">
                      <details>
                        <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm"><Badge variant="mono">{l.kind}</Badge><strong>{l.title}</strong>{l.is_preview && <Badge variant="success">preview</Badge>}</summary>
                        <div className="mt-4 space-y-5">
                          <div className="flex justify-end gap-1"><MoveButtons entity="lesson" id={l.id} /><ActionDialog label="Delete lesson" destructive askReason={false} title="Delete this lesson?" action={deleteEntityAction.bind(null, "lesson", l.id)} args={{}} confirmLabel="Delete" /></div>
                          <EntityForm fields={LESSON_FIELDS} initial={l} extra={{ course_id: id, module_id: m.id }} action={saveEntityAction.bind(null, "lesson", l.id)} compact />
                          {(l.kind === "video" || l.kind === "text" || l.kind === "resource") && (
                            <div className="border-t pt-4"><h4 className="mb-3 text-sm font-bold">Content</h4>
                              <EntityForm fields={LESSON_CONTENT_FIELDS} initial={{ video: content?.video_ref ? (content.video_provider === "youtube" ? `https://youtu.be/${content.video_ref}` : `https://vimeo.com/${content.video_ref}`) : "", body_md: content?.body_md ?? "" }} extra={{ lesson_id: l.id }} action={saveLessonContentAction} submitLabel="Save content" /></div>
                          )}
                          {l.kind === "quiz" && (
                            <div className="border-t pt-4"><h4 className="mb-3 text-sm font-bold">Questions ({qs.length})</h4>
                              <ul className="mb-4 space-y-2">{qs.map((q) => (
                                <li key={q.id} className="bg-muted/50 rounded-md p-3 text-sm"><details><summary className="cursor-pointer font-medium">{q.prompt}</summary>
                                  <div className="mt-3"><EntityForm fields={QUESTION_FIELDS} initial={{ ...q, options_text: q.options.join("\n"), correct: q.correct.map((n) => n + 1).join(","), multiple: q.multiple }} extra={{ lesson_id: l.id }} action={saveQuizQuestionAction.bind(null, q.id)} compact />
                                    <div className="mt-2"><ActionDialog label="Delete question" destructive askReason={false} title="Delete this question?" action={deleteQuizQuestionAction.bind(null, q.id)} args={{}} confirmLabel="Delete" /></div></div></details></li>
                              ))}</ul>
                              <EntityForm fields={QUESTION_FIELDS} extra={{ lesson_id: l.id }} action={saveQuizQuestionAction.bind(null, null)} submitLabel="Add question" resetOnSuccess compact />
                            </div>
                          )}
                          {l.kind === "assignment" && <p className="text-muted-foreground border-t pt-4 text-sm">Set up the assignment itself on the <Link className="text-primary-text underline" href={href("assignments")}>Assignments</Link> tab and choose this lesson there.</p>}
                        </div>
                      </details>
                    </li>
                  );
                })}
              </ul>
              <details className="mt-4"><summary className="text-primary-text cursor-pointer text-sm font-semibold">Add a lesson</summary><div className="mt-3"><EntityForm fields={LESSON_FIELDS} initial={{ position: lessonsOf(m).length }} extra={{ course_id: id, module_id: m.id }} action={saveEntityAction.bind(null, "lesson", null)} submitLabel="Add lesson" resetOnSuccess compact /></div></details>
            </Panel>
          ))}
          <Panel title="Add a module"><EntityForm fields={MODULE_FIELDS} initial={{ position: ws.modules.length }} extra={{ course_id: id }} action={saveEntityAction.bind(null, "module", null)} submitLabel="Add module" resetOnSuccess compact /></Panel>
          <Panel title="Downloadable resources" description="Visible to enrolled students and staff only. Opened through a signed, short-lived link.">
            <ul className="mb-4 divide-y text-sm">{ws.resources.map((r) => <li key={r.id} className="flex items-center justify-between gap-3 py-2"><a className="text-primary-text underline" href={`/api/files/${r.file_id}`} target="_blank" rel="noopener">{r.title}</a><ActionDialog label="Remove" destructive askReason={false} title="Remove this resource?" action={deleteResourceAction.bind(null, r.id)} args={{}} confirmLabel="Remove" /></li>)}{ws.resources.length === 0 && <li className="text-muted-foreground py-2">None yet.</li>}</ul>
            <ResourceUploader courseId={id} lessons={ws.lessons} />
          </Panel>
        </div>
      )}

      {tab === "pricing" && (
        <div className="space-y-5">
          <Panel title="Price" description={pricing ? "Prices are stored in paise and changed only here. Every change is recorded with who made it. Existing orders keep the price they were bought at." : "You can see the price but need pricing access to change it."}>
            {pricing ? <EntityForm fields={PRICE_FIELDS} initial={{ price: course.price_minor == null ? "" : minorToInput(course.price_minor), refund_days: course.refund_days ?? "" }} action={setCoursePricingAction.bind(null, id)} /> : <p className="text-sm">{course.price_minor == null ? "Not set." : course.price_minor === 0 ? "Free." : `${minorToInput(course.price_minor)} INR`}</p>}
          </Panel>
          <Panel title="Scheduled prices" description="A sale, early-bird or cohort price valid for a window. The lowest valid one applies; none can raise the price.">
            <ul className="mb-4 space-y-2 text-sm">{ws.rules.map((r) => (
              <li key={r.id} className="rounded-md border p-3"><details><summary className="cursor-pointer"><strong>{r.label}</strong> · ₹{minorToInput(r.price_minor)} · {r.ends_at ? `until ${fmtDateTime(r.ends_at)}` : "no end"} {!r.active && <Badge variant="mono">off</Badge>}</summary>
                {pricing && <div className="mt-3"><EntityForm fields={PRICE_RULE_FIELDS(ws.cohorts)} initial={ruleInitial(r)} extra={{ course_id: id }} action={saveEntityAction.bind(null, "price_rule", r.id)} compact /><div className="mt-2"><ActionDialog label="Delete" destructive askReason={false} title="Delete this price?" action={deleteEntityAction.bind(null, "price_rule", r.id)} args={{}} confirmLabel="Delete" /></div></div>}</details></li>
            ))}{ws.rules.length === 0 && <li className="text-muted-foreground">None.</li>}</ul>
            {pricing && <><h3 className="mb-3 text-sm font-bold">Add a scheduled price</h3><EntityForm fields={PRICE_RULE_FIELDS(ws.cohorts)} extra={{ course_id: id }} action={saveEntityAction.bind(null, "price_rule", null)} submitLabel="Add price" resetOnSuccess compact /></>}
          </Panel>
          <Panel title="Cohorts" description="Groups with their own start, seats and (through a scheduled price) their own fee.">
            <ul className="mb-4 space-y-2 text-sm">{ws.cohorts.map((c) => <li key={c.id} className="rounded-md border p-3"><details><summary className="cursor-pointer"><strong>{c.name}</strong> <Badge variant="mono">{c.status}</Badge> {c.starts_at && `· starts ${fmtDateTime(c.starts_at)}`}</summary><div className="mt-3"><EntityForm fields={COHORT_FIELDS} initial={c} extra={{ course_id: id }} action={saveEntityAction.bind(null, "cohort", c.id)} compact /><div className="mt-2"><ActionDialog label="Delete" destructive askReason={false} title="Delete this cohort?" action={deleteEntityAction.bind(null, "cohort", c.id)} args={{}} confirmLabel="Delete" /></div></div></details></li>)}{ws.cohorts.length === 0 && <li className="text-muted-foreground">None.</li>}</ul>
            <EntityForm fields={COHORT_FIELDS} extra={{ course_id: id }} action={saveEntityAction.bind(null, "cohort", null)} submitLabel="Add cohort" resetOnSuccess compact />
          </Panel>
          <Panel title="Preview the price" description="Test the final price for a coupon, a student and a date without creating an order."><PricePreview courses={options.filter((c) => c.id === id).concat(options.filter((c) => c.id !== id))} /></Panel>
        </div>
      )}

      {tab === "people" && (
        <div className="space-y-5">
          <Panel title="Mentors" description="Mentors can grade this course's work only if they also hold the Mentor role (Staff & roles).">
            <ul className="mb-4 divide-y text-sm">{ws.mentors.map((m) => <li key={m.user_id} className="flex items-center justify-between gap-3 py-2"><span>{m.display_name} <Badge variant="mono">{m.role}</Badge></span><ActionDialog label="Remove" destructive askReason={false} title={`Remove ${m.display_name}?`} action={unassignMentorAction.bind(null, id, m.user_id)} args={{}} confirmLabel="Remove" /></li>)}{ws.mentors.length === 0 && <li className="text-muted-foreground py-2">None assigned.</li>}</ul>
            {mentors.length ? <EntityForm fields={ADD_MENTOR_TO_COURSE(mentors)} extra={{ course_id: id }} action={assignMentorAction} submitLabel="Assign mentor" compact /> : <p className="text-muted-foreground text-sm">Add mentors first on the <Link className="text-primary-text underline" href="/admin/academy/mentors">Mentors</Link> page.</p>}
          </Panel>
          <Panel title="Certificate template" description="The template used when a certificate is issued for this course. Empty uses the default template.">
            <EntityForm fields={[{ name: "template_id", label: "Template", type: "select", allowEmpty: true, emptyLabel: "Default template", options: (templates ?? []).map((t) => ({ value: t.id, label: t.name })) }]} initial={{ template_id: course.certificate_template_id ?? "" }} action={assignTemplateFormAction.bind(null, id)} compact />
          </Panel>
        </div>
      )}

      {tab === "assignments" && (
        <div className="space-y-5">
          <Panel title="Assignments">
            <ul className="mb-4 space-y-2 text-sm">{ws.assignments.map((a) => <li key={a.id} className="rounded-md border p-3"><details><summary className="cursor-pointer"><strong>{a.title}</strong> <StatusBadge value={a.status} /></summary><div className="mt-3"><EntityForm fields={ASSIGNMENT_FIELDS(ws.lessons.filter((l) => l.kind === "assignment"))} initial={assignmentInitial(a)} extra={{ course_id: id }} action={saveEntityAction.bind(null, "assignment", a.id)} /><div className="mt-2"><ActionDialog label="Delete" destructive askReason={false} title="Delete this assignment and its submissions?" action={deleteEntityAction.bind(null, "assignment", a.id)} args={{}} confirmLabel="Delete" /></div></div></details></li>)}{ws.assignments.length === 0 && <li className="text-muted-foreground">None yet.</li>}</ul>
            <h3 className="mb-3 text-sm font-bold">Add an assignment</h3>
            <EntityForm fields={ASSIGNMENT_FIELDS(ws.lessons.filter((l) => l.kind === "assignment"))} extra={{ course_id: id }} action={saveEntityAction.bind(null, "assignment", null)} submitLabel="Add assignment" resetOnSuccess />
          </Panel>
        </div>
      )}
    </>
  );
}
