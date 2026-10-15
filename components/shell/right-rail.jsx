import Link from "next/link";
import { Hash } from "lucide-react";
import { BadgeCheck } from "lucide-react";
import { BlueTick } from "@/components/ui/blue-tick";
import { UserAvatar } from "@/components/user-avatar";
import { QuickConnect } from "@/components/people/quick-connect";
import { getTrendingHashtags } from "@/lib/services/posts";
import { getSuggestedPeople } from "@/lib/services/social";

/** Contextual sidebar: what is trending (public posts only) and people you may want to know. */
export async function RightRail({ showPeople = true, showTrending = true }) {
  const [tags, people] = await Promise.all([showTrending ? getTrendingHashtags(8) : [], showPeople ? getSuggestedPeople(5) : []]);

  return (
    <div className="space-y-5">
      {showTrending && (
        <section className="surface p-4" aria-labelledby="trending-title">
          <h2 id="trending-title" className="eyebrow mb-3">
            Trending tags
          </h2>
          {tags.length === 0 ? (
            <p className="text-muted-foreground text-sm">Tags appear here once people start using #hashtags in public posts.</p>
          ) : (
            <ul className="space-y-1">
              {tags.map((t) => (
                <li key={t.tag}>
                  <Link href={`/explore?tag=${t.tag}`} className="hover:bg-muted flex items-center justify-between rounded-md px-2 py-1.5 text-sm">
                    <span className="flex items-center gap-1.5 font-medium">
                      <Hash className="text-muted-foreground size-3.5" aria-hidden="true" />
                      {t.tag}
                    </span>
                    <span className="text-muted-foreground text-xs">{Number(t.uses)} posts</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {showPeople && (
        <section className="surface p-4" aria-labelledby="people-title">
          <h2 id="people-title" className="eyebrow mb-3">
            People you may know
          </h2>
          {people.length === 0 ? (
            <p className="text-muted-foreground text-sm">Suggestions appear as more people from your college join and add skills.</p>
          ) : (
            <ul className="space-y-3">
              {people.map((p) => {
                const reason = p.shared_skills?.length
                  ? `Shares your skills: ${p.shared_skills.slice(0, 2).join(", ")}`
                  : p.shared_interests?.length
                    ? `Shares your interests: ${p.shared_interests.slice(0, 2).join(", ")}`
                    : p.same_department
                      ? "In your department"
                      : "From your college";
                return (
                  <li key={p.id} className="flex items-center gap-2.5">
                    <Link prefetch={false} href={`/u/${p.username}`} className="shrink-0" aria-label={`${p.full_name}'s profile`}>
                      <UserAvatar name={p.full_name} avatarKey={p.avatar_key} size="sm" />
                    </Link>
                    <div className="min-w-0 flex-1 leading-tight">
                      <Link prefetch={false} href={`/u/${p.username}`} className="flex items-center gap-1 truncate text-sm font-semibold hover:underline">
                        {p.full_name}
                        {p.blue_tick && <BlueTick className="size-3.5" />}
                        {p.verified && <BadgeCheck className="text-teal-text size-3.5 shrink-0" aria-label="Verified" />}
                      </Link>
                      <p className="text-muted-foreground truncate text-xs">{reason}</p>
                    </div>
                    <QuickConnect personId={p.id} />
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
