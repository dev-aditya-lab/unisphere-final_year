import { BadgeCheck, Bookmark, Heart, Lightbulb, MessageCircle, Repeat2, Sparkles, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Illustrative product previews for the landing page. They are static markup, not live data, and every
 * composition is labelled as an example so nobody mistakes it for real members or posts.
 */

function Person({ initials, name, meta, verified }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="bg-secondary text-secondary-foreground flex size-9 items-center justify-center rounded-full text-xs font-bold" aria-hidden="true">
        {initials}
      </span>
      <div className="leading-tight">
        <p className="flex items-center gap-1 text-sm font-bold">
          {name}
          {verified && <BadgeCheck className="text-teal-text size-3.5" aria-label="Verified" />}
        </p>
        <p className="text-muted-foreground text-xs">{meta}</p>
      </div>
    </div>
  );
}

function Note({ person, category, tone, children, stats, className }) {
  return (
    <article className={cn("surface-raised tone-stripe p-4", tone, className)}>
      <div className="flex items-start justify-between gap-2">
        {person}
        <span className="tone-chip rounded-md px-2 py-0.5 text-xs font-semibold">{category}</span>
      </div>
      <div className="mt-3 text-sm leading-relaxed">{children}</div>
      <div className="text-muted-foreground mt-3 flex items-center gap-4 border-t pt-2.5 text-xs">
        <span className="flex items-center gap-1"><Heart className="size-3.5" aria-hidden="true" /> {stats[0]}</span>
        <span className="flex items-center gap-1"><MessageCircle className="size-3.5" aria-hidden="true" /> {stats[1]}</span>
        <span className="flex items-center gap-1"><Repeat2 className="size-3.5" aria-hidden="true" /> {stats[2]}</span>
        <Bookmark className="ml-auto size-3.5" aria-hidden="true" />
      </div>
    </article>
  );
}

/** The hero: three notes pinned at slightly different angles. Stacked and straight on small screens. */
export function HeroCollage({ className }) {
  return (
    <figure className={cn("relative", className)}>
      <div className="grid gap-4 lg:block lg:h-[33rem]">
        <Note
          className="lg:absolute lg:top-0 lg:left-0 lg:w-[82%] lg:-rotate-2"
          tone="tone-blue"
          person={<Person initials="AK" name="Asha K." meta="Example · 3rd year, CSE" verified />}
          category="Project"
          stats={[24, 6, 3]}
        >
          Shipped the first version of a hostel laundry-slot tracker. Looking for someone comfortable with React Native to help with notifications.
        </Note>
        <Note
          className="lg:absolute lg:top-[10.5rem] lg:right-0 lg:w-[80%] lg:rotate-[1.5deg]"
          tone="tone-rose"
          person={<Person initials="RM" name="Rohan M." meta="Example · Alumnus, 2021" verified />}
          category="Experience"
          stats={[41, 9, 12]}
        >
          What I wish I had known before my first internship interview: three things that actually mattered.
        </Note>
        <Note
          className="lg:absolute lg:bottom-0 lg:left-6 lg:w-[78%] lg:-rotate-1"
          tone="tone-plum"
          person={<Person initials="PD" name="Priya D." meta="Example · 2nd year, ECE" />}
          category="Question"
          stats={[8, 14, 1]}
        >
          Has anyone worked with low-power sensors for campus air-quality monitoring? Where would you start?
        </Note>
        <span
          aria-hidden="true"
          className="border-foreground bg-sun text-foreground absolute -top-3 right-3 hidden rotate-6 rounded-lg border px-3 py-1.5 text-xs font-extrabold shadow-[2px_2px_0_0_var(--hard)] lg:block"
        >
          3 open roles
        </span>
      </div>
      <figcaption className="text-muted-foreground mt-4 text-xs font-medium lg:absolute lg:right-0 lg:-bottom-8">Example posts, not real members.</figcaption>
    </figure>
  );
}

function Panel({ label, children, className }) {
  return (
    <figure className={cn("surface-raised overflow-hidden", className)}>
      <figcaption className="bg-sunken flex items-center justify-between border-b px-4 py-2.5">
        <span className="eyebrow">{label}</span>
        <span className="text-muted-foreground text-[11px] font-semibold">Example</span>
      </figcaption>
      <div className="p-4 sm:p-5">{children}</div>
    </figure>
  );
}

