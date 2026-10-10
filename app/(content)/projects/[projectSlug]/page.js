import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Settings2, Target, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { JsonLd } from "@/components/json-ld";
import { JoinPanel } from "@/components/projects/join-panel";
import { StatusBadge } from "@/components/projects/project-card";
import { UserAvatar } from "@/components/user-avatar";
import { getAuthUser } from "@/lib/auth/session";
import { getProjectBySlug, getProjectTeam, getViewerProjectState } from "@/lib/services/projects";
import { isValidSlug } from "@/lib/slug";
import { publicEnv } from "@/lib/env-public";
import { excerpt } from "@/lib/text";

export async function generateMetadata({ params }) {
  const { projectSlug } = await params;
  const project = isValidSlug(projectSlug) ? await getProjectBySlug(projectSlug) : null;
  if (!project) return { title: "Project not found", robots: { index: false, follow: false } };
  const description = excerpt(project.tagline || project.problem || `${project.name}, a project on UniSphere`, 160);
  const isPublic = project.visibility === "public";
  return {
    title: project.name,
    description,
    alternates: { canonical: `/projects/${project.slug}` },
    robots: isPublic ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: isPublic ? { type: "article", title: project.name, description } : undefined,
  };
}

function Section({ title, children }) {
  return (
    <section className="surface p-5">
      <h2 className="eyebrow mb-3">{title}</h2>
      {children}
    </section>
  );
}

export default async function ProjectPage({ params }) {
  const { projectSlug } = await params;
  if (!isValidSlug(projectSlug)) notFound();
  const project = await getProjectBySlug(projectSlug);
  if (!project) notFound();

  const user = await getAuthUser();
  const [team, viewerState] = await Promise.all([getProjectTeam(project.id), getViewerProjectState(project.id, user?.id)]);
  const me = team.find((m) => m.user_id === user?.id);
  const isManager = me && ["owner", "manager"].includes(me.role);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {project.visibility === "public" && (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "CreativeWork",
            name: project.name,
            description: project.tagline || project.problem || undefined,
            url: `${publicEnv.appUrl}/projects/${project.slug}`,
            creator: { "@type": "Person", name: project.owner_name, url: `${publicEnv.appUrl}/u/${project.owner_username}` },
            keywords: [...project.tech_stack, ...project.required_skills].join(", "),
            dateCreated: project.created_at,
          }}
        />
      )}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink asChild><Link href={user ? "/projects" : "/"}>{user ? "Projects" : "Home"}</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>{project.name}</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="surface p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={project.status} />
              {project.visibility !== "public" && <Badge variant="mono">{project.visibility === "private" ? "Team only" : "College"}</Badge>}
              {project.looking_for_members && <Badge variant="success">Recruiting</Badge>}
            </div>
            <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">{project.name}</h1>
            {project.tagline && <p className="text-muted-foreground mt-1">{project.tagline}</p>}
            <p className="mt-3 flex items-center gap-2 text-sm">
              <UserAvatar name={project.owner_name} avatarKey={project.owner_avatar_key} size="xs" />
              <Link href={`/u/${project.owner_username}`} className="font-semibold hover:underline">{project.owner_name}</Link>
              <span className="text-muted-foreground">· owner</span>
            </p>
          </div>
          {isManager && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/projects/${project.slug}/manage`}><Settings2 /> Manage</Link>
            </Button>
          )}
        </div>
        <div className="mt-5 border-t pt-4">
          <JoinPanel project={project} viewerId={user?.id ?? null} myRole={me?.role ?? null} request={viewerState.request} invitation={viewerState.invitation} />
        </div>
        {(project.repo_url || project.demo_url) && (
          <div className="mt-4 flex flex-wrap gap-2">
            {project.repo_url && <Button asChild variant="outline" size="sm"><a href={project.repo_url} target="_blank" rel="noopener noreferrer nofollow ugc">Repository <ExternalLink /></a></Button>}
            {project.demo_url && <Button asChild variant="outline" size="sm"><a href={project.demo_url} target="_blank" rel="noopener noreferrer nofollow ugc">Demo <ExternalLink /></a></Button>}
          </div>
        )}
      </header>

      {project.problem && <Section title="Problem"><p className="text-[15px] leading-relaxed whitespace-pre-wrap">{project.problem}</p></Section>}
      {project.goals.length > 0 && (
        <Section title="Goals">
          <ul className="space-y-1.5 text-[15px]">{project.goals.map((g) => <li key={g} className="flex gap-2"><Target className="text-primary mt-1 size-4 shrink-0" aria-hidden="true" />{g}</li>)}</ul>
        </Section>
      )}
      {project.solution && <Section title="Proposed solution"><p className="text-[15px] leading-relaxed whitespace-pre-wrap">{project.solution}</p></Section>}

      {(project.tech_stack.length > 0 || project.required_skills.length > 0) && (
        <Section title="Tech & skills">
          {project.tech_stack.length > 0 && <ul className="mb-3 flex flex-wrap gap-1.5" aria-label="Tech stack">{project.tech_stack.map((t) => <li key={t}><Badge variant="soft" className="py-1 text-[13px]">{t}</Badge></li>)}</ul>}
          {project.required_skills.length > 0 && (
            <>
              <p className="text-muted-foreground mb-1.5 text-xs font-semibold">Skills the team needs</p>
              <ul className="flex flex-wrap gap-1.5">{project.required_skills.map((t) => <li key={t}><Badge variant="mono" className="normal-case tracking-normal">{t}</Badge></li>)}</ul>
            </>
          )}
        </Section>
      )}

      {project.open_roles?.length > 0 && (
        <Section title="Open roles">
          <ul className="divide-y">
            {project.open_roles.map((r) => (
              <li key={r.id} className="py-3 first:pt-0 last:pb-0">
                <p className="text-sm font-semibold">{r.title}</p>
                {r.description && <p className="text-muted-foreground text-sm">{r.description}</p>}
                {r.skills?.length > 0 && <p className="text-muted-foreground mt-1 text-xs">Skills: {r.skills.join(", ")}</p>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title={`Team (${project.member_count} of ${project.team_size})`}>
        <ul className="grid gap-3 sm:grid-cols-2">
          {team.map((m) => (
            <li key={m.user_id} className="flex items-center gap-2.5">
              <UserAvatar name={m.person.full_name} avatarKey={m.person.avatar_key} size="sm" />
              <div className="min-w-0 leading-tight">
                {m.person.username ? <Link href={`/u/${m.person.username}`} className="truncate text-sm font-semibold hover:underline">{m.person.full_name}</Link> : <span className="text-sm font-semibold">{m.person.full_name}</span>}
                <p className="text-muted-foreground flex items-center gap-1 text-xs capitalize"><Users className="size-3" aria-hidden="true" />{m.title || m.role}</p>
              </div>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
