import { Suspense } from "react";
import { Newspaper } from "lucide-react";
import { OrbitsFeedStrip, OrbitsFeedWidget } from "@/components/orbits/glance-server";
import { OrbitsWidgetSkeleton } from "@/components/orbits/feed-widgets";
import { Composer } from "@/components/posts/composer";
import { FeedFilters } from "@/components/posts/feed-filters";
import { FeedList } from "@/components/posts/feed-list";
import { EmptyState } from "@/components/empty-state";
import { RightRail } from "@/components/shell/right-rail";
import { TwoColumn } from "@/components/shell/two-column";
import { requireProfile } from "@/lib/auth/session";
import { getFeedPage, getTrendingHashtags } from "@/lib/services/posts";
import { getForYouPage } from "@/lib/services/feed";
import { TuneFeed } from "@/components/posts/tune-feed";
import { getAiUiState } from "@/lib/ai/ui-state";
import { AnnouncementsBanner } from "@/components/posts/announcements-banner";
import { getAnnouncements } from "@/lib/services/campus";
import { CATEGORY_BY_VALUE } from "@/lib/content/post-meta";

export const metadata = { title: "Feed", robots: { index: false, follow: false } };

// "For you" is the default for everyone: it needs no college, no interests and no history (see lib/feed/rank.js).
const SCOPES = new Set(["for_you", "college", "following", "public"]);
const DEFAULT_SCOPE = "for_you";

export default async function FeedPage({ searchParams }) {
  const { profile, user } = await requireProfile();
  const sp = await searchParams;
  // "My college" only exists once a college is connected; without one the feed is general.
  const scope = SCOPES.has(sp.scope) && !(sp.scope === "college" && !profile.college_id) ? sp.scope : DEFAULT_SCOPE;
  const category = CATEGORY_BY_VALUE[sp.category] ? sp.category : null;

  const [page, ai, announcements, topics] = await Promise.all([
    scope === "for_you" ? getForYouPage({ profile, category }) : getFeedPage({ scope, category }),
    getAiUiState(profile),
    getAnnouncements(3),
    scope === "for_you" ? getTrendingHashtags(10) : [],
  ]);

  return (
    <TwoColumn
      aside={
        <div className="space-y-5">
          <Suspense fallback={<OrbitsWidgetSkeleton />}>
            <OrbitsFeedWidget />
          </Suspense>
          <RightRail />
        </div>
      }
    >
      <h1 className="sr-only">Feed</h1>
      <div className="space-y-4">
        <AnnouncementsBanner items={announcements} />
        {/* Below xl the sidebar is hidden, so a compact "today" strip takes its place (it renders nothing on xl and up) */}
        <Suspense fallback={<div aria-hidden="true" className="skeleton h-[4.25rem] xl:hidden" />}>
          <OrbitsFeedStrip />
        </Suspense>
        <Composer profile={profile} ai={ai} />
        <FeedFilters
          scope={scope}
          category={category}
          hasCollege={Boolean(profile.college_id)}
          includeForYou
          defaultScope={DEFAULT_SCOPE}
          actions={scope === "for_you" ? <TuneFeed interests={profile.interests ?? []} topics={topics.map((t) => t.tag)} personalized={profile.personalize_feed !== false} /> : null}
        />
        <FeedList
          // Changing interests re-ranks the page without necessarily changing its order: the list must still be replaced
          key={`${scope}-${category}-${(profile.interests ?? []).join(",")}-${page.items[0]?.id ?? "empty"}`}
          initialItems={page.items}
          initialCursor={page.nextCursor}
          scope={scope}
          category={category}
          viewerId={user.id}
          canSummarize={ai.assist}
          empty={
            <EmptyState icon={Newspaper} title={scope === "following" ? "Nothing from people you follow yet" : scope === "for_you" ? "Nothing to show yet" : "No posts here yet"}>
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
