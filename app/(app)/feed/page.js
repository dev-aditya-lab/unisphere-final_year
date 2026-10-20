import { Newspaper } from "lucide-react";
import { Composer } from "@/components/posts/composer";
import { FeedFilters } from "@/components/posts/feed-filters";
import { FeedList } from "@/components/posts/feed-list";
import { EmptyState } from "@/components/empty-state";
import { RightRail } from "@/components/shell/right-rail";
import { TwoColumn } from "@/components/shell/two-column";
import { requireProfile } from "@/lib/auth/session";
import { getFeedPage } from "@/lib/services/posts";
import { getAiUiState } from "@/lib/ai/ui-state";
import { AnnouncementsBanner } from "@/components/posts/announcements-banner";
import { getAnnouncements } from "@/lib/services/campus";
import { CATEGORY_BY_VALUE } from "@/lib/content/post-meta";

export const metadata = { title: "Feed", robots: { index: false, follow: false } };

const SCOPES = new Set(["college", "following", "public"]);

export default async function FeedPage({ searchParams }) {
  const { profile, user } = await requireProfile();
  const sp = await searchParams;
  const defaultScope = profile.college_id ? "college" : "public";
  // "My college" only exists once a college is connected; without one the feed is general.
  const scope = SCOPES.has(sp.scope) && !(sp.scope === "college" && !profile.college_id) ? sp.scope : defaultScope;
  const category = CATEGORY_BY_VALUE[sp.category] ? sp.category : null;

  const [page, ai, announcements] = await Promise.all([getFeedPage({ scope, category }), getAiUiState(profile), getAnnouncements(3)]);

  return (
    <TwoColumn aside={<RightRail />}>
      <h1 className="sr-only">Feed</h1>
      <div className="space-y-4">
        <AnnouncementsBanner items={announcements} />
        <Composer profile={profile} ai={ai} />
        <FeedFilters scope={scope} category={category} hasCollege={Boolean(profile.college_id)} />
        <FeedList
          key={`${scope}-${category}-${page.items[0]?.id ?? "empty"}`}
          initialItems={page.items}
          initialCursor={page.nextCursor}
          scope={scope}
          category={category}
          viewerId={user.id}
          empty={
            <EmptyState icon={Newspaper} title={scope === "following" ? "Nothing from people you follow yet" : "No posts here yet"}>
              {scope === "following"
                ? "Follow people or send connection requests and their posts will show up here."
                : category
                  ? "Be the first to post in this category."
                  : "Share a project, idea or question to get the conversation started."}
            </EmptyState>
          }
        />
      </div>
    </TwoColumn>
  );
}
