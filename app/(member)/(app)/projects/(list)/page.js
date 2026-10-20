import Link from "next/link";
import { FolderKanban, Plus } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ProjectCard } from "@/components/projects/project-card";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth/session";
import { getMyInvitations, getMyProjects, searchProjects } from "@/lib/services/projects";
import { PROJECT_STATUSES } from "@/lib/validators/project";
import { cn } from "@/lib/utils";

export const metadata = { title: "Projects", robots: { index: false, follow: false } };

const selectCls = "border-input bg-card focus-visible:border-ring focus-visible:ring-ring/40 h-9 rounded-md border px-2.5 text-sm outline-none focus-visible:ring-[3px]";

export default async function ProjectsPage({ searchParams }) {
  const { user } = await requireProfile();
  const sp = await searchParams;
  const tab = sp.tab === "mine" ? "mine" : "discover";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const status = PROJECT_STATUSES.some((s) => s.value === sp.status) ? sp.status : null;
  const looking = sp.open === "1" ? true : null;
  const skill = typeof sp.skill === "string" ? sp.skill.trim().slice(0, 40) : "";

  const [invitations, mine, found] = await Promise.all([
    getMyInvitations(user.id),
    tab === "mine" ? getMyProjects(user.id) : [],
    tab === "discover" ? searchProjects({ query: q || null, status, skills: skill ? [skill] : null, looking }) : [],
  ]);
  const list = tab === "mine" ? mine : found;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow="Build"
        title="Projects"
        description="Find a project to join, or start one and recruit teammates."
        actions={
          <Button asChild variant="hot">
            <Link href="/projects/new">
              <Plus /> New project
            </Link>
          </Button>
        }
      />

      {invitations.length > 0 && (
        <section className="bg-accent/50 mb-5 rounded-lg border p-4" aria-label="Project invitations">
          <h2 className="text-sm font-bold">You have {invitations.length} project invitation{invitations.length > 1 ? "s" : ""}</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {invitations.map((i) => (
              <li key={i.id}>
                <Link href={`/projects/${i.project.slug}`} className="text-blue-text font-semibold hover:underline">{i.project.name}</Link>
                <span className="text-muted-foreground"> from {i.project.owner_name}{i.role_label ? ` · ${i.role_label}` : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <nav aria-label="Project lists" className="mb-5 flex gap-1 border-b">
        {[["discover", "Discover"], ["mine", "My projects"]].map(([id, label]) => (
          <Link key={id} href={`/projects${id === "mine" ? "?tab=mine" : ""}`} aria-current={tab === id ? "page" : undefined} className={cn("relative px-3 py-2.5 text-sm font-medium", tab === id ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
            {label}
            {tab === id && <span aria-hidden="true" className="bg-primary absolute inset-x-3 -bottom-px h-0.5 rounded-full" />}
          </Link>
        ))}
      </nav>

      {tab === "discover" && (
        <form method="get" action="/projects" role="search" className="surface mb-5 flex flex-wrap items-center gap-2 p-3">
          <label htmlFor="project-q" className="sr-only">Search projects</label>
          <input id="project-q" name="q" type="search" defaultValue={q} placeholder="Search projects" maxLength={100} className="border-input bg-card focus-visible:border-ring focus-visible:ring-ring/40 h-9 min-w-48 flex-1 rounded-md border px-3 text-sm outline-none focus-visible:ring-[3px]" />
          <select name="status" defaultValue={status ?? ""} className={selectCls} aria-label="Status">
            <option value="">Any status</option>
            {PROJECT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <input name="skill" defaultValue={skill} placeholder="Skill, e.g. Python" maxLength={40} aria-label="Skill or technology" className="border-input bg-card focus-visible:border-ring focus-visible:ring-ring/40 h-9 w-40 rounded-md border px-3 text-sm outline-none focus-visible:ring-[3px]" />
          <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="open" value="1" defaultChecked={Boolean(looking)} className="accent-[var(--primary)]" /> Recruiting</label>
          <Button type="submit">Filter</Button>
        </form>
      )}

      {list.length === 0 ? (
        <EmptyState icon={FolderKanban} title={tab === "mine" ? "You are not on any project yet" : "No projects match"} action={<Button asChild><Link href="/projects/new">Start a project</Link></Button>}>
          {tab === "mine" ? "Create a project or request to join one." : "Try fewer filters, or start the first project in this area."}
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {list.map((p) => (
            <li key={p.id}>
              <ProjectCard project={p} className="h-full" />
              {tab === "mine" && <p className="text-muted-foreground mt-1 px-1 text-xs capitalize">You are the {p.myRole}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
