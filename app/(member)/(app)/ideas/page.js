import { Lightbulb } from "@/components/icons/lucide-compat";
import { Composer } from "@/components/posts/composer";
import { FeedList } from "@/components/posts/feed-list";
import { FeedFilters } from "@/components/posts/feed-filters";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { RightRail } from "@/components/shell/right-rail";
import { TwoColumn } from "@/components/shell/two-column";
import { requireProfile } from "@/lib/auth/session";
import { getFeedPage } from "@/lib/services/posts";
import { getAiUiState } from "@/lib/ai/ui-state";

export const metadata = { title: "Ideas", robots: { index: false, follow: false } };

const SCOPES = new Set(["college", "following", "public"]);

export default async function IdeasPage({ searchParams }) {
  const { profile, user } = await requireProfile();
  const sp = await searchParams;
  const scope = SCOPES.has(sp.scope) && !(sp.scope === "college" && !profile.college_id) ? sp.scope : profile.college_id ? "college" : "public";
  const [page, ai] = await Promise.all([getFeedPage({ scope, category: "ideas" }), getAiUiState(profile)]);

  return (
    <TwoColumn aside={<RightRail showPeople={false} />}>
      <PageHeader eyebrow="Ideas" title="Share an idea, find who is already on it" description="Post an idea to get feedback and teammates. Related ideas and projects from your campus show up as you write." />
      <div className="space-y-4">
        <Composer profile={profile} defaultCategory="ideas" lockCategory ai={ai} />
        <FeedFilters scope={scope} category={null} hideCategories hasCollege={Boolean(profile.college_id)} />
        <FeedList
          key={`${scope}-${page.items[0]?.id ?? "empty"}`}
          initialItems={page.items}
          initialCursor={page.nextCursor}
          scope={scope}
          category="ideas"
          viewerId={user.id}
          empty={
            <EmptyState icon={Lightbulb} title="No ideas shared yet">
              Be the first. Describe the problem you want to solve and what you have in mind.
            </EmptyState>
          }
        />
      </div>
    </TwoColumn>
  );
}