/** AI-assisted results carry a teal edge and a label; the member's own words and real posts do not. */
export function DiscoveryPreview({ className }) {
  return (
    <Panel label="Idea discovery" className={className}>
      <div className="bg-sunken rounded-xl p-3.5">
        <p className="eyebrow mb-1.5 flex items-center gap-1.5"><Lightbulb className="size-3.5" aria-hidden="true" /> Your idea</p>
        <p className="text-sm">I want to build an AI system that helps reduce food waste in college hostels.</p>
      </div>

      <p className="mt-5 mb-2 flex items-center gap-1.5 text-xs font-bold tracking-wide uppercase">
        <span className="tone-teal tone-chip inline-flex items-center gap-1 rounded-md px-1.5 py-0.5"><Sparkles className="size-3" aria-hidden="true" /> Found for you</span>
        <span className="text-muted-foreground font-medium normal-case">Real posts and projects on campus</span>
      </p>
      <ul className="space-y-2.5">
        <li className="bg-card tone-blue tone-stripe rounded-xl border p-3.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-bold">Smart Mess Waste Tracker</p>
            <span className="tone-chip rounded-md px-2 py-0.5 text-xs font-semibold">Project</span>
          </div>
          <p className="text-muted-foreground mt-1 text-xs">Why it matches: tracks leftover food per meal in the mess and shares your “food waste” focus.</p>
        </li>
        <li className="bg-card tone-plum tone-stripe rounded-xl border p-3.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-bold">Reducing food waste in hostels</p>
            <span className="tone-chip rounded-md px-2 py-0.5 text-xs font-semibold">Discussion</span>
          </div>
          <p className="text-muted-foreground mt-1 text-xs">Why it matches: 14 replies about portion sizes and weekend demand.</p>
        </li>
      </ul>

      <div className="tone-teal bg-teal/10 border-teal/40 mt-5 rounded-xl border border-dashed p-3.5">
        <p className="text-teal-text flex items-center gap-1.5 text-xs font-bold tracking-wide uppercase">
          <Sparkles className="size-3.5" aria-hidden="true" /> AI suggestion, not a fact
        </p>
        <p className="mt-1.5 text-sm">Add meal-demand forecasting using historical mess data, so the kitchen can prepare closer to what is actually eaten.</p>
      </div>
      <p className="text-muted-foreground mt-3 text-xs">In the app every result links to a real post and says why it was suggested.</p>
    </Panel>
  );
}

export function TeamPreview({ className }) {
  return (
    <Panel label="Open roles" className={className}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-heading text-lg font-bold">Campus Lost &amp; Found</p>
          <p className="text-muted-foreground text-xs">In progress · 3 of 5 members</p>
        </div>
        <span className="tone-leaf tone-chip rounded-md px-2 py-0.5 text-xs font-semibold">Open roles</span>
      </div>
      <ul className="mt-4 space-y-2.5">
        {[
          ["Mobile developer", ["React Native", "Firebase"]],
          ["UI/UX designer", ["Figma", "User research"]],
        ].map(([role, skills]) => (
          <li key={role} className="bg-card flex items-center justify-between gap-3 rounded-xl border p-3">
            <div>
              <p className="text-sm font-bold">{role}</p>
              <p className="mt-1 flex flex-wrap gap-1">
                {skills.map((s) => (
                  <span key={s} className="bg-sunken text-muted-foreground rounded-md px-1.5 py-0.5 text-[11px] font-medium">{s}</span>
                ))}
              </p>
            </div>
            <span className="text-blue-text flex items-center gap-1 text-xs font-bold"><UserPlus className="size-3.5" aria-hidden="true" /> Request to join</span>
          </li>
        ))}
      </ul>
      <div className="tone-teal bg-teal/10 border-teal/40 mt-4 rounded-xl border border-dashed p-3 text-xs">
        <p className="text-teal-text flex items-center gap-1.5 font-bold"><Sparkles className="size-3.5" aria-hidden="true" /> Suggested teammate</p>
        <p className="text-muted-foreground mt-1">
          Listed skills <strong className="text-foreground">Figma</strong> and <strong className="text-foreground">User research</strong> match this role, and they have marked themselves open to collaboration.
        </p>
      </div>
    </Panel>
  );
}
