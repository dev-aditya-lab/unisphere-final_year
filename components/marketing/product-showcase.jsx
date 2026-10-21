"use client";

import { useState } from "react";
import { Compass, FolderKanban, Lightbulb, Newspaper } from "lucide-react";
import { AiNote, Avatar, MockPost, MockSearch, MockWindow, RoleRow, TypeChip } from "@/components/marketing/mock-parts";
import { cn } from "@/lib/utils";

const TABS = [
  {
    id: "feed",
    label: "Feed",
    icon: Newspaper,
    title: "A feed that knows ideas from chatter",
    text: "Projects, ideas, questions, opportunities and achievements each have their own type, colour and filter, so good thinking does not scroll away.",
  },
  {
    id: "projects",
    label: "Projects",
    icon: FolderKanban,
    title: "Say what you are building and who you need",
    text: "Describe the problem, the stack and the open roles. People request to join, and you decide. Suggestions are based on skills members listed themselves.",
  },
  {
    id: "discover",
    label: "Discover",
    icon: Lightbulb,
    title: "See what already exists before you build",
    text: "Describe an idea and UniSphere finds related posts and projects that are really on the platform, with the reason each one matched.",
  },
  {
    id: "colleges",
    label: "Colleges",
    icon: Compass,
    title: "Find your college, or add it",
    text: "Search the directory, or add a college by name. Listings added by members are labelled as such. Choosing a college is optional and never counts as proof.",
  },
];

function FeedPanel() {
  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 overflow-hidden" aria-hidden="true">
        {[["All", "tone-stone"], ["Project", "tone-blue"], ["Idea", "tone-sun"], ["Question", "tone-plum"], ["Opportunity", "tone-leaf"]].map(([l, t], i) => (
          <span key={l} className={cn("rounded-md border px-2.5 py-1 text-xs font-semibold", i === 0 ? "border-primary bg-primary text-primary-foreground" : cn("tone-chip", t))}>{l}</span>
        ))}
      </div>
      <MockPost initials="RM" name="Rohan M." meta="Example · Alumnus" category="Experience" tone="tone-rose" stats={[41, 9]}>
        Three things that actually mattered in my first internship interview, and one that did not.
      </MockPost>
      <MockPost initials="AK" name="Asha K." meta="Example · 3rd year" category="Idea" tone="tone-sun" stats={[17, 5]}>
        What if the library showed which study rooms are free during exam week?
      </MockPost>
    </div>
  );
}

function ProjectPanel() {
  return (
    <div className="surface tone-blue tone-stripe space-y-4 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-heading text-lg font-bold">Campus Lost &amp; Found</p>
          <p className="text-muted-foreground text-xs">In progress · 3 of 5 members</p>
        </div>
        <TypeChip tone="tone-leaf">Open roles</TypeChip>
      </div>
      <p className="text-sm leading-relaxed">Students lose things on campus every week. A shared board with photos and a claim flow would help.</p>
      <ul className="space-y-2">
        <RoleRow role="Mobile developer" skills={["React Native", "Firebase"]} />
        <RoleRow role="UI/UX designer" skills={["Figma", "User research"]} />
      </ul>
      <AiNote label="Suggested teammate">Listed skills match this role and they marked themselves open to collaboration.</AiNote>
    </div>
  );
}

function DiscoverPanel() {
  return (
    <div className="space-y-3">
      <MockSearch>I want to build an AI system that helps reduce food waste in college hostels.</MockSearch>
      <p className="flex items-center gap-2 text-xs font-bold">
        <span className="tone-teal tone-chip rounded-md px-1.5 py-0.5">Found for you</span>
        <span className="text-muted-foreground font-medium">Real posts and projects</span>
      </p>
      {[
        ["Smart Mess Waste Tracker", "Project", "tone-blue", "Why it matches: tracks leftover food per meal, the same focus as yours."],
        ["Reducing food waste in hostels", "Discussion", "tone-plum", "Why it matches: replies about portion sizes and weekend demand."],
      ].map(([t, c, tone, why]) => (
        <div key={t} className={cn("bg-card tone-stripe rounded-xl border p-3.5", tone)}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-bold">{t}</p>
            <TypeChip tone={tone}>{c}</TypeChip>
          </div>
          <p className="text-muted-foreground mt-1 text-xs">{why}</p>
        </div>
      ))}
      <AiNote>Add meal-demand forecasting using historical mess data.</AiNote>
    </div>
  );
}

