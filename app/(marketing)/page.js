import Link from "next/link";
import { ArrowRight, BadgeCheck, CalendarDays, GraduationCap, Lightbulb, Lock, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Reveal } from "@/components/marketing/reveal";
import { DiscoveryPreview, FeedPreview, TeamPreview } from "@/components/marketing/mock-ui";
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
    a: "You choose. Profiles can be public, college-only, connections-only or private, and every post has its own visibility. Your email address is never shown on your profile, and your current year and semester stay hidden unless you allow them.",
  },
  {
    q: "Can people message me without my consent?",
    a: "Only if you allow it. You set who may message you (anyone, your college, connections only, or nobody), and anyone you block can never contact you.",
  },
  {
    q: "Does it cost anything?",
    a: "Joining is free. Individual colleges may choose how they run UniSphere for their community.",
  },
];

function SectionLabel({ number, children }) {
  return (
    <p className="eyebrow mb-3 flex items-center gap-3">
      <span className="text-primary">{number}</span>
      <span aria-hidden="true" className="bg-border h-px w-8" />
      {children}
    </p>
  );
}

function CtaButtons() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button asChild size="lg">
        <Link href="/register">
          Join UniSphere <ArrowRight />
        </Link>
      </Button>
      <Button asChild size="lg" variant="outline">
        <Link href="/#how-it-works">See how it works</Link>
      </Button>
    </div>
  );
}

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
      <section className="relative overflow-hidden border-b">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:py-24">
          <div>
            <Reveal immediate>
              <p className="eyebrow mb-5">The campus network of Ramgarh Engineering College</p>
              <h1 className="text-[2.6rem] leading-[1.05] font-extrabold sm:text-6xl">
                Your campus.
                <br />
                Your people.
                <br />
                <span className="text-primary relative inline-block">
                  Your next idea.
                  <svg aria-hidden="true" viewBox="0 0 300 14" className="text-electric absolute -bottom-2 left-0 h-3 w-full" fill="none" preserveAspectRatio="none">
                    <path d="M2 9 C 60 2, 140 2, 298 8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                </span>
              </h1>
              <p className="text-muted-foreground mt-7 max-w-xl text-lg leading-relaxed">
                Share what you are building, discover what already exists on your campus, find the right teammates, and learn from seniors and alumni who have done it before.
              </p>
              <div className="mt-8">
                <CtaButtons />
              </div>
              <p className="text-muted-foreground mt-5 text-sm">Free to join. Verify with your student ID to earn a badge. You decide who sees your profile.</p>
            </Reveal>
          </div>
          <Reveal immediate delay={0.1}>
            <FeedPreview />
          </Reveal>
        </div>
      </section>

      {/* 2 · AI idea discovery */}
      <section id="idea-discovery" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.05fr] lg:items-center">
          <Reveal>
            <SectionLabel number="01">AI idea discovery</SectionLabel>
            <h2 className="text-3xl font-extrabold sm:text-4xl">Before you build it, see who is already working on it.</h2>
            <p className="text-muted-foreground mt-4 text-lg">
              Describe an idea or ask a question. UniSphere searches the posts, projects and discussions that actually exist on the platform and tells you why each one is related.
            </p>
            <ul className="mt-6 space-y-3 text-[15px]">
              {[
                "Every match links to the original post, with the reason it was suggested.",
                "Suggested improvements and new directions you can accept, edit or ignore.",
                "Suggested people only when their profile or activity supports it.",
                "An originality check that shows overlaps and differences, never accusations.",
              ].map((t) => (
                <li key={t} className="flex gap-3">
                  <Search className="text-primary mt-1 size-4 shrink-0" aria-hidden="true" />
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
      <section className="bg-muted/50 border-y">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:items-center">
          <Reveal className="order-2 lg:order-1">
            <TeamPreview />
          </Reveal>
          <Reveal delay={0.1} className="order-1 lg:order-2">
            <SectionLabel number="02">Projects &amp; teammates</SectionLabel>
            <h2 className="text-3xl font-extrabold sm:text-4xl">Open roles, honest matches.</h2>
            <p className="text-muted-foreground mt-4 text-lg">
              Publish a project with the skills and roles you need. People who mark themselves open to collaboration can request to join, and owners can invite the right students.
            </p>
            <p className="text-muted-foreground mt-4">
              Recommendations come from skills people list themselves and the requirements you set. Each one comes with a plain-language reason. We never show a made-up compatibility percentage.
            </p>
          </Reveal>
        </div>
      </section>

      {/* 4–6 · Alumni, communities, verification */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <Reveal>
          <SectionLabel number="03">More than a feed</SectionLabel>
          <h2 className="max-w-2xl text-3xl font-extrabold sm:text-4xl">Everything a campus community needs, in one place.</h2>
        </Reveal>
        <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {[
            {
              icon: GraduationCap,
              title: "Seniors & alumni",
              text: "Find people from your college, department or industry. Mentoring is opt-in and personal contact details are never revealed automatically.",
            },
            {
              icon: Users,
              title: "Clubs & communities",
              text: "Follow clubs, join student chapters and interest groups, and see official announcements clearly marked apart from member posts.",
            },
            {
              icon: CalendarDays,
              title: "Events & opportunities",
              text: "Hackathons, talks and workshops with RSVPs and reminders, plus internships and opportunities shared by the community.",
            },
            {
              icon: BadgeCheck,
              title: "Verified membership",
              text: "Verify with your student ID, which is checked privately against the college's list, or ask a reviewer. Verified members earn a badge, and administrators are never created automatically.",
            },
            {
              icon: Lock,
              title: "Privacy you control",
              text: "Choose who sees your profile, posts and class details, and who can message you. Block and report tools are always one tap away.",
            },
            {
              icon: Lightbulb,
              title: "Ideas, not just updates",
              text: "Dedicated spaces for ideas, questions and projects, so good thinking does not scroll away in a general feed.",
            },
          ].map((f, i) => (
            <Reveal key={f.title} delay={i * 0.05}>
              <div className="surface h-full p-5">
                <span className="bg-accent text-accent-foreground flex size-9 items-center justify-center rounded-md">
                  <f.icon className="size-[18px]" aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-lg">{f.title}</h3>
                <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">{f.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* 7 · How it works */}
      <section id="how-it-works" className="bg-[#17243A] scroll-mt-16 text-[#F7F5EF]">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <Reveal>
            <p className="eyebrow mb-3 flex items-center gap-3 !text-[#9aa6bf]">
              <span className="text-[#9fb4ff]">04</span>
              <span aria-hidden="true" className="h-px w-8 bg-white/20" />
              How it works
            </p>
            <h2 className="max-w-xl text-3xl font-extrabold sm:text-4xl">From signing up to shipping, in three steps.</h2>
          </Reveal>
          <ol className="mt-12 grid gap-8 md:grid-cols-3">
            {[
              ["Join and verify", "Create an account, pick your department, and verify with your student ID (or ask a reviewer)."],
              ["Share and discover", "Post a project, idea or question. See related work on your campus and the people behind it."],
              ["Build together", "Recruit teammates for open roles, ask seniors for advice, and find events and opportunities."],
            ].map(([title, text], i) => (
              <li key={title}>
                <Reveal delay={i * 0.08}>
                  <span className="font-mono text-sm text-[#9fb4ff]">0{i + 1}</span>
                  <h3 className="mt-2 text-xl">{title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-[#b7c1d6]">{text}</p>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 8 · FAQ */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-16 px-4 py-20 sm:px-6">
        <Reveal>
          <SectionLabel number="05">Questions</SectionLabel>
          <h2 className="text-3xl font-extrabold sm:text-4xl">Frequently asked questions</h2>
        </Reveal>
        <Accordion type="single" collapsible className="mt-8">
          {FAQ.map((f, i) => (
            <AccordionItem key={f.q} value={`faq-${i}`}>
              <AccordionTrigger className="text-left text-base font-semibold">{f.q}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground text-[15px] leading-relaxed">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      {/* 9 · Final CTA */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <div className="surface relative overflow-hidden px-6 py-14 text-center sm:px-12">
            <h2 className="mx-auto max-w-2xl text-3xl font-extrabold sm:text-4xl">Your next idea has probably been waiting for the right people.</h2>
            <p className="text-muted-foreground mx-auto mt-4 max-w-xl text-lg">Join your campus community on UniSphere. It takes about two minutes.</p>
            <div className="mt-8 flex justify-center">
              <CtaButtons />
            </div>
          </div>
        </Reveal>
      </section>
    </>
  );
}
