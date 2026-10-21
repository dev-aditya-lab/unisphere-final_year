import Link from "next/link";
import { Handshake } from "@/components/icons/lucide-compat";
import { GraduationCap } from "@/components/icons/lucide-compat";
import { Badge } from "@/components/ui/badge";
import { BlueTick } from "@/components/ui/blue-tick";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";

const TYPE_LABEL = { student: "Student", alumni: "Alumni", faculty: "Faculty", staff: "Staff" };

/**
 * Compact person row/card. `reason` explains why someone is shown (shared skills etc.);
 * `actions` is a slot for connect / accept buttons.
 */
export function PersonCard({ person, reason, actions, className, showSkills = true }) {
  const skills = (person.skills ?? []).slice(0, 4);
  return (
    <div className={cn("surface grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-3 p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto]", className)}>
      <Link href={`/u/${person.username}`} aria-label={`${person.full_name}'s profile`} className="shrink-0">
        <UserAvatar name={person.full_name} avatarKey={person.avatar_key} size="lg" />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2">
          <Link href={`/u/${person.username}`} className="font-heading flex items-center gap-1 font-bold hover:underline">
            {person.full_name}
            {person.blue_tick && <BlueTick className="size-4" />}
          </Link>
          <span className="text-muted-foreground text-xs">@{person.username}</span>
        </div>
        <p className="text-muted-foreground mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 text-sm">
          <span title={person.account_type ? "Self-described" : undefined}>{TYPE_LABEL[person.account_type] ?? "Member"}</span>
          {person.graduation_year && (
            <span className="flex items-center gap-1">
              <GraduationCap className="size-3.5" aria-hidden="true" /> {person.graduation_year}
            </span>
          )}
          {person.headline && <span className="max-w-full min-w-0 truncate">· {person.headline}</span>}
        </p>
        {showSkills && skills.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1" aria-label="Skills">
            {skills.map((s) => (
              <li key={s}>
                <Badge variant="mono" className="normal-case tracking-normal">
                  {s}
                </Badge>
              </li>
            ))}
          </ul>
        )}
        {(person.open_to_collaboration || person.open_to_mentoring) && (
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {person.open_to_collaboration && (
              <span className="text-success-text flex items-center gap-1 font-medium">
                <Handshake className="size-3.5" aria-hidden="true" /> Open to collaborate
              </span>
            )}
            {person.open_to_mentoring && (
              <span className="text-coral-text flex items-center gap-1 font-medium">
                <GraduationCap className="size-3.5" aria-hidden="true" /> Open to mentoring
              </span>
            )}
          </p>
        )}
        {reason && <p className="text-muted-foreground mt-2 text-xs">{reason}</p>}
      </div>
      {actions && <div className="col-start-2 sm:col-start-3">{actions}</div>}
    </div>
  );
}
