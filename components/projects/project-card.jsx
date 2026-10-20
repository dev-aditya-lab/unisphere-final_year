import Link from "next/link";
import { BadgeCheck, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PROJECT_STATUSES } from "@/lib/validators/project";
import { excerpt } from "@/lib/text";
import { cn } from "@/lib/utils";

const STATUS_VARIANT = { idea: "warning", planning: "soft", in_progress: "soft", completed: "success", paused: "mono" };

export function StatusBadge({ status }) {
  return <Badge variant={STATUS_VARIANT[status] ?? "mono"}>{PROJECT_STATUSES.find((s) => s.value === status)?.label ?? status}</Badge>;
}

export function ProjectCard({ project, className }) {
  const skills = [...new Set([...(project.required_skills ?? []), ...(project.tech_stack ?? [])])].slice(0, 5);
  return (
    <article className={cn("surface flex flex-col p-4 sm:p-5", className)}>
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-heading text-lg leading-snug font-bold">
          <Link href={`/projects/${project.slug}`} className="hover:underline">
            {project.name}
          </Link>
        </h2>
        <StatusBadge status={project.status} />
      </div>
      <p className="text-muted-foreground mt-0.5 flex items-center gap-1 text-xs">
        by {project.owner_name}
        {project.owner_verified && <BadgeCheck className="text-teal-text size-3.5" aria-label="Verified" />}
      </p>
      {(project.tagline || project.problem) && <p className="mt-2 text-sm">{project.tagline || excerpt(project.problem, 160)}</p>}
      {skills.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1" aria-label="Skills and technologies">
          {skills.map((s) => (
            <li key={s}>
              <Badge variant="mono" className="normal-case tracking-normal">
                {s}
              </Badge>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-4 text-xs">
        <span className="text-muted-foreground flex items-center gap-1">
          <Users className="size-3.5" aria-hidden="true" />
          {project.member_count} of {project.team_size} members
        </span>
        {project.looking_for_members && project.open_roles?.length > 0 ? (
          <span className="text-success-text font-semibold">Open roles: {project.open_roles.map((r) => r.title).slice(0, 2).join(", ")}</span>
        ) : project.looking_for_members ? (
          <span className="text-success-text font-semibold">Looking for members</span>
        ) : null}
      </div>
    </article>
  );
}
