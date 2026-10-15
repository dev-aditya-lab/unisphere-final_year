import Link from "next/link";
import { ArrowRight, BadgeCheck, CalendarDays, GraduationCap, Lightbulb, Lock, MessageSquareQuote, ShieldCheck, Sparkles, Users, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Reveal } from "@/components/marketing/reveal";
import { HeroStage } from "@/components/marketing/hero-stage";
import { ProductShowcase } from "@/components/marketing/product-showcase";
import { CampusGraph, OrbitRings, StepBuild, StepJoin, StepShare } from "@/components/marketing/illustrations";
import { AdSlot } from "@/components/ads/ad-slot";
import { JsonLd } from "@/components/json-ld";
import { ads } from "@/lib/ads";
import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE } from "@/lib/constants";
import { publicEnv } from "@/lib/env-public";

export const metadata = {
  title: { absolute: `${APP_NAME}: ${APP_TAGLINE}` },
  description: APP_DESCRIPTION,
  alternates: { canonical: "/" },
};

const FAQ = [
  {
    q: "Is UniSphere only for students?",
    a: "No. It is open to anyone who wants to join: students, alumni, teachers, makers, anyone. You never have to say what you are. If you like, you can describe yourself as a student, alumnus, teacher or staff member, and it is shown as something you said, not something we checked. Mentoring is opt-in.",
  },
  {
    q: "Do I need a college, a student ID or a college email?",
    a: "No. You can sign up with any email address and use everything without choosing a college. If you want, you can connect your profile to a college: search for it, or add it by name if nobody has yet. That only says which college you chose; it does not prove you study or work there, and a college listed by members is clearly marked as community-added. Where a college has shared its own list of student IDs, a Verified badge is available as an optional extra.",
  },
  {
    q: "What does the AI actually do?",
    a: "When you describe an idea, UniSphere searches posts, projects and discussions that exist on the platform and explains why each result is related. It can also suggest ways to sharpen or extend your idea. Suggestions are never published for you, and the basic social features work even when AI is unavailable.",
  },
  {
    q: "Will AI tell me my idea was copied?",
    a: "No. Similar content is a prompt to talk to people who are working on related things, not an accusation. The originality check shows what overlaps and what is different, and leaves the decision to you.",
  },
  {
    q: "Who can see my profile and posts?",
    a: "You need to be signed in to see anything: posts, profiles and projects are not public and are not searchable on Google. Inside UniSphere you choose: your profile can be visible to all members, to your college, to your connections only, or just to you, and every post has its own visibility. Your email address is never shown, and your year and semester stay hidden unless you allow them.",
  },
  {
    q: "Can people message me without my consent?",
    a: "Only if you allow it. You set who may message you (any member, your college, connections only, or nobody), and anyone you block can never contact you.",
  },
  {
    q: "Does it cost anything?",
    a: ads.enabled
      ? "No. UniSphere is free to use. It started as a college project at Ramgarh Engineering College and is run by its students, not a company. Some public pages, such as this one, show advertising that helps cover running costs; there is no advertising inside the signed-in app, in messages or on sign-in forms."
      : "No. UniSphere is free to use and currently shows no advertising. It started as a college project at Ramgarh Engineering College and is run by its students, not a company.",
  },
  {
    q: "Can anyone look without joining?",
    a: "No. Anyone can join, but you need an account to see or post anything. The public pages only explain what UniSphere is; the feed, profiles, projects and messages are never visible to visitors or search engines.",
  },
];

function SectionLabel({ number, children }) {
  return (
    <p className="eyebrow mb-4 flex items-center gap-3">
      <span className="text-coral-text font-extrabold">{number}</span>
      <span aria-hidden="true" className="bg-border-strong h-px w-8" />
      {children}
    </p>
  );
}

const PROMISES = ["Share a project", "Find your teammates", "Ask a senior", "Join a club", "Catch the next hackathon", "See what already exists"];

