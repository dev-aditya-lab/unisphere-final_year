"use client";

import { useState } from "react";
import { Check, Copy, Download, Eye, FileText, Flag, Hash, Lock, Megaphone, MessageCircleQuestion, Pin, Reply, ShieldAlert, Smartphone, Users } from "lucide-react";
import { MockWindow } from "@/components/marketing/mock-parts";
import { ChatMarkdown } from "@/components/posts/chat-markdown";
import { cn } from "@/lib/utils";

/**
 * A look at the community workspace that is faithful to the real one: the same channel kinds, the same actions on a message and on a
 * file, the same moderator tools and the same rule that staff-only channels are invisible to members. The people, the community and
 * the words are invented and labelled "Example"; there are no member counts and no statistics. Message text goes through the same
 * Markdown component as the real chat, so what is shown is what the real thing renders. Only the open panel is drawn, nothing
 * animates on its own, and the small transitions switch off for people who ask for reduced motion.
 */

const TABS = [
  { id: "channels", label: "Channels", icon: Hash, title: "A home for every conversation", text: "A community has categories and channels: announcements only staff can post in, open discussion, questions and answers, resources, project rooms, and private staff channels. Owners decide who can read and who can post in each one." },
  { id: "messages", label: "Messages & files", icon: Pin, title: "Markdown, replies, pins and files that stay private", text: "Format messages, reply, mention people and pin what matters. Photos and PDFs open only for people who can read the channel, and every file has View, Download and Copy link." },
  { id: "safety", label: "Moderation", icon: ShieldAlert, title: "Moderators with limits, and a way to appeal", text: "Members report a message once. Moderators warn, time out or remove, with a reason the member sees and can appeal. Roles cannot be escalated and every change is in an audit log." },
  { id: "phone", label: "On your phone", icon: Smartphone, title: "Built for a thumb", text: "On a phone the channel list and the conversation are two screens, actions open as a bottom sheet instead of needing a right-click, and the keyboard never covers the message box." },
];

const CHANNELS = [
  { id: "announcements", name: "announcements", icon: Megaphone, note: "Only staff can post" },
  { id: "general", name: "general", icon: Hash, note: "Everyone can post" },
  { id: "questions", name: "questions", icon: MessageCircleQuestion, note: "Questions and answers" },
  { id: "resources", name: "resources", icon: FileText, note: "Pinned guides and files" },
];

const THREADS = {
  announcements: [
    { who: "Meera (moderator)", tone: "tone-teal", text: "**Workshop on Saturday.** Bring a laptop. Sign-up is in the pinned message.", pinned: true },
  ],
  general: [
    { who: "Arjun", tone: "tone-blue", text: "Anyone want to team up for the hackathon? I'm good with *React*, need someone for the backend." },
    { who: "Sana", tone: "tone-plum", text: "@arjun I can do the backend. Here is what I used last time:\n\n- Postgres\n- a small `Node` API", reply: "Arjun: Anyone want to team up for the hackathon?" },
  ],
  questions: [
    { who: "Dev", tone: "tone-sun", text: "How do I choose between a **thesis** and a **project** for final year?" },
    { who: "Ira (admin)", tone: "tone-leaf", text: "> thesis or project\n\nPick whichever your guide can supervise well. Ask for last year's examples." },
  ],
  resources: [
    { who: "Meera (moderator)", tone: "tone-teal", text: "Interview preparation checklist (PDF), updated for this year.", pinned: true, file: true },
  ],
};

function Person({ initials, tone }) {
  return <span aria-hidden="true" className={cn("tone-chip flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold", tone)}>{initials}</span>;
}

function ExampleFile() {
  return (
    <div className="bg-card mt-2 flex max-w-xs items-center gap-2.5 rounded-lg border p-2">
      <span className="bg-muted grid size-9 shrink-0 place-items-center rounded-md"><FileText className="size-4" aria-hidden="true" /></span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-sm font-medium">interview-checklist.pdf</span>
        <span className="text-muted-foreground block text-xs">PDF document · 240 KB</span>
      </span>
      <span className="text-muted-foreground flex items-center gap-1 text-[11px] font-semibold"><Eye className="size-3.5" aria-hidden="true" /> View</span>
      <span className="text-muted-foreground flex items-center gap-1 text-[11px] font-semibold"><Download className="size-3.5" aria-hidden="true" /> Download</span>
    </div>
  );
}