function CollegePanel() {
  return (
    <div className="space-y-3">
      <MockSearch>engineering</MockSearch>
      <ul className="space-y-2">
        {[
          ["Example Engineering College", "Already in the directory", "tone-teal"],
          ["Example Institute of Technology", "Community-added", "tone-stone"],
        ].map(([name, label, tone]) => (
          <li key={name} className="bg-card flex items-center gap-3 rounded-xl border p-3">
            <Avatar initials={name.split(" ").map((w) => w[0]).slice(0, 2).join("")} tone={tone} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{name}</p>
              <p className="text-muted-foreground text-xs">{label}</p>
            </div>
            <span className="text-blue-text text-xs font-bold">Join community</span>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground text-xs">Can&rsquo;t find yours? Add it by name. You can skip this step entirely.</p>
    </div>
  );
}

const PANELS = { feed: FeedPanel, projects: ProjectPanel, discover: DiscoverPanel, colleges: CollegePanel };

/**
 * A tabbed look at four parts of the product. Plain buttons with the WAI-ARIA tabs pattern (arrow keys move between
 * tabs). Only the open panel is rendered. All four panels are static, labelled examples.
 */
export function ProductShowcase() {
  const [active, setActive] = useState("feed");
  const tab = TABS.find((t) => t.id === active);
  const Panel = PANELS[active];

  function onKeyDown(e) {
    const i = TABS.findIndex((t) => t.id === active);
    let next = null;
    if (e.key === "ArrowRight") next = TABS[(i + 1) % TABS.length];
    if (e.key === "ArrowLeft") next = TABS[(i - 1 + TABS.length) % TABS.length];
    if (e.key === "Home") next = TABS[0];
    if (e.key === "End") next = TABS[TABS.length - 1];
    if (next) {
      e.preventDefault();
      setActive(next.id);
      document.getElementById(`showcase-tab-${next.id}`)?.focus();
    }
  }

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
      <div>
        <div role="tablist" aria-label="Parts of UniSphere" onKeyDown={onKeyDown} className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              id={`showcase-tab-${t.id}`}
              role="tab"
              type="button"
              aria-selected={active === t.id}
              aria-controls="showcase-panel"
              tabIndex={active === t.id ? 0 : -1}
              onClick={() => setActive(t.id)}
              className={cn(
                "focus-visible:ring-ring/50 inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-semibold transition-colors outline-none focus-visible:ring-[3px]",
                active === t.id ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground hover:border-foreground/40",
              )}
            >
              <t.icon className="size-4" aria-hidden="true" />
              {t.label}
            </button>
          ))}
        </div>
        <div aria-live="polite" className="mt-6">
          <h3 className="font-heading text-2xl font-extrabold tracking-tight">{tab.title}</h3>
          <p className="text-muted-foreground mt-2 max-w-md leading-relaxed">{tab.text}</p>
        </div>
      </div>

      <div id="showcase-panel" role="tabpanel" aria-labelledby={`showcase-tab-${active}`} tabIndex={0} className="min-h-[25rem] outline-none">
        <MockWindow title={`unisphere / ${active}`}>
          <div className="p-3 sm:p-4">
            <Panel />
          </div>
        </MockWindow>
        <p className="text-muted-foreground mt-3 text-xs font-medium">Illustrative example with invented people and colleges.</p>
      </div>
    </div>
  );
}