const STEPS = [
  { title: "Join", text: "Create an account with any email. That is all you need. Add a college and your interests when you are ready, or never.", art: StepJoin },
  { title: "Share and discover", text: "Post a project, idea or question. UniSphere shows related work on your campus and explains why it matched.", art: StepShare },
  { title: "Build together", text: "Recruit teammates for open roles, ask seniors for advice, and find events and opportunities.", art: StepBuild },
];

const COMMUNITY_POINTS = [
  [GraduationCap, "Seniors and alumni, on your terms", "Find people by department, industry or skill. Mentoring is opt-in, and contact details are never revealed automatically."],
  [Users, "Clubs, chapters and interest groups", "Follow communities, read official announcements clearly marked apart from member posts, and join events with RSVPs."],
  [BadgeCheck, "A directory that does not pretend", "Colleges added by members are labelled community-added. Connecting a college is a choice, never a claim, and never proof."],
];

const AI_POINTS = [
  [Sparkles, "It shows its reasons", "Every suggestion links to a real post or project and says why it was suggested. Suggestions are labelled as AI, apart from facts."],
  [UserX, "It never publishes for you", "Writing help and improvements are proposals. Nothing is posted, sent or changed until you approve it."],
  [ShieldCheck, "It respects privacy", "Private posts, messages and verification documents are never sent to AI providers, and the rest of UniSphere works without AI."],
];

const TILES = [
  { icon: CalendarDays, title: "Events and opportunities", text: "Hackathons, talks and workshops with RSVPs and reminders, plus internships and competitions shared by the community.", tone: "tone-sun", span: "md:col-span-3" },
  { icon: Lock, title: "Privacy you control", text: "Choose who sees your profile, posts and class details, and who can message you. Block and report tools are one tap away.", tone: "tone-plum", span: "md:col-span-3" },
  { icon: Lightbulb, title: "Ideas, not just updates", text: "Dedicated spaces for ideas, questions and projects, so good thinking does not scroll away in a general feed.", tone: "tone-leaf", span: "md:col-span-2" },
  { icon: MessageSquareQuote, title: "Moderation with appeals", text: "Reports, severity levels, moderator notes and an appeals process. Humans make every enforcement decision.", tone: "tone-coral", span: "md:col-span-2" },
  { icon: BadgeCheck, title: "Optional verification", text: "Where a college has shared its own list of student IDs, you can earn a Verified badge. Nothing requires it.", tone: "tone-teal", span: "md:col-span-2" },
];

