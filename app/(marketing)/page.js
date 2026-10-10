import Link from "next/link";
import { ArrowRight, BadgeCheck, CalendarDays, GraduationCap, Lightbulb, Lock, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Reveal } from "@/components/marketing/reveal";
import { Marquee } from "@/components/marketing/marquee";
import { DiscoveryPreview, HeroCollage, TeamPreview } from "@/components/marketing/mock-ui";
import { JsonLd } from "@/components/json-ld";
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
    a: "No. Students, seniors, alumni, faculty and staff each have their own account type. Alumni and seniors can opt in to mentoring; nobody is listed as a mentor unless they choose it.",
  },
  {
    q: "How does college verification work?",
    a: "UniSphere is made for Ramgarh Engineering College. You verify by entering your student ID, which is not public. We check it against the college's private list of valid IDs and never store or show it, and each ID can be linked to one account. If your ID is missing from the list, a reviewer can verify you manually. Having an ID never gives anyone administrator access.",
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
    a: "UniSphere is a private network: nobody outside RGEC can see any of it, and nothing is searchable on Google. Inside it you choose: profiles can be visible to all members, to your college, to your connections only, or just to you, and every post has its own visibility. Your email address is never shown, and your year and semester stay hidden unless you allow them.",
  },
  {
    q: "Can people message me without my consent?",
    a: "Only if you allow it. You set who may message you (any member, your college, connections only, or nobody), and anyone you block can never contact you.",
  },
  {
    q: "Does it cost anything?",
    a: "No. UniSphere is free for RGEC students, alumni and faculty, with no ads. It is a college project, not a company.",
  },
  {
    q: "Can anyone outside the college join or look?",
    a: "No. You need to be a verified RGEC member to see or post anything. The public pages only explain what UniSphere is; the feed, profiles, projects and messages are never visible to visitors or search engines.",
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

function CtaButtons({ inverted = false }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button asChild size="lg" variant="hot">
        <Link href="/register">
          Join UniSphere <ArrowRight />
        </Link>
      </Button>
      <Button asChild size="lg" variant={inverted ? "secondary" : "outline"}>
        <Link href="/#how-it-works">See how it works</Link>
      </Button>
    </div>
  );
}

