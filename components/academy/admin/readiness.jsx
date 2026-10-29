import Link from "next/link";
import { Check, Circle, TriangleAlert } from "lucide-react";
import { Panel } from "@/components/admin/ui";

/**
 * "What is left before students can use this course?" One line per step, each with a plain next action. `level` is "required"
 * (publishing is blocked without it), "needed" (the course works but a part of the pipeline will not) or "nice" (optional polish).
 * Everything here is read from the course's stored records by the page; nothing is typed in.
 */
export function Readiness({ items }) {
  const required = items.filter((i) => i.level === "required");
  const blocked = required.filter((i) => !i.done).length;
  const open = items.filter((i) => !i.done).length;
  return (
    <Panel
      title={open === 0 ? "Everything is set up" : blocked > 0 ? `${blocked} thing${blocked === 1 ? "" : "s"} to do before you can publish` : "Ready to publish. A few more things will make it better"}
      description="Work through the list from the top. Each line says what to do and takes you there."
      className="mb-5"
    >
      <ul className="divide-y text-sm">
        {items.map((i) => (
          <li key={i.key} className="flex items-start gap-3 py-2.5">
            {i.done ? <Check className="mt-0.5 size-4 shrink-0 text-[var(--success-text)]" aria-label="Done" /> : i.level === "required" ? <TriangleAlert className="text-warning-text mt-0.5 size-4 shrink-0" aria-label="Needed" /> : <Circle className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-label="Optional" />}
            <div className="min-w-0 flex-1">
              <p className={i.done ? "text-muted-foreground" : "font-semibold"}>{i.title}{!i.done && i.level === "nice" ? <span className="text-muted-foreground font-normal"> (optional)</span> : null}</p>
              <p className="text-muted-foreground text-xs">{i.done ? i.doneText : i.todo}</p>
            </div>
            {!i.done && i.href && <Link href={i.href} className="text-primary-text shrink-0 text-xs font-semibold underline">{i.action ?? "Open"}</Link>}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** The steps for one course, from what is stored about it. Pure, so it can be tested without a page. */
export function readinessItems({ course, lessonCount, mentorCount, upcomingClasses, hasCertificateTemplate, tab = (t) => `?tab=${t}` }) {
  const live = course.delivery_mode !== "recorded";
  const items = [
    { key: "basics", level: "required", title: "Title and one-line summary", done: Boolean(course.title && course.short_description), doneText: "Added.", todo: "Add a one-line summary so the course card makes sense.", href: tab("details"), action: "Edit details" },
    { key: "price", level: "required", title: "Price", done: course.price_minor != null, doneText: course.price_minor === 0 ? "Free." : "Set.", todo: "Set a price (0 for a free course). Publishing is blocked without one.", href: tab("pricing"), action: "Set price" },
    ...(course.kind === "course" ? [{ key: "lessons", level: "required", title: "At least one lesson", done: lessonCount > 0, doneText: `${lessonCount} lesson${lessonCount === 1 ? "" : "s"}.`, todo: "Add a module, then lessons, on the Curriculum tab.", href: tab("curriculum"), action: "Add lessons" }] : []),
    { key: "mentor", level: "needed", title: "An instructor or mentor", done: mentorCount > 0, doneText: `${mentorCount} assigned. They are notified about students, classes and work to review.`, todo: "Without one, nobody is told when a student hands in work, and the course page has no About the instructor.", href: tab("people"), action: "Add a mentor" },
    ...(live ? [{ key: "classes", level: "needed", title: "A live class or a timetable", done: upcomingClasses > 0 || (course.timetable?.length ?? 0) > 0, doneText: upcomingClasses > 0 ? `${upcomingClasses} class${upcomingClasses === 1 ? "" : "es"} coming up.` : "Weekly timetable added.", todo: "This course is live, but no class is scheduled and there is no timetable. Students will see nothing to attend.", href: "/admin/academy/live", action: "Schedule a class" }] : []),
    { key: "certificate", level: "needed", title: "A certificate design", done: hasCertificateTemplate, doneText: "A design is assigned (or a default is set).", todo: "Without a design no certificate can be issued. Upload one and set it as the default, or choose one for this course.", href: tab("people"), action: "Choose a design" },
    { key: "cover", level: "nice", title: "A cover image", done: Boolean(course.cover_key), doneText: "Uploaded.", todo: "Without one a drawn cover is shown. A 16:9 picture looks best.", href: tab("details"), action: "Upload cover" },
  ];
  return items;
}