export default function HomePage() {
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: APP_NAME,
      url: publicEnv.appUrl,
      logo: `${publicEnv.appUrl}/icons/icon-512.png`,
      description: APP_DESCRIPTION,
      founder: ["Aditya Kumar Gupta", "Sumit Jha", "Sahil Nayak", "Vishal Kumar"].map((name) => ({ "@type": "Person", name, affiliation: { "@type": "CollegeOrUniversity", name: "Ramgarh Engineering College" } })),
      areaServed: { "@type": "CollegeOrUniversity", name: "Ramgarh Engineering College", address: { "@type": "PostalAddress", addressLocality: "Ramgarh", addressRegion: "Jharkhand", addressCountry: "IN" } },
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: APP_NAME,
      url: publicEnv.appUrl,
      inLanguage: "en-IN",
      description: APP_DESCRIPTION,
    },
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: APP_NAME,
      url: publicEnv.appUrl,
      description: APP_DESCRIPTION,
      applicationCategory: "SocialNetworkingApplication",
      operatingSystem: "Any (web browser, installable)",
      isAccessibleForFree: true,
      inLanguage: "en-IN",
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    },
  ];

  return (
    <>
      <JsonLd data={jsonLd} />

      {/* 1 · Hero: what it is, the real next step, and the product itself */}
      <section className="relative overflow-x-clip">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-14 px-4 pt-12 pb-16 sm:px-6 lg:grid-cols-[1.08fr_1fr] lg:items-center lg:pt-20 lg:pb-24">
          <div>
            <Reveal immediate>
              <p className="eyebrow mb-6">A campus network, open to everyone</p>
              <h1 className="display text-[clamp(2.4rem,1.3rem+3.6vw,4.25rem)]">
                Your campus.
                <br />
                Your people.
                <br />
                <span className="relative inline-block">
                  <span className="relative z-10">Your next idea.</span>
                  <span aria-hidden="true" className="bg-sun absolute inset-x-[-0.1em] bottom-[0.08em] -z-0 h-[0.38em] -rotate-1 rounded-sm" />
                </span>
              </h1>
              <p className="lede mt-7 max-w-xl">
                Share what you are building, discover what already exists on your campus, find the right teammates, and learn from seniors and alumni who have done it before.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Button asChild size="lg" variant="hot">
                  <Link href="/register">
                    Join UniSphere <ArrowRight />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/features">See what you can do</Link>
                </Button>
              </div>
              <p className="text-muted-foreground mt-5 max-w-md text-sm leading-relaxed">
                Free and open to everyone. No college, student ID or college email needed.
              </p>
            </Reveal>
          </div>
          <Reveal immediate>
            <HeroStage />
          </Reveal>
        </div>
      </section>

      {/* 2 · What you can do, at a glance (static: no marquee) */}
      <div className="bg-card border-y">
        <ul className="mx-auto flex max-w-6xl flex-wrap justify-center gap-x-8 gap-y-2 px-4 py-4 sm:px-6">
          {PROMISES.map((t) => (
            <li key={t} className="font-heading flex items-center gap-3 text-base font-extrabold tracking-tight">
              <span aria-hidden="true" className="bg-accent-hot size-2 rotate-45 rounded-[2px]" />
              {t}
            </li>
          ))}
        </ul>
      </div>

      {/* 3 · How it works */}
      <section id="how-it-works" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6 lg:py-28">
        <Reveal>
          <SectionLabel number="01">How it works</SectionLabel>
          <h2 className="display-sm max-w-2xl">From signing up to shipping, in three steps.</h2>
        </Reveal>
        <ol className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title}>
              <Reveal delay={i * 0.08} className="h-full">
                <div className="surface h-full p-6">
                  <div className="bg-sunken flex h-36 items-center justify-center rounded-xl">
                    <step.art className="h-28" />
                  </div>
                  <p className="font-heading text-coral-text mt-5 text-sm font-extrabold">Step {i + 1}</p>
                  <h3 className="font-heading mt-1 text-xl font-extrabold">{step.title}</h3>
                  <p className="text-muted-foreground mt-2 text-[15px] leading-relaxed">{step.text}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </section>

      {/* 4 · The product, in four views */}
      <section id="product" className="bg-sunken scroll-mt-16 border-y">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
          <Reveal>
            <SectionLabel number="02">Inside UniSphere</SectionLabel>
            <h2 className="display-sm max-w-2xl">One place for what your campus is making.</h2>
          </Reveal>
          <div className="mt-12">
            <ProductShowcase />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <AdSlot />
      </div>

      {/* 5 · Communities */}
      <section id="communities" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6 lg:py-28">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_1fr] lg:items-center">
          <Reveal className="order-2 lg:order-1">
            <div className="surface relative overflow-hidden p-4 sm:p-8">
              <OrbitRings className="absolute -top-24 -right-24 size-80 opacity-40" />
              <CampusGraph className="relative" />
            </div>
          </Reveal>
          <Reveal delay={0.1} className="order-1 lg:order-2">
            <SectionLabel number="03">College communities</SectionLabel>
            <h2 className="display-sm">Find your people, wherever your college is.</h2>
            <p className="lede mt-5">
              UniSphere began at Ramgarh Engineering College and is open to every campus. Search for your college or add it, then find the clubs, seniors and projects around it.
            </p>
            <ul className="mt-8 space-y-5">
              {COMMUNITY_POINTS.map(([Icon, title, text]) => (
                <li key={title} className="flex gap-4">
                  <span className="tone-chip tone-teal flex size-10 shrink-0 items-center justify-center rounded-lg">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="font-heading font-bold">{title}</h3>
                    <p className="text-muted-foreground mt-0.5 text-[15px] leading-relaxed">{text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* 6 · AI, and what it never does */}
      <section id="idea-discovery" className="bg-sunken scroll-mt-16 border-y">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
          <Reveal>
            <SectionLabel number="04">AI idea discovery</SectionLabel>
            <h2 className="display-sm max-w-3xl">Before you build it, see who is already working on it.</h2>
            <p className="lede mt-5 max-w-2xl">
              Describe an idea or ask a question. UniSphere searches the posts, projects and discussions that actually exist on the platform and tells you why each one is related. An originality check shows overlaps and differences, never accusations.
            </p>
          </Reveal>
          <ul className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
            {AI_POINTS.map(([Icon, title, text], i) => (
              <li key={title}>
                <Reveal delay={i * 0.07} className="h-full">
                  <div className="surface tone-teal h-full p-6">
                    <span className="tone-chip flex size-11 items-center justify-center rounded-xl">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <h3 className="font-heading mt-4 text-lg font-extrabold">{title}</h3>
                    <p className="text-muted-foreground mt-2 text-[15px] leading-relaxed">{text}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 7 · More than a feed */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
        <Reveal>
          <SectionLabel number="05">More than a feed</SectionLabel>
          <h2 className="display-sm max-w-2xl">Everything a campus community needs, in one place.</h2>
        </Reveal>
        <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-6">
          {TILES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 0.05} className={f.span}>
              <div className={`tone-panel ${f.tone} h-full rounded-2xl p-6 transition-transform duration-200 hover:-translate-y-0.5`}>
                <span className="tone-chip flex size-11 items-center justify-center rounded-xl">
                  <f.icon className="size-5" aria-hidden="true" />
                </span>
                <h3 className="font-heading mt-5 text-xl font-extrabold tracking-tight">{f.title}</h3>
                <p className="text-muted-foreground mt-2 max-w-prose text-[15px] leading-relaxed">{f.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <p className="mt-8">
          <Link href="/features" className="text-blue-text font-semibold underline underline-offset-4">
            See every feature
          </Link>
        </p>
      </section>

      {/* 8 · FAQ */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-16 px-4 pb-20 sm:px-6 lg:pb-28">
        <Reveal>
          <SectionLabel number="06">Questions</SectionLabel>
          <h2 className="display-sm">Frequently asked questions</h2>
        </Reveal>
        <Accordion type="single" collapsible className="mt-10">
          {FAQ.map((f, i) => (
            <AccordionItem key={f.q} value={`faq-${i}`}>
              <AccordionTrigger className="text-left text-base font-bold">{f.q}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground text-[15px] leading-relaxed">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      {/* 9 · Final call to action */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <div className="bg-accent-hot text-accent-hot-foreground border-foreground relative overflow-hidden rounded-3xl border px-6 py-16 text-center shadow-[5px_5px_0_0_var(--hard)] sm:px-12">
            <OrbitRings className="absolute -top-32 left-1/2 size-[36rem] -translate-x-1/2 opacity-25" />
            <h2 className="display-sm relative mx-auto max-w-3xl">Your next idea has probably been waiting for the right people.</h2>
            <p className="relative mx-auto mt-5 max-w-xl text-lg font-medium">Join your campus community on UniSphere. It takes about two minutes.</p>
            <div className="relative mt-9 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg" variant="default">
                <Link href="/register">
                  Join UniSphere <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/about">About the team</Link>
              </Button>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  );
}
