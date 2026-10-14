import { PageHeader } from "@/components/shell/page-header";
import { ProjectForm } from "@/components/projects/project-form";
import { requireProfile } from "@/lib/auth/session";
import { getAiUiState } from "@/lib/ai/ui-state";

export const metadata = { title: "New project", robots: { index: false, follow: false } };

export default async function NewProjectPage() {
  const { profile } = await requireProfile();
  const ai = await getAiUiState(profile);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Projects" title="Start a project" description="Describe the problem, the skills you need and the roles you want to fill." />
      <ProjectForm ai={ai} hasCollege={Boolean(profile.college_id)} />
    </div>
  );
}
