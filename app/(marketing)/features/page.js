import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Features",
  description: "Social feed, AI idea discovery, project and teammate matching, alumni mentoring, clubs, events and a full moderation system.",
  alternates: { canonical: "/features" },
};

const GROUPS = [
  {
    title: "Share and connect",
    items: [
      ["Campus feed", "Posts, projects, ideas, questions, opportunities and achievements, with reactions, comments, reposts and bookmarks."],
      ["Profiles", "Skills, interests, projects and achievements, with per-profile visibility. Profiles are visible only to signed-in members, and only to the people you allow."],
      ["Connections & messages", "Send connection requests, message people who allow it, and block or report anyone."],
    ],
  },
  {
    title: "Discover with AI",
    items: [
      ["Idea discovery", "Find related posts, projects and discussions on your campus, with an explanation for each result."],
      ["Originality check", "See overlaps and differences before publishing a project idea. No accusations, only context."],
      ["Writing assistant", "Improve clarity, suggest titles and tags, or structure a project description. You approve the final text."],
    ],
  },
  {
    title: "Build together",
    items: [
      ["Projects & open roles", "Describe the problem, tech stack and roles you need. Manage join requests and invitations."],
      ["Teammate suggestions", "Based on listed skills and project requirements, each with a clear reason."],
      ["Alumni & mentoring", "Find seniors by department, industry or skills. Mentoring is always opt-in."],
    ],
  },
  {
    title: "Campus life",
    items: [
      ["Clubs & communities", "Join student chapters and interest groups, with official announcements clearly separated."],
      ["Events", "Create and discover events, RSVP, and get reminders, with time-zone-aware dates."],
      ["Opportunities", "Internships, research and competitions shared by the community."],
    ],
  },
  {
    title: "Recognition and rewards",
    items: [
      ["Orbits", "A daily bonus, a Daily Challenge, an Orbit Streak, badges and leaderboards that recognise taking part. Orbits cannot be bought, sold or exchanged."],
      ["Refer & Earn", "Share your invite link and earn 100 Orbits for each friend who joins and becomes an active member, once per friend, with a referral leaderboard of its own."],
      ["Privacy for rewards", "Choose whether you appear on leaderboards or show your balance. You never see the names of the friends you invited."],
    ],
  },
  {
    title: "Trust and safety",
    items: [
      ["Your colleges, your way", "Add every school and college you belong to, past or present, and say whether you were a student, alumnus, teacher or staff member at each. If your department or course is not listed, add it yourself."],
      ["Community-grown college directory", "Search for your college or add it by name. Listings added by members are labelled community-added, can be corrected by anyone, and duplicates are merged by moderators."],
      ["Moderation & appeals", "Reports, severity levels, moderator notes, restrictions and an appeals workflow. Humans make every enforcement decision."],
      ["Role-based administration", "Global admins, college admins, moderators, verification staff and support agents, each with scoped permissions and an audit log."],
    ],
  },
];

export default function FeaturesPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
      <p className="eyebrow mb-2">Features</p>
      <h1 className="max-w-2xl text-4xl font-extrabold sm:text-5xl">Everything your campus community needs to build together.</h1>
      <div className="mt-14 space-y-14">
        {GROUPS.map((g) => (
          <section key={g.title} aria-labelledby={g.title.replace(/\s+/g, "-")}>
            <h2 id={g.title.replace(/\s+/g, "-")} className="border-b pb-3 text-2xl">{g.title}</h2>
            <dl className="mt-6 grid grid-cols-1 gap-x-10 gap-y-6 md:grid-cols-3">
              {g.items.map(([t, d]) => (
                <div key={t}>
                  <dt className="font-heading font-bold">{t}</dt>
                  <dd className="text-muted-foreground mt-1 text-sm leading-relaxed">{d}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <div className="mt-10">
        <Button asChild size="lg">
          <Link href="/register">Join UniSphere</Link>
        </Button>
      </div>
    </div>
  );
}