function Thread({ messages }) {
  return (
    <ul className="space-y-3">
      {messages.map((m, i) => (
        <li key={i} className="flex gap-2.5">
          <Person initials={m.who.slice(0, 2).toUpperCase()} tone={m.tone} />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold">
              {m.who}
              {m.pinned && <span className="text-primary-text inline-flex items-center gap-1 text-[11px]"><Pin className="size-3" aria-hidden="true" /> Pinned</span>}
            </p>
            {m.reply && <p className="text-muted-foreground flex items-center gap-1 text-xs"><Reply className="size-3 -scale-x-100" aria-hidden="true" /> {m.reply}</p>}
            <ChatMarkdown text={m.text} />
            {m.file && <ExampleFile />}
          </div>
        </li>
      ))}
    </ul>
  );
}

function Sidebar({ active, onPick, compact = false }) {
  return (
    <nav aria-label="Example channels" className={cn("space-y-3 text-sm", compact ? "p-2" : "p-3")}>
      <div>
        <p className="text-muted-foreground px-2 pb-1 text-[11px] font-bold tracking-wide uppercase">Information</p>
        <ul className="space-y-0.5">
          {CHANNELS.slice(0, 1).map((c) => <ChannelButton key={c.id} c={c} active={active} onPick={onPick} />)}
        </ul>
      </div>
      <div>
        <p className="text-muted-foreground px-2 pb-1 text-[11px] font-bold tracking-wide uppercase">Community</p>
        <ul className="space-y-0.5">
          {CHANNELS.slice(1).map((c) => <ChannelButton key={c.id} c={c} active={active} onPick={onPick} />)}
          <li className="text-muted-foreground flex min-h-9 items-center gap-2 rounded-lg px-2 text-sm" title="Members cannot see this channel at all">
            <Lock className="size-4" aria-hidden="true" /> staff-room <span className="ml-auto text-[11px] font-semibold">staff only</span>
          </li>
        </ul>
      </div>
    </nav>
  );
}

