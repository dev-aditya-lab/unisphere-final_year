import Link from "next/link";
import { Clock, Signal, Users } from "lucide-react";
import { CourseCover } from "@/components/academy/ui/course-cover";
import { PriceTag } from "@/components/academy/ui/price";
import { KINDS, LEVELS, detailPath } from "@/lib/academy/constants";

/** One course, program or internship in a grid. The whole card is the link; the price is the engine's, never a number from a page. */
export function CourseCard({ course, price, priority = false }) {
  return (
    <article className="ac-card ac-card-hover group relative flex h-full flex-col overflow-hidden">
      <CourseCover course={course} />
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="ac-chip">{KINDS[course.kind]?.label ?? "Course"}</span>
          <span className="ac-chip ac-chip-line"><Signal className="size-3" aria-hidden />{LEVELS[course.level] ?? course.level}</span>
          <span className="text-muted-foreground ml-auto font-mono text-[11px]">{course.code}</span>
        </div>
        <h3 className="ac-display text-[1.35rem] leading-tight">
          <Link href={detailPath(course)} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none" prefetch={priority ? undefined : false}>{course.title}</Link>
        </h3>
        {course.short_description && <p className="text-muted-foreground line-clamp-2 text-sm">{course.short_description}</p>}
        <div className="text-muted-foreground mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-xs">
          {course.duration_label && <span className="inline-flex items-center gap-1"><Clock className="size-3.5" aria-hidden />{course.duration_label}</span>}
          {course.language && <span className="inline-flex items-center gap-1"><Users className="size-3.5" aria-hidden />{course.language}</span>}
        </div>
        <div className="border-t pt-3"><PriceTag price={price} /></div>
      </div>
    </article>
  );
}
