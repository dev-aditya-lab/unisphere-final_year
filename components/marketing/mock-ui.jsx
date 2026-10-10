import { BadgeCheck, Bookmark, Heart, Lightbulb, MessageCircle, Repeat2, Sparkles, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Illustrative product previews for the landing page. They are static markup, not live data,
 * and every frame is labelled as an example so nobody mistakes them for real users or posts.
 */

function Frame({ label, children, className }) {
  return (
    <figure className={cn("surface overflow-hidden", className)}>
      <figcaption className="bg-muted/60 flex items-center justify-between border-b px-4 py-2">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="bg-border size-2.5 rounded-full" />
          <span className="bg-border size-2.5 rounded-full" />
          <span className="bg-border size-2.5 rounded-full" />
        </span>
        <span className="eyebrow">{label}</span>
      </figcaption>
      <div className="p-4 sm:p-5">{children}</div>
    </figure>
  );
}

function Person({ initials, name, meta, verified }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="bg-accent text-accent-foreground flex size-9 items-center justify-center rounded-full text-xs font-bold" aria-hidden="true">
        {initials}
      </span>
      <div className="leading-tight">
        <p className="flex items-center gap-1 text-sm font-semibold">
          {name}
          {verified && <BadgeCheck className="text-primary size-3.5" aria-label="Verified" />}
        </p>
        <p className="text-muted-foreground text-xs">{meta}</p>
      </div>
    </div>
  );
}

function PostCard({ person, category, tone, children, stats }) {
  return (
    <article className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        {person}
        <Badge variant={tone}>{category}</Badge>
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

export function FeedPreview({ className }) {
  return (
    <Frame label="Example feed" className={className}>
      <div className="space-y-3">
        <PostCard
          person={<Person initials="AK" name="Asha K." meta="Example · 3rd year, CSE" verified />}
          category="Project"
          tone="soft"
          stats={[24, 6, 3]}
        >
          Shipped the first version of a hostel laundry-slot tracker. Looking for someone comfortable with React Native to help with notifications.
        </PostCard>
        <PostCard
          person={<Person initials="RM" name="Rohan M." meta="Example · Alumnus, 2021" verified />}
          category="Experience"
          tone="success"
          stats={[41, 9, 12]}
        >
          What I wish I had known before my first internship interview: three things that actually mattered.
        </PostCard>
        <PostCard
          person={<Person initials="PD" name="Priya D." meta="Example · 2nd year, ECE" />}
          category="Question"
          tone="warning"
          stats={[8, 14, 1]}
        >
          Has anyone worked with low-power sensors for campus air-quality monitoring? Where would you start?
        </PostCard>
      </div>
    </Frame>
  );
}

export function DiscoveryPreview({ className }) {
  return (
    <Frame label="Example: idea discovery" className={className}>
      <div className="rounded-lg border bg-card p-3.5">
        <p className="eyebrow mb-1.5 flex items-center gap-1.5"><Lightbulb className="size-3.5" aria-hidden="true" /> Your idea</p>
        <p className="text-sm">I want to build an AI system that helps reduce food waste in college hostels.</p>
      </div>

      <p className="eyebrow mt-5 mb-2 flex items-center gap-1.5"><Sparkles className="size-3.5" aria-hidden="true" /> Related on campus</p>
      <ul className="space-y-2.5">
        <li className="rounded-lg border bg-card p-3.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">Smart Mess Waste Tracker</p>
            <Badge variant="soft">Project</Badge>
          </div>
          <p className="text-muted-foreground mt-1 text-xs">Why it matches: tracks leftover food per meal in the mess; shares your goal and the “food waste” focus.</p>
        </li>
        <li className="rounded-lg border bg-card p-3.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">Reducing food waste in hostels</p>
            <Badge variant="warning">Discussion</Badge>
          </div>
          <p className="text-muted-foreground mt-1 text-xs">Why it matches: 14 replies about portion sizes and weekend demand.</p>
        </li>
      </ul>

      <p className="eyebrow mt-5 mb-2">A direction to consider</p>
      <p className="rounded-lg border border-dashed p-3.5 text-sm">
        Add meal-demand forecasting using historical mess data, so the kitchen can prepare closer to what is actually eaten.
      </p>
      <p className="text-muted-foreground mt-3 text-xs">Examples only. In the app, every result links to a real post and explains why it was suggested.</p>
    </Frame>
  );
}

export function TeamPreview({ className }) {
  return (
    <Frame label="Example: open roles" className={className}>
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-heading text-base font-bold">Campus Lost &amp; Found</p>
            <p className="text-muted-foreground text-xs">Example project · In progress · 3 of 5 members</p>
          </div>
          <Badge variant="success">Open roles</Badge>
        </div>
        <ul className="mt-4 space-y-2.5">
          {[
            ["Mobile developer", ["React Native", "Firebase"]],
            ["UI/UX designer", ["Figma", "User research"]],
          ].map(([role, skills]) => (
            <li key={role} className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div>
                <p className="text-sm font-semibold">{role}</p>
                <p className="mt-1 flex flex-wrap gap-1">
                  {skills.map((s) => (
                    <span key={s} className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[11px]">{s}</span>
                  ))}
                </p>
              </div>
              <span className="text-primary flex items-center gap-1 text-xs font-semibold"><UserPlus className="size-3.5" aria-hidden="true" /> Request to join</span>
            </li>
          ))}
        </ul>
        <div className="bg-accent/60 mt-4 rounded-md p-3 text-xs">
          <p className="font-semibold">Suggested teammate</p>
          <p className="text-muted-foreground mt-0.5">
            Listed skills <strong className="text-foreground">Figma</strong> and <strong className="text-foreground">User research</strong> match this role. They have marked themselves open to collaboration.
          </p>
        </div>
      </div>
    </Frame>
  );
}
