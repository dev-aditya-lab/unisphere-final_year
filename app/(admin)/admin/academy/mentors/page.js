import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { EntityForm } from "@/components/academy/admin/entity-form";
import { saveMentorAction } from "@/lib/actions/academy-admin";
import { MENTOR_FIELDS } from "@/lib/academy/forms";
import { mentorsAll, needAcademy } from "@/lib/services/academy-admin";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Academy mentors" };

export default async function MentorsPage() {
  await needAcademy("academy.courses.manage");
  const [mentors, { data: links }] = await Promise.all([mentorsAll(), (await createClient()).from("academy_course_mentors").select("user_id, role, course:academy_courses(id, code, title)")]);
  return (
    <>
      <PageHeader eyebrow="Academy" title="Mentors" description="A mentor is introduced publicly with the name and headline you write here. To let them grade work, also give them the Mentor role in Staff & roles; they can then grade only the courses they are assigned to." />
      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <Panel title="Mentors">
          <ul className="divide-y text-sm">
            {mentors.map((m) => {
              const mine = (links ?? []).filter((l) => l.user_id === m.user_id && l.course);
              return (
                <li key={m.user_id} className="py-3">
                  <div className="flex flex-wrap items-center gap-2"><strong>{m.display_name}</strong>{!m.active && <Badge variant="mono">hidden</Badge>}<span className="text-muted-foreground">{m.headline}</span></div>
                  <p className="text-muted-foreground mt-1 text-xs">{mine.length === 0 ? "Not assigned to a course yet." : mine.map((l, i) => <span key={l.course.id}>{i > 0 && ", "}<Link className="text-primary-text underline" href={`/admin/academy/courses/${l.course.id}?tab=people`}>{l.course.code}</Link></span>)}</p>
                </li>
              );
            })}
            {mentors.length === 0 && <li className="text-muted-foreground py-3">No mentors yet.</li>}
          </ul>
        </Panel>
        <Panel title="Add or update a mentor" description="Enter their exact UniSphere username. Using it again for the same person updates their introduction.">
          <EntityForm fields={MENTOR_FIELDS} initial={{ active: true }} action={saveMentorAction} submitLabel="Save mentor" resetOnSuccess compact />
        </Panel>
      </div>
    </>
  );
}