const TILES = [
  {
    icon: GraduationCap,
    title: "Seniors & alumni",
    text: "Find people from your college, department or industry. Mentoring is opt-in and personal contact details are never revealed automatically.",
    tone: "tone-teal",
    span: "md:col-span-3",
  },
  {
    icon: Users,
    title: "Clubs & communities",
    text: "Follow clubs, join student chapters and interest groups, and see official announcements clearly marked apart from member posts.",
    tone: "tone-coral",
    span: "md:col-span-3",
  },
  {
    icon: CalendarDays,
    title: "Events & opportunities",
    text: "Hackathons, talks and workshops with RSVPs and reminders, plus internships and opportunities shared by the community.",
    tone: "tone-sun",
    span: "md:col-span-2",
  },
  {
    icon: BadgeCheck,
    title: "Verified membership",
    text: "Verify with your student ID, which is checked privately against the college's list, or ask a reviewer. Administrators are never created automatically.",
    tone: "tone-blue",
    span: "md:col-span-2",
  },
  {
    icon: Lock,
    title: "Privacy you control",
    text: "Choose who sees your profile, posts and class details, and who can message you. Block and report tools are always one tap away.",
    tone: "tone-plum",
    span: "md:col-span-2",
  },
  {
    icon: Lightbulb,
    title: "Ideas, not just updates",
    text: "Dedicated spaces for ideas, questions and projects, so good thinking does not scroll away in a general feed.",
    tone: "tone-leaf",
    span: "md:col-span-6",
  },
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
      "@type": "FAQPage",
      mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    },
  ];


  return (
    <>
      <JsonLd data={jsonLd} />

      {/* 1 · Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto grid grid-cols-1 max-w-6xl gap-14 px-4 pt-12 pb-16 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:pt-20 lg:pb-24">
          <div>
            <Reveal immediate>
              <p className="eyebrow mb-6">The campus network of Ramgarh Engineering College</p>
              <h1 className="display">
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
              <div className="mt-9">
                <CtaButtons />
              </div>
              <p className="text-muted-foreground mt-5 max-w-md text-sm leading-relaxed">
                Members only: a private network for RGEC students, alumni and faculty. Sign up, then verify with your student ID.
              </p>
            </Reveal>
          </div>
          <Reveal immediate>
            <HeroCollage />
          </Reveal>
        </div>
      </section>

      <Marquee
        className="bg-card"
        items={["Share a project", "Find your teammates", "Ask a senior", "Join a club", "Catch the next hackathon", "See what already exists", "Ship something real"]}
      />

      {/* 2 · AI idea discovery */}
      <section id="idea-discovery" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6 lg:py-28">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_1.05fr] lg:items-center">
          <Reveal>
            <SectionLabel number="01">AI idea discovery</SectionLabel>
            <h2 className="display-sm">Before you build it, see who is already working on it.</h2>
            <p className="lede mt-5">
              Describe an idea or ask a question. UniSphere searches the posts, projects and discussions that actually exist on the platform and tells you why each one is related.
            </p>
            <ul className="mt-7 space-y-3.5 text-[15px]">
              {[
                "Every match links to the original post, with the reason it was suggested.",
                "Suggested improvements and new directions you can accept, edit or ignore.",
                "Suggested people only when their profile or activity supports it.",
                "An originality check that shows overlaps and differences, never accusations.",
              ].map((t) => (
                <li key={t} className="flex gap-3">
                  <Search className="text-teal-text mt-1 size-4 shrink-0" aria-hidden="true" />
                  {t}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={0.1}>
            <DiscoveryPreview />
          </Reveal>
        </div>
      </section>

      {/* 3 · Projects & teammates */}
      <section className="bg-sunken border-y">
        <div className="mx-auto grid grid-cols-1 max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:py-28">
          <Reveal className="order-2 lg:order-1">
            <TeamPreview />
          </Reveal>
          <Reveal delay={0.1} className="order-1 lg:order-2">
            <SectionLabel number="02">Projects &amp; teammates</SectionLabel>
            <h2 className="display-sm">Open roles, honest matches.</h2>
            <p className="lede mt-5">
              Publish a project with the skills and roles you need. People who mark themselves open to collaboration can request to join, and owners can invite the right students.
            </p>
            <p className="text-muted-foreground mt-4 leading-relaxed">
              Recommendations come from skills people list themselves and the requirements you set. Each one comes with a plain-language reason. We never show a made-up compatibility percentage.
            </p>
          </Reveal>
        </div>
      </section>

      {/* 4 · More than a feed: a bento of unequal tiles */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
        <Reveal>
          <SectionLabel number="03">More than a feed</SectionLabel>
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
      </section>

      {/* 5 · How it works: an inverted band, so the page changes pace */}
      <section id="how-it-works" className="bg-foreground text-background scroll-mt-16">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
          <Reveal>
            <p className="mb-4 flex items-center gap-3 text-[0.6875rem] font-bold tracking-[0.14em] uppercase opacity-80">
              <span className="text-sun font-extrabold">04</span>
              <span aria-hidden="true" className="bg-background/30 h-px w-8" />
              How it works
            </p>
            <h2 className="display-sm max-w-xl">From signing up to shipping, in three steps.</h2>
          </Reveal>
          <ol className="mt-14 grid grid-cols-1 gap-10 md:grid-cols-3">
            {[
              ["Join and verify", "Create an account, pick your department, and verify with your student ID (or ask a reviewer)."],
              ["Share and discover", "Post a project, idea or question. See related work on your campus and the people behind it."],
              ["Build together", "Recruit teammates for open roles, ask seniors for advice, and find events and opportunities."],
            ].map(([title, text], i) => (
              <li key={title}>
                <Reveal delay={i * 0.08}>
                  <span className="font-heading text-sun block text-7xl leading-none font-extrabold tracking-tighter" aria-hidden="true">
                    {i + 1}
                  </span>
                  <h3 className="mt-4 text-2xl font-extrabold">{title}</h3>
                  <p className="mt-2 max-w-xs text-[15px] leading-relaxed opacity-75">{text}</p>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 6 · FAQ */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-16 px-4 py-20 sm:px-6 lg:py-28">
        <Reveal>
          <SectionLabel number="05">Questions</SectionLabel>
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

      {/* 7 · Final call to action: the brand colour, once more */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <div className="bg-accent-hot text-accent-hot-foreground border-foreground relative overflow-hidden rounded-3xl border px-6 py-16 text-center shadow-[5px_5px_0_0_var(--hard)] sm:px-12">
            <h2 className="display-sm mx-auto max-w-3xl">Your next idea has probably been waiting for the right people.</h2>
            <p className="mx-auto mt-5 max-w-xl text-lg font-medium">Join your campus community on UniSphere. It takes about two minutes.</p>
            <div className="mt-9 flex justify-center">
              <Button asChild size="lg" variant="default">
                <Link href="/register">
                  Join UniSphere <ArrowRight />
                </Link>
              </Button>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  );
}
