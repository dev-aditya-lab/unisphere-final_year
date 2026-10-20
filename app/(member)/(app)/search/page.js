import Link from "next/link";
import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PersonCard } from "@/components/people/person-card";
import { QuickConnect } from "@/components/people/quick-connect";
import { PostCard } from "@/components/posts/post-card";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { searchPeople, searchPostsFts } from "@/lib/services/social";
import { CATEGORY_BY_VALUE, POST_CATEGORIES } from "@/lib/content/post-meta";
import { cn } from "@/lib/utils";

export const metadata = { title: "Search", robots: { index: false, follow: false } };

const TYPES = [
  { id: "all", label: "All" },
  { id: "people", label: "People" },
  { id: "posts", label: "Posts" },
];
const selectCls = "border-input bg-card focus-visible:border-ring focus-visible:ring-ring/40 h-9 rounded-md border px-2.5 text-sm outline-none focus-visible:ring-[3px]";

function one(v) {
  return typeof v === "string" ? v.trim() : "";
}

export default async function SearchPage({ searchParams }) {
  const { user, profile } = await requireProfile();
  const sp = await searchParams;
  const q = one(sp.q).slice(0, 120);
  const type = TYPES.some((t) => t.id === sp.type) ? sp.type : "all";
  const category = CATEGORY_BY_VALUE[one(sp.category)] ? one(sp.category) : null;
  const accountType = ["student", "alumni", "faculty", "staff"].includes(one(sp.account)) ? one(sp.account) : null;
  const skill = one(sp.skill).slice(0, 40);
  const collab = sp.collab === "1" ? true : null;
  const mentoring = sp.mentoring === "1" ? true : null;
  const myCollege = sp.scope === "college" ? profile.college_id : null;

  const hasQuery = q.length > 0 || skill.length > 0 || collab || mentoring;
  const limit = await rateLimit({ key: `search:${user.id}`, limit: 60, windowSec: 60 });

  let people = [];
  let posts = [];
  if (hasQuery && limit.ok) {
    const wantPeople = type === "all" || type === "people";
    const wantPosts = (type === "all" || type === "posts") && q.length > 0;
    [people, posts] = await Promise.all([
      wantPeople
        ? searchPeople({ query: q || null, collegeId: myCollege, accountType, skills: skill ? [skill] : null, openToCollab: collab, openToMentoring: mentoring, limit: type === "all" ? 5 : 24 })
        : [],
      wantPosts ? searchPostsFts({ query: q, category, limit: type === "all" ? 6 : 20 }) : [],
    ]);
  }

  const tabHref = (id) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (id !== "all") p.set("type", id);
    return `/search?${p.toString()}`;
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Search" title={q ? `Results for “${q}”` : "Search UniSphere"} description="Find people by name, username or skill, and posts by what they say." />

      <form method="get" action="/search" role="search" className="surface mb-5 space-y-3 p-4">
        <div className="flex gap-2">
          <label htmlFor="search-q" className="sr-only">
            Search query
          </label>
          <input
            id="search-q"
            name="q"
            type="search"
            defaultValue={q}
            maxLength={120}
            placeholder="Try “machine learning”, “Asha”, or a skill"
            className="border-input bg-card focus-visible:border-ring focus-visible:ring-ring/40 h-9 min-w-0 flex-1 rounded-md border px-3 text-sm outline-none focus-visible:ring-[3px]"
          />
          <Button type="submit">Search</Button>
        </div>
        <input type="hidden" name="type" value={type} />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {(type === "all" || type === "people") && (
            <>
              <label className="flex items-center gap-2">
                <span className="text-muted-foreground">People</span>
                <select name="account" defaultValue={accountType ?? ""} className={selectCls} aria-label="Self-described as">
                  <option value="">Anyone</option>
                  <option value="student">Students</option>
                  <option value="alumni">Alumni</option>
                  <option value="faculty">Faculty</option>
                  <option value="staff">Staff</option>
                </select>
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" name="collab" value="1" defaultChecked={Boolean(collab)} className="accent-[var(--primary)]" /> Open to collaborate
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" name="mentoring" value="1" defaultChecked={Boolean(mentoring)} className="accent-[var(--primary)]" /> Open to mentoring
              </label>
            </>
          )}
          {(type === "all" || type === "posts") && (
            <label className="flex items-center gap-2">
              <span className="text-muted-foreground">Posts</span>
              <select name="category" defaultValue={category ?? ""} className={selectCls} aria-label="Post type">
                <option value="">Any type</option>
                {POST_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex items-center gap-1.5">
            <input type="checkbox" name="scope" value="college" defaultChecked={sp.scope === "college"} className="accent-[var(--primary)]" /> My college only
          </label>
          {skill && (
            <span className="bg-accent text-accent-foreground rounded-md px-2 py-1 text-xs font-medium">
              Skill: {skill}
              <input type="hidden" name="skill" value={skill} />
            </span>
          )}
        </div>
      </form>

      <nav aria-label="Result types" className="mb-5 flex gap-1 border-b">
        {TYPES.map((t) => (
          <Link key={t.id} href={tabHref(t.id)} aria-current={type === t.id ? "page" : undefined} className={cn("relative px-3 py-2.5 text-sm font-medium", type === t.id ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
            {t.label}
            {type === t.id && <span aria-hidden="true" className="bg-primary absolute inset-x-3 -bottom-px h-0.5 rounded-full" />}
          </Link>
        ))}
      </nav>

      {!limit.ok && <p role="alert" className="text-destructive-text mb-4 text-sm">You are searching very quickly. Please wait a moment and try again.</p>}

      {!hasQuery ? (
        <EmptyState icon={SearchX} title="Start typing to search">
          Search by a person&rsquo;s name or @username, a skill such as “Python”, or words from a post. Browse <Link className="text-blue-text font-semibold hover:underline" href="/explore">Explore</Link> for ideas on what to look at.
        </EmptyState>
      ) : people.length === 0 && posts.length === 0 && limit.ok ? (
        <EmptyState icon={SearchX} title="No results">
          Nothing matched {q ? `“${q}”` : "those filters"}. Check the spelling, try a broader term, or remove a filter. Only content you are allowed to see appears here.
        </EmptyState>
      ) : (
        <div className="space-y-8">
          {people.length > 0 && (
            <section aria-labelledby="people-results">
              <div className="mb-3 flex items-center justify-between">
                <h2 id="people-results" className="eyebrow">
                  People
                </h2>
                {type === "all" && (
                  <Link href={tabHref("people")} className="text-blue-text text-sm font-semibold hover:underline">
                    See all people
                  </Link>
                )}
              </div>
              <ul className="space-y-3">
                {people.map((p) => (
                  <li key={p.id}>
                    <PersonCard person={p} actions={<QuickConnect personId={p.id} />} />
                  </li>
                ))}
              </ul>
            </section>
          )}
          {posts.length > 0 && (
            <section aria-labelledby="post-results">
              <div className="mb-3 flex items-center justify-between">
                <h2 id="post-results" className="eyebrow">
                  Posts
                </h2>
                {type === "all" && (
                  <Link href={tabHref("posts")} className="text-blue-text text-sm font-semibold hover:underline">
                    See all posts
                  </Link>
                )}
              </div>
              <ul className="space-y-4">
                {posts.map((p) => (
                  <li key={p.id}>
                    <PostCard post={p} viewerId={user.id} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