function ChannelButton({ c, active, onPick }) {
  const Icon = c.icon;
  return (
    <li>
      <button type="button" onClick={() => onPick(c.id)} aria-pressed={active === c.id} className={cn("focus-visible:ring-ring/45 flex min-h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-sm outline-none focus-visible:ring-[3px]", active === c.id ? "bg-accent font-semibold" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground")}>
        <Icon className="size-4 shrink-0" aria-hidden="true" /> <span className="truncate">{c.name}</span>
      </button>
    </li>
  );
}

function ChannelsPanel() {
  const [active, setActive] = useState("announcements");
  const c = CHANNELS.find((x) => x.id === active);
  return (
    <div>
      <div className="bg-primary-soft relative h-20 border-b" aria-hidden="true" />
      <div className="-mt-6 flex items-end gap-3 px-4">
        <span aria-hidden="true" className="bg-card tone-chip grid size-12 place-items-center rounded-xl border-2 text-sm font-bold">EC</span>
        <div className="pb-0.5 leading-tight">
          <p className="font-heading text-sm font-bold">Example Coding Club</p>
          <p className="text-muted-foreground flex items-center gap-1 text-xs"><Users className="size-3" aria-hidden="true" /> Open to join · Example community</p>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-[10rem_1fr] border-t sm:grid-cols-[11rem_1fr]">
        <div className="border-r"><Sidebar active={active} onPick={setActive} compact /></div>
        <div className="min-h-64 p-3">
          <p className="mb-3 flex items-center gap-1.5 border-b pb-2 text-sm font-bold"><c.icon className="size-4" aria-hidden="true" /> {c.name} <span className="text-muted-foreground ml-1 text-xs font-normal">{c.note}</span></p>
          <div key={active} className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"><Thread messages={THREADS[active]} /></div>
        </div>
      </div>
    </div>
  );
}

function MessagesPanel() {
  return (
    <div className="p-3 sm:p-4">
      <p className="mb-3 flex items-center gap-1.5 border-b pb-2 text-sm font-bold"><Hash className="size-4" aria-hidden="true" /> project-help</p>
      <ul className="space-y-3">
        <li className="flex gap-2.5">
          <Person initials="AR" tone="tone-blue" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Arjun <time className="text-muted-foreground text-[11px] font-normal">10:42</time></p>
            <ChatMarkdown text={"Here is the **layout** for the lost-and-found board. What do you think of the claim flow?"} />
            <div className="mt-2 flex items-end gap-2">
              <div className="relative">
                <div aria-hidden="true" className="bg-primary-soft h-24 w-40 rounded-lg border" />
                <span className="bg-card absolute top-1.5 right-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold shadow-sm">⋯</span>
              </div>
              <ul className="text-muted-foreground bg-card rounded-lg border p-1 text-[11px] font-medium" aria-label="Actions on a file">
                <li className="flex items-center gap-1.5 px-2 py-1"><Eye className="size-3" aria-hidden="true" /> View full size</li>
                <li className="flex items-center gap-1.5 px-2 py-1"><Download className="size-3" aria-hidden="true" /> Download</li>
                <li className="flex items-center gap-1.5 px-2 py-1"><Copy className="size-3" aria-hidden="true" /> Copy link</li>
              </ul>
            </div>
          </div>
        </li>
        <li className="bg-primary-soft/60 flex gap-2.5 rounded-lg p-1.5">
          <Person initials="SA" tone="tone-plum" />
          <div className="min-w-0 flex-1">
            <p className="text-muted-foreground flex items-center gap-1 text-xs"><Reply className="size-3 -scale-x-100" aria-hidden="true" /> Arjun: Here is the layout for…</p>
            <p className="text-sm font-semibold">Sana <span className="text-muted-foreground text-[11px] font-normal">mentioned you</span></p>
            <ChatMarkdown text={"@arjun the flow is clear. One idea:\n\n1. photo first\n2. then where it was found"} />
          </div>
        </li>
      </ul>
      <div className="bg-muted/60 mt-3 flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs">
        <span className="text-muted-foreground">Write in Markdown. Preview before you send. Shift+Enter for a new line.</span>
        <span className="flex gap-1 font-semibold"><span className="bg-card rounded border px-1.5">B</span><span className="bg-card rounded border px-1.5 italic">I</span><span className="bg-card rounded border px-1.5">Preview</span></span>
      </div>
    </div>
  );
}

function SafetyPanel() {
  return (
    <div className="space-y-3 p-3 sm:p-4">
      <article className="bg-card rounded-xl border p-3.5">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="tone-chip tone-rose rounded-md px-2 py-0.5 text-xs font-semibold">Medium</span>
          <strong>Bullying or harassment</strong>
          <span className="text-muted-foreground text-xs">message in #general</span>
        </p>
        <p className="bg-muted mt-2 rounded-lg p-2.5 text-sm"><span className="text-muted-foreground block text-[11px] font-semibold">The reported message (a copy kept for review)</span>“Example of a message a member reported.”</p>
        <div className="mt-3 flex flex-wrap gap-1.5 text-xs font-semibold" aria-label="Moderator actions">
          {["Warn", "Time out", "Remove message", "Dismiss", "Escalate"].map((a) => <span key={a} className={cn("rounded-md border px-2.5 py-1", a === "Remove message" && "text-destructive-text")}>{a}</span>)}
        </div>
        <p className="text-muted-foreground mt-2 flex items-center gap-1.5 text-xs"><Flag className="size-3" aria-hidden="true" /> The reporter&rsquo;s name is never shown to the person reported.</p>
      </article>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="bg-card rounded-xl border p-3">
          <p className="text-xs font-bold">Roles, least to most</p>
          <ol className="mt-1.5 space-y-1 text-xs">
            {[["Member", "read, write, report"], ["Moderator", "remove, pin, time out, review"], ["Admin", "channels, bans, roles"], ["Owner", "one only, can hand over"]].map(([r, d]) => <li key={r}><strong>{r}</strong> <span className="text-muted-foreground">{d}</span></li>)}
          </ol>
        </div>
        <div className="bg-card rounded-xl border p-3">
          <p className="text-xs font-bold">Audit log</p>
          <ul className="text-muted-foreground mt-1.5 space-y-1 text-xs">
            <li className="flex items-center gap-1.5"><Check className="size-3" aria-hidden="true" /> Changed a role</li>
            <li className="flex items-center gap-1.5"><Check className="size-3" aria-hidden="true" /> Removed a message</li>
            <li className="flex items-center gap-1.5"><Check className="size-3" aria-hidden="true" /> Created an invitation</li>
          </ul>
          <p className="text-muted-foreground mt-1.5 text-[11px]">Never contains message text. Cannot be edited.</p>
        </div>
      </div>
      <p className="bg-primary-soft rounded-lg p-2.5 text-xs"><strong>Appeals:</strong> a member who was timed out, removed or banned sees the reason and can appeal for 30 days. A different admin decides.</p>
    </div>
  );
}

function PhonePanel() {
  const [screen, setScreen] = useState("list");
  return (
    <div className="flex justify-center p-4">
      <div className="bg-foreground/90 w-64 rounded-[2rem] p-2 shadow-lg" role="group" aria-label="A phone showing the community">
        <div className="bg-background h-[26rem] overflow-hidden rounded-[1.5rem]">
          {screen === "list" ? (
            <div className="h-full">
              <p className="border-b px-4 py-3 text-sm font-bold">Example Coding Club</p>
              <Sidebar active="" onPick={() => setScreen("chat")} compact />
              <p className="text-muted-foreground px-4 text-[11px]">Tap a channel to open it.</p>
            </div>
          ) : (
            <div className="flex h-full flex-col">
              <p className="flex items-center gap-2 border-b px-3 py-3 text-sm font-bold">
                <button type="button" onClick={() => setScreen("list")} aria-label="Back to channels" className="focus-visible:ring-ring/45 -m-1 rounded-md p-1 outline-none focus-visible:ring-[3px]">‹</button>
                <Hash className="size-4" aria-hidden="true" /> general
              </p>
              <div className="flex-1 overflow-hidden px-3 py-2"><Thread messages={THREADS.general} /></div>
              <div className="bg-card/70 border-t px-3 py-2"><p className="bg-background text-muted-foreground rounded-xl border px-3 py-2 text-xs">Message #general</p></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const PANELS = { channels: ChannelsPanel, messages: MessagesPanel, safety: SafetyPanel, phone: PhonePanel };

export function CommunityExplorer() {
  const [active, setActive] = useState("channels");
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
      document.getElementById(`cx-tab-${next.id}`)?.focus();
    }
  }

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-start">
      <div>
        <div role="tablist" aria-label="Parts of a community" onKeyDown={onKeyDown} className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              id={`cx-tab-${t.id}`}
              role="tab"
              type="button"
              aria-selected={active === t.id}
              aria-controls="cx-panel"
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
        <p className="text-muted-foreground mt-5 max-w-md text-sm">Text channels, files, roles and moderation are live. There are no voice or video channels.</p>
      </div>

      <div id="cx-panel" role="tabpanel" aria-labelledby={`cx-tab-${active}`} tabIndex={0} className="min-h-[25rem] outline-none">
        <MockWindow title={`unisphere / communities / ${active === "phone" ? "mobile" : "example-coding-club"}`}>
          <div key={active} className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
            <Panel />
          </div>
        </MockWindow>
        <p className="text-muted-foreground mt-3 text-xs font-medium">Illustrative example with an invented community and invented people. It shows the real actions and rules.</p>
      </div>
    </div>
  );
}
