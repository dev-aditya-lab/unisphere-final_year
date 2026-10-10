import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProjectForm } from "@/components/projects/project-form";
import { DeleteProjectButton, InvitePanel, RequestsPanel, RolesPanel, SuggestionsPanel, TeamPanel } from "@/components/projects/manage-panels";
import { PageHeader } from "@/components/shell/page-header";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getAiUiState } from "@/lib/ai/ui-state";
import { getManagementData, getProjectTeam } from "@/lib/services/projects";
import { isValidSlug } from "@/lib/slug";

export const metadata = { title: "Manage project", robots: { index: false, follow: false } };

export default async function ManageProjectPage({ params }) {
  const { projectSlug } = await params;
  if (!isValidSlug(projectSlug)) notFound();
  const { user, profile } = await requireProfile();
  const supabase = await createClient();

  const { data: project } = await supabase.from("projects").select("*").eq("slug", projectSlug).is("deleted_at", null).maybeSingle();
  if (!project) notFound();
  const team = await getProjectTeam(project.id);
  const me = team.find((m) => m.user_id === user.id);
  if (!me || !["owner", "manager"].includes(me.role)) redirect(`/projects/${projectSlug}`);

  const [{ requests, invitations }, { data: roles }, ai] = await Promise.all([
    getManagementData(project.id),
    supabase.from("project_open_roles").select("id, title, description, skills, is_open").eq("project_id", project.id).order("created_at"),
    getAiUiState(profile),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/projects/${project.slug}`} className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-sm">
        <ArrowLeft className="size-4" /> Back to project
      </Link>
      <PageHeader eyebrow="Manage" title={project.name} />
      <Tabs defaultValue={requests.length ? "requests" : "team"}>
        <TabsList className="mb-4 flex h-auto flex-wrap">
          <TabsTrigger value="team">Team ({team.length})</TabsTrigger>
          <TabsTrigger value="requests">Requests{requests.length ? ` (${requests.length})` : ""}</TabsTrigger>
          <TabsTrigger value="invite">Invite</TabsTrigger>
          <TabsTrigger value="suggestions">Suggested teammates</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>
        <TabsContent value="team" className="surface p-5"><TeamPanel projectId={project.id} team={team} myRole={me.role} /></TabsContent>
        <TabsContent value="requests" className="surface p-5"><RequestsPanel requests={requests} roles={roles ?? []} /></TabsContent>
        <TabsContent value="invite" className="surface p-5"><InvitePanel projectId={project.id} invitations={invitations} /></TabsContent>
        <TabsContent value="suggestions" className="surface p-5"><SuggestionsPanel projectId={project.id} project={project} /></TabsContent>
        <TabsContent value="roles" className="surface p-5"><RolesPanel projectId={project.id} roles={roles ?? []} /></TabsContent>
        <TabsContent value="details">
          <ProjectForm project={project} ai={ai} />
          {me.role === "owner" && (
            <div className="border-destructive/30 mt-6 rounded-lg border p-4">
              <p className="text-destructive text-sm font-bold">Danger zone</p>
              <p className="text-muted-foreground mb-3 text-sm">Only the owner can delete the project.</p>
              <DeleteProjectButton projectId={project.id} name={project.name} />
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
