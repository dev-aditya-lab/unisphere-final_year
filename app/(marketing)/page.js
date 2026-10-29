import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { ArrowRight, ArrowUpRight, Smartphone } from "lucide-react";
import { BellRing, UserX } from "@/components/icons/lucide-compat";
import { BadgeCheck, CalendarDays, Gift, GraduationCap, Lightbulb, Lock, MessageSquareQuote, ShieldCheck, Sparkles, Trophy, UserPlus, Users } from "@/components/icons/lucide-compat";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { MotionFeatures } from "@/components/motion/motion-features";
import { LandingFx } from "@/components/landing/landing-fx";
import { Kicker } from "@/components/landing/blocks";
import { CountUp } from "@/components/landing/count-up";
import { HeroStage } from "@/components/landing/hero-stage";
import { HeroPlanet } from "@/components/landing/hero-planet";
import { INTRO_GUARD, Intro } from "@/components/landing/intro";
import { Marquee } from "@/components/landing/marquee";
import { SpinBadge } from "@/components/landing/spin-badge";
import { Tilt } from "@/components/landing/tilt";
import { StepBuild, StepJoin, StepShare } from "@/components/landing/svg/step-art";
import { HscrollPath } from "@/components/landing/svg/hscroll-path";
import { CampusGraph } from "@/components/landing/svg/campus-graph";
import { ReferStage } from "@/components/landing/refer-stage";
import { ReferVisual } from "@/components/landing/refer-visual";
import { PhoneVisual } from "@/components/landing/phone-visual";
import { Orbit } from "@/components/landing/svg/orbit";
import { ProductShowcase } from "@/components/marketing/product-showcase";
import { CommunityExplorer } from "@/components/marketing/community-explorer";
import { JsonLd } from "@/components/json-ld";
import { HOME_FAQ_IDS, getFaq } from "@/lib/content/faq";
import { landingImage } from "@/lib/landing/image-specs.mjs";
import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE, CONTACT_EMAIL } from "@/lib/constants";
import { publicEnv } from "@/lib/env-public";

export const metadata = {
  title: { absolute: `${APP_NAME}: ${APP_TAGLINE}` },
  description: APP_DESCRIPTION,
  alternates: { canonical: "/" },
};

const PROMISES = ["Share a project", "Find your teammates", "Ask a senior", "Join a club", "Catch the next hackathon", "See what already exists"];
const WORDS = ["Projects", "Ideas", "Questions", "Events", "Opportunities", "People"];

// Every number here is a fact stated elsewhere on the page or in the product (not a count of members or anything measured).
const FACTS = [
  { value: 2, unit: " min", label: "to create your account" },
  { value: 3, unit: "", label: "steps from joining to building" },
  { value: 4, unit: "", label: "views of your campus: feed, projects, discover, colleges" },
  { value: 100, unit: "", label: "Orbits for each friend who becomes an active member" },
];

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

const SPACE_STEPS = [
  [Users, "Find or start one", "Browse communities by topic, or start your own in a minute. Public ones are open to join; members-only ones use an invitation link; some ask the moderators to approve you."],
  [Lock, "You decide who sees what", "Owners set up channels and say who may read and who may post. Staff-only channels do not even show up for members."],
  [ShieldCheck, "Safe by design", "Report a message, appeal a decision, mute what you do not need. Moderators have limits, and every change they make is recorded."],
];

const CLUBS = [
  { name: "Robotics and hardware", text: "Build, test and show prototypes together.", image: "club-robotics.jpg" },
  { name: "Design and creative", text: "Critique, collaborate and get work seen.", image: "club-design.jpg" },
  { name: "Entrepreneurship", text: "Turn an idea into a team and a first plan.", image: "club-startup.jpg" },
  { name: "Debating and writing", text: "Sharpen an argument with people who push back.", image: "club-debate.jpg" },
  { name: "Music and performing arts", text: "Find a band, a crew, or a stage.", image: "club-music.jpg" },
  { name: "Sports and fitness", text: "Teams, trials and training partners.", image: "club-sports.jpg" },
];

const GALLERY = [
  { title: "Teammates for what you are building", text: "Post the roles you need. People request to join, and you decide.", image: "gallery-projects.jpg", href: "/features", lag: 0 },
  { title: "Seniors and alumni, on your terms", text: "Find people by department, industry or skill. Mentoring is opt-in.", image: "gallery-mentors.jpg", href: "/features", lag: 70 },
  { title: "Events and opportunities", text: "Hackathons, talks and workshops with RSVPs, plus internships and competitions shared by the community.", image: "gallery-events.jpg", href: "/features", lag: 35 },
];

const AI_POINTS = [
  [Sparkles, "It shows its reasons", "Every suggestion links to a real post or project and says why it was suggested. Suggestions are labelled as AI, apart from facts."],
  [UserX, "It never publishes for you", "Writing help and improvements are proposals. Nothing is posted, sent or changed until you approve it."],
  [ShieldCheck, "It respects privacy", "Private posts, messages and verification documents are never sent to AI providers, and the rest of UniSphere works without AI."],
];

const REFER_POINTS = [
  [Gift, "Your own invite link", "Share it anywhere: a message, a group chat, a poster. Opening a link earns nothing, so there is nothing to game."],
  [Users, "Rewarded when a friend is really in", "You earn 100 Orbits, once, when a friend confirms their email, sets up their profile and uses UniSphere on two different days."],
  [Trophy, "A leaderboard of its own", "See who brought the most friends this week and of all time. You see a status for each friend, never their name."],
];

const ANDROID_POINTS = [
  [BellRing, "A switch for every kind", "Off until you turn them on. Messages, reactions, events, communities and more each have their own In app, Push and Email switches, so you silence reactions and keep messages, or the other way round."],
  [Lock, "Messages arrive at once, privately", "A new message reaches your phone within seconds, and a run of them from one person collects into one notification. It says who wrote, never what. Signing out removes your phone straight away."],
  [Smartphone, "It behaves like an app", "It opens on your feed and keeps you signed in. The back button closes what is open first, links to UniSphere open inside it, and downloads such as your data copy work."],
];

const TILES = [
  { icon: CalendarDays, title: "Events and opportunities", text: "Hackathons, talks and workshops with RSVPs and reminders, plus internships and competitions shared by the community.", span: "md:col-span-3" },
  { icon: Lock, title: "Privacy you control", text: "Choose who sees your profile, posts and class details, and who can message you. Block and report tools are one tap away.", span: "md:col-span-3" },
  { icon: Lightbulb, title: "Ideas, not just updates", text: "Dedicated spaces for ideas, questions and projects, so good thinking does not scroll away in a general feed.", span: "md:col-span-2" },
  { icon: MessageSquareQuote, title: "Moderation with appeals", text: "Reports, severity levels, moderator notes and an appeals process. Humans make every enforcement decision.", span: "md:col-span-2" },
  { icon: GraduationCap, title: "Every college you belong to", text: "Add the schools and colleges you attended or work at, with your role at each. Nothing requires it.", span: "md:col-span-2" },
];

/** A round outlined icon, the one icon treatment used on the page. */
function IconBox({ icon: Icon, className }) {
  return (
    <span className={`bg-card text-foreground flex size-12 shrink-0 items-center justify-center rounded-full border ${className ?? ""}`}>
      <Icon className="size-5" aria-hidden="true" />
    </span>
  );
}

const textLink = "text-foreground decoration-signal text-[15px] font-semibold underline decoration-[3px] underline-offset-[7px]";

export default async function HomePage() {
  // The one inline script below (it runs before first paint) needs this request's nonce, like the theme script in the root layout.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const FAQ = getFaq().filter((f) => HOME_FAQ_IDS.includes(f.id));
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: APP_NAME,
      url: publicEnv.appUrl,
      logo: `${publicEnv.appUrl}/icons/icon-512.png`,
      description: APP_DESCRIPTION,
      contactPoint: { "@type": "ContactPoint", contactType: "customer support", email: CONTACT_EMAIL },
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
    <div className="landing-root">
      <script nonce={nonce} dangerouslySetInnerHTML={{ __html: INTRO_GUARD }} />
      <Intro />
      <JsonLd data={jsonLd} />
      <MotionFeatures>
        <LandingFx>
          {/* Hero: a black stage with the 3D planet behind huge type, the real next step, and a picture of the product */}
          <section className="band relative overflow-x-clip">
            <HeroPlanet />
            <div className="relative z-10 mx-auto max-w-6xl px-4 pt-6 pb-20 sm:px-6 lg:pt-14 lg:pb-28">
              <p className="hero-in border-border-strong bg-card inline-flex items-center gap-3 rounded-full border py-2 pr-5 pl-4 text-sm font-medium" style={{ "--i": 0 }}>
                <span className="live-dot bg-signal relative size-2.5 rounded-full" aria-hidden="true" />
                A campus network, open to everyone
              </p>
              <h1 className="corp-hero-title mt-8">
                <span className="hero-line" data-hero-line style={{ "--i": 0 }}>
                  <span>Your campus.</span>
                </span>{" "}
                <span className="hero-line" data-hero-line style={{ "--i": 1 }}>
                  <span>Your people.</span>
                </span>{" "}
                <span className="hero-line" data-hero-line style={{ "--i": 2 }}>
                  <span>
                    <span className="relative inline-block">
                      Your next idea.
                      <svg aria-hidden="true" viewBox="0 0 300 10" preserveAspectRatio="none" fill="none" className="absolute inset-x-0 bottom-[-0.14em] h-[0.085em] w-full">
                        <path className="draw-once" pathLength="1" style={{ "--d": 1000 }} d="M0 5 H300" stroke="var(--signal)" strokeWidth="10" />
                      </svg>
                    </span>
                  </span>
                </span>
              </h1>
              <div className="mt-10 grid gap-10 lg:mt-14 lg:grid-cols-12 lg:items-end">
                <p className="corp-lede hero-in max-w-xl lg:col-span-5" style={{ "--i": 3 }}>
                  Share what you are building, discover what already exists on your campus, find the right teammates, and learn from seniors and alumni who have done it before.
                </p>
                <div className="hero-in flex flex-wrap items-center gap-x-10 gap-y-8 lg:col-span-7 lg:justify-end" style={{ "--i": 4 }}>
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <Button asChild size="lg" variant="hot" className="sh-magnet group h-14 rounded-full px-8 text-base">
                        <Link href="/register">
                          Join UniSphere <ArrowRight className="transition-transform duration-300 group-hover:translate-x-1" />
                        </Link>
                      </Button>
                      <Button asChild size="lg" variant="outline" className="h-14 rounded-full px-8 text-base">
                        <Link href="/features">See what you can do</Link>
                      </Button>
                    </div>
                    <p className="text-muted-foreground text-sm">Free and open to everyone. No college needed.</p>
                  </div>
                  <SpinBadge href="/register" label="Join UniSphere, it is free" text="Open to everyone • Free to join • " className="hidden sm:grid" />
                </div>
              </div>
              <HeroStage />
            </div>
          </section>

          <Marquee items={WORDS} />

          {/* One sentence, filling in as you read down it */}
          <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6 lg:py-40">
            <div data-reveal="up">
              <Kicker number="—">In one line</Kicker>
            </div>
            <p data-statement className="statement-text mt-8">
              A campus network, open to everyone. <mark>Share what you are building</mark>, find the <mark>right teammates</mark>, and learn from seniors and alumni who have done it before.
            </p>
          </section>

          {/* Facts */}
          <section aria-label="UniSphere at a glance" className="band">
            <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
              <div data-reveal="up">
                <Kicker number="—">At a glance</Kicker>
              </div>
              <dl data-stagger className="mt-14 grid grid-cols-2 gap-x-6 gap-y-14 lg:grid-cols-4">
                {FACTS.map((fact) => (
                  <div key={fact.label} className="border-band-line flex flex-col-reverse justify-end gap-5 border-t pt-6">
                    <dt className="text-band-muted max-w-[15rem] text-base leading-snug">{fact.label}</dt>
                    <dd className="fact-num">
                      <CountUp to={fact.value} />
                      {fact.unit && <span className="text-band-accent text-[0.32em] font-semibold tracking-normal">{fact.unit}</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>

          {/* How it works: three stacked panels, or, on a large screen, one wide track that scrolls sideways while the page holds */}
          <section id="how-it-works" data-hscroll>
            <div className="hscroll-head" data-reveal="up">
              <Kicker number="01">How it works</Kicker>
              <h2 className="corp-title mt-5 max-w-4xl">From signing up to shipping, in three steps.</h2>
            </div>
            <div data-hscroll-track className="hscroll-track">
              <ol data-stagger className="hscroll-panels">
                {STEPS.map((step, i) => (
                  <li key={step.title} data-panel data-n={`0${i + 1}`} className="hscroll-panel">
                    <div className="step-art bg-sunken flex items-center justify-center rounded-2xl p-5">
                      <step.art className="max-h-48" />
                    </div>
                    <div className="step-text">
                      <p className="kicker-num text-sm font-semibold">Step {i + 1}</p>
                      <h3 className="step-title font-display mt-2 text-3xl font-semibold tracking-[-0.04em]">{step.title}</h3>
                      <p className="text-muted-foreground step-body mt-3 text-lg leading-relaxed">{step.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <HscrollPath />
            </div>
            <div className="hscroll-progress" aria-hidden="true">
              <span data-hscroll-bar />
            </div>
          </section>

          {/* Inside UniSphere: a framed picture that opens to the whole screen while the headline rises out of it */}
          <section data-pin-story aria-labelledby="inside-title">
            <div className="story-wrap mx-auto max-w-6xl px-4 pt-4 sm:px-6">
              <div data-story-frame className="story-media rounded-[2rem]">
                <Image data-story-img src={landingImage("story-campus.jpg")} alt="" fill sizes="100vw" className="object-cover" />
                <div className="story-scrim" aria-hidden="true" />
              </div>
            </div>
            <div className="story-copy">
              <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 lg:py-0">
                <Kicker number="02">Inside UniSphere</Kicker>
                <h2 id="inside-title" className="corp-title mt-5 max-w-6xl">
                  <span data-story-line className="story-line">
                    <span>One place for what</span>
                  </span>{" "}
                  <span data-story-line className="story-line">
                    <span>your campus is making.</span>
                  </span>
                </h2>
                <p data-story-fade className="corp-lede mt-6 max-w-xl">
                  Projects, ideas, questions, events and people, each in the right place.
                </p>
              </div>
            </div>
          </section>

          {/* The product, in four views */}
          <section id="product" className="bg-sunken scroll-mt-16">
            <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 lg:py-36">
              <div data-reveal="up">
                <h2 className="corp-title max-w-3xl">Four views of your campus, one account.</h2>
              </div>
              <div className="mt-14" data-reveal="up">
                <ProductShowcase />
              </div>
            </div>
          </section>

          <Marquee items={PROMISES} speed={2.2} className="marquee-ink" />

          {/* Community spaces: channels, messages, moderation, phone */}
          <section id="community-spaces" aria-labelledby="community-spaces-title" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24 sm:px-6 lg:py-36">
            <div data-reveal="up">
              <Kicker number="03">Community spaces</Kicker>
              <h2 id="community-spaces-title" data-split className="corp-title mt-5 max-w-4xl">
                Clubs and study groups get a proper place to talk.
              </h2>
              <p className="corp-lede mt-8 max-w-2xl">
                Every community has categories and channels, like the servers you may know from other apps, but built for students from different colleges: nobody has to prove which college they attend, and owners control who can read and write.
              </p>
            </div>
            <div className="mt-14" data-reveal="up">
              <CommunityExplorer />
            </div>
            <ul data-stagger className="mt-20 grid grid-cols-1 gap-x-8 gap-y-12 md:grid-cols-3">
              {SPACE_STEPS.map(([Icon, title, text], i) => (
                <li key={title} className="border-t pt-6">
                  <div className="flex items-center justify-between">
                    <IconBox icon={Icon} />
                    <span className="kicker-num text-sm font-semibold tabular-nums">0{i + 1}</span>
                  </div>
                  <h3 className="font-display mt-8 text-3xl font-semibold tracking-[-0.035em]">{title}</h3>
                  <p className="text-muted-foreground mt-3 leading-relaxed">{text}</p>
                </li>
              ))}
            </ul>
            <div data-reveal="up" className="bg-sunken mt-14 flex flex-wrap items-center gap-5 rounded-[1.75rem] border p-6 sm:p-8">
              <IconBox icon={UserPlus} />
              <div className="min-w-0 flex-1">
                <h3 className="font-display text-2xl font-semibold tracking-[-0.03em]">A community is better with your classmates in it.</h3>
                <p className="text-muted-foreground mt-1 text-[15px]">Create an invitation link with an expiry and a use limit, and revoke it whenever you like.</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button asChild variant="hot" className="rounded-full px-6">
                  <Link href="/register">
                    Join UniSphere <ArrowRight />
                  </Link>
                </Button>
                <Button asChild variant="outline" className="rounded-full px-6">
                  <Link href="/features#communities">How communities work</Link>
                </Button>
              </div>
            </div>
          </section>

          {/* College directory */}
          <section id="communities" className="bg-sunken scroll-mt-20">
            <div className="mx-auto grid max-w-6xl grid-cols-1 gap-14 px-4 py-24 sm:px-6 lg:grid-cols-2 lg:items-center lg:py-36">
              <div data-reveal="left" className="bg-card order-2 rounded-[2rem] border p-4 sm:p-8 lg:order-1">
                <CampusGraph />
              </div>
              <div data-reveal="right" className="order-1 lg:order-2">
                <Kicker number="04">College directory</Kicker>
                <h2 className="corp-title mt-5">Find your people, wherever your college is.</h2>
                <p className="corp-lede mt-8">UniSphere is open to every campus. Search for your college or add it, then find the clubs, seniors and projects around it.</p>
                <ul className="mt-10 divide-y border-y">
                  {COMMUNITY_POINTS.map(([Icon, title, text]) => (
                    <li key={title} className="flex gap-4 py-6">
                      <IconBox icon={Icon} />
                      <div>
                        <h3 className="text-lg font-semibold">{title}</h3>
                        <p className="text-muted-foreground mt-1 text-[15px] leading-relaxed">{text}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          {/* Communities, as an index: a picture follows the pointer along the rows */}
          <section aria-labelledby="clubs-title" className="mx-auto max-w-6xl px-4 py-24 sm:px-6 lg:py-36">
            <div data-reveal="up" className="max-w-3xl">
              <Kicker number="05">Communities</Kicker>
              <h2 id="clubs-title" data-split className="corp-title mt-5">
                A community for every kind of curiosity.
              </h2>
              <p className="corp-lede mt-8">Communities are started by members, on any topic. Here are some of the kinds you can start or join.</p>
            </div>
            <ul data-stagger className="mt-16 border-t">
              {CLUBS.map((club, i) => (
                <li key={club.name} className="border-b">
                  <div data-hover-image={landingImage(club.image)} className="sh-hover club-row group flex items-center gap-5 py-7 sm:gap-8 sm:py-9">
                    <span className="kicker-num w-8 shrink-0 text-sm font-semibold tabular-nums">0{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-display text-[clamp(2rem,1rem+3.6vw,4.5rem)] leading-none font-semibold tracking-[-0.045em] transition-transform duration-500 ease-out group-hover:translate-x-3">{club.name}</h3>
                      <p className="text-muted-foreground mt-3 text-base">{club.text}</p>
                    </div>
                    <Image src={landingImage(club.image)} alt="" width={96} height={96} className="club-thumb size-16 shrink-0 rounded-full object-cover" />
                    <span className="border-border-strong group-hover:bg-primary group-hover:border-primary hidden size-14 shrink-0 place-items-center rounded-full border transition-colors duration-300 sm:grid">
                      <ArrowUpRight className="text-foreground size-6 transition-transform duration-300 group-hover:rotate-45" aria-hidden="true" />
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* On campus: three pictures that open as they scroll in, drift at different speeds and zoom under the pointer */}
          <section aria-labelledby="gallery-title" className="bg-sunken">
            <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 lg:py-36">
              <div data-reveal="up" className="max-w-3xl">
                <Kicker number="06">On campus</Kicker>
                <h2 id="gallery-title" className="corp-title mt-5">
                  What you will find when you join.
                </h2>
              </div>
              <ul className="mt-16 grid gap-x-8 gap-y-14 md:grid-cols-3">
                {GALLERY.map((tile) => (
                  <li key={tile.title} data-lag={tile.lag || undefined}>
                    <Link href={tile.href} className="group block">
                      <div data-img-reveal className="img-frame aspect-4/5 rounded-[2rem]">
                        <div data-img-inner data-parallax="6" className="absolute inset-x-0 top-[-7%] h-[114%]">
                          <Image src={landingImage(tile.image)} alt="" fill sizes="(min-width: 768px) 30vw, 90vw" className="sh-mask object-cover" />
                        </div>
                      </div>
                      <h3 className="font-display mt-7 text-3xl leading-tight font-semibold tracking-[-0.035em]">{tile.title}</h3>
                      <p className="text-muted-foreground mt-3 leading-relaxed">{tile.text}</p>
                      <span className="text-foreground decoration-signal mt-5 inline-flex items-center gap-2 text-[15px] font-semibold underline decoration-[3px] underline-offset-[7px]">
                        Learn more <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* AI, and what it never does */}
          <section id="idea-discovery" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-24 sm:px-6 lg:py-36">
            <div data-reveal="up">
              <Kicker number="07">AI idea discovery</Kicker>
              <h2 data-split className="corp-title mt-5 max-w-4xl">
                Before you build it, see who is already working on it.
              </h2>
              <p className="corp-lede mt-8 max-w-2xl">
                Describe an idea or ask a question. UniSphere searches the posts, projects and discussions that actually exist on the platform and tells you why each one is related. An originality check shows overlaps and differences, never accusations.
              </p>
            </div>
            <ul data-stagger className="mt-16 grid grid-cols-1 gap-x-8 gap-y-12 md:grid-cols-3">
              {AI_POINTS.map(([Icon, title, text]) => (
                <li key={title} className="border-t pt-6">
                  <IconBox icon={Icon} />
                  <h3 className="font-display mt-8 text-3xl font-semibold tracking-[-0.035em]">{title}</h3>
                  <p className="text-muted-foreground mt-3 leading-relaxed">{text}</p>
                </li>
              ))}
            </ul>
          </section>

          {/* More than a feed */}
          <section className="bg-sunken">
            <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 lg:py-36">
              <div data-reveal="up">
                <Kicker number="08">More than a feed</Kicker>
                <h2 data-split className="corp-title mt-5 max-w-3xl">
                  Everything a campus community needs, in one place.
                </h2>
              </div>
              <ul data-stagger className="mt-16 grid grid-cols-1 gap-4 md:grid-cols-6">
                {TILES.map((tile) => (
                  <li key={tile.title} className={tile.span}>
                    <Tilt className="bg-card hover:border-foreground/30 h-full rounded-[1.75rem] border p-8 transition-colors duration-300">
                      <IconBox icon={tile.icon} />
                      <h3 className="font-display mt-8 text-3xl font-semibold tracking-[-0.035em]">{tile.title}</h3>
                      <p className="text-muted-foreground mt-3 max-w-prose leading-relaxed">{tile.text}</p>
                    </Tilt>
                  </li>
                ))}
              </ul>
              <p data-reveal="up" className="mt-12">
                <Link href="/features" className={textLink}>
                  See every feature
                </Link>
              </p>
            </div>
          </section>

          {/* The Android app */}
          <section id="android-app" aria-labelledby="android-title" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-24 sm:px-6 lg:py-36">
            <div className="grid grid-cols-1 items-center gap-14 lg:grid-cols-2">
              <div data-reveal="up">
                <Kicker number="09">The Android app</Kicker>
                <h2 id="android-title" data-split className="corp-title mt-5 max-w-xl">
                  UniSphere in your pocket, on your terms.
                </h2>
                <p className="corp-lede mt-8 max-w-xl">
                  UniSphere is also an app for Android, with the same feed, projects, messages and communities as the website. It tells you when something needs you, even when it is closed. Notifications are optional, and you decide which kinds you get.
                </p>
                <ul data-stagger className="mt-10 divide-y border-y">
                  {ANDROID_POINTS.map(([Icon, title, text]) => (
                    <li key={title} className="flex gap-4 py-6">
                      <IconBox icon={Icon} />
                      <div>
                        <h3 className="text-lg font-semibold">{title}</h3>
                        <p className="text-muted-foreground mt-1 text-[15px] leading-relaxed">{text}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <div data-reveal="scale">
                <PhoneVisual />
                <p className="text-muted-foreground mt-8 text-center text-xs">Illustrative example with invented people and events, not real notifications.</p>
              </div>
            </div>
          </section>

          {/* UniSphere Academy: learn inside the same account */}
          <section id="academy" aria-labelledby="academy-title" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-24 sm:px-6 lg:py-36">
            <div className="grid grid-cols-1 items-center gap-14 lg:grid-cols-2">
              <div data-reveal="up">
                <Kicker number="10">Academy</Kicker>
                <h2 id="academy-title" data-split className="corp-title mt-5 max-w-xl">
                  Learn it. Build it. Prove it.
                </h2>
                <p className="corp-lede mt-8">
                  UniSphere Academy has courses, guided programs and project internships, with mentor feedback and certificates anyone can verify online. It uses the account you already have: your profile, notifications and messages stay where they are.
                </p>
                <ul className="mt-8 space-y-3 text-[15px]">
                  {["Free and paid courses, with the full price shown before you pay", "Assignments reviewed by a mentor against a clear rubric", "A certificate with its own ID and QR code, checked on an official page"].map((t) => (
                    <li key={t} className="flex gap-3"><BadgeCheck className="text-primary-text mt-0.5 size-5 shrink-0" aria-hidden="true" />{t}</li>
                  ))}
                </ul>
                <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
                  <Button asChild size="lg" variant="hot" className="sh-magnet group h-14 rounded-full px-8 text-base">
                    <Link href="/academy">
                      Open the Academy <ArrowRight className="transition-transform duration-300 group-hover:translate-x-1" />
                    </Link>
                  </Button>
                  <Link href="/academy/verify" className={textLink}>
                    Verify a certificate
                  </Link>
                </div>
              </div>
              <div data-reveal="scale">
                <Tilt>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/academy/story-4.webp" alt="A printed Academy certificate with a QR code" width={1200} height={900} loading="lazy" decoding="async" className="h-auto w-full rounded-3xl border" />
                </Tilt>
                <p className="text-muted-foreground mt-4 text-center text-xs">Illustration of a certificate, not a real one.</p>
              </div>
            </div>
          </section>

          {/* Refer & Earn: a spotlight of its own */}
          <section id="refer-and-earn" className="band scroll-mt-16">
            <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-32">
              <div data-reveal="scale">
                <ReferStage>
                  <div className="grid grid-cols-1 items-center gap-14 lg:grid-cols-2">
                    <div>
                      <Kicker number="11">Refer &amp; Earn</Kicker>
                      <h2 className="corp-title mt-5 text-[clamp(2.5rem,1rem+3.6vw,4.5rem)]">
                        Invite friends. <span className="text-signal-text">Earn 100 Orbits.</span>
                      </h2>
                      <p className="corp-lede mt-8">
                        Bring the people you build with. Every friend who joins through your link and becomes an active member earns you 100 Orbits. Orbits are recognition for taking part, not money.
                      </p>
                      <ul className="mt-10 divide-y border-y">
                        {REFER_POINTS.map(([Icon, title, text]) => (
                          <li key={title} className="flex gap-4 py-6">
                            <IconBox icon={Icon} />
                            <div>
                              <h3 className="text-lg font-semibold">{title}</h3>
                              <p className="text-muted-foreground mt-1 text-[15px] leading-relaxed">{text}</p>
                            </div>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
                        <Button asChild size="lg" variant="hot" className="sh-magnet group h-14 rounded-full px-8 text-base">
                          <Link href="/register">
                            Join and get your link <ArrowRight className="transition-transform duration-300 group-hover:translate-x-1" />
                          </Link>
                        </Button>
                        <Link href="/faq" className={textLink}>
                          How it works
                        </Link>
                      </div>
                    </div>
                    <div>
                      <ReferVisual />
                      <p className="text-muted-foreground mt-6 text-center text-xs">Illustrative example with an invented link and statuses, not real members.</p>
                    </div>
                  </div>
                </ReferStage>
              </div>
            </div>
          </section>

          {/* FAQ */}
          <section id="faq" className="mx-auto max-w-3xl scroll-mt-16 px-4 py-24 sm:px-6 lg:py-36">
            <div data-reveal="up">
              <Kicker number="11">Questions</Kicker>
              <h2 className="corp-title mt-5">Frequently asked questions</h2>
            </div>
            <Accordion type="single" collapsible className="mt-12">
              {FAQ.map((f, i) => (
                <AccordionItem key={f.q} value={`faq-${i}`}>
                  <AccordionTrigger className="text-left text-lg font-semibold">{f.q}</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground text-base leading-relaxed">{f.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
            <p className="mt-10">
              <Link href="/faq" className={textLink}>
                See all questions
              </Link>
            </p>
          </section>

          {/* Final call to action: a black band that runs straight into the footer */}
          <section data-pause-offscreen className="band relative overflow-hidden">
            <div aria-hidden="true" className="pointer-events-none absolute top-1/2 -right-24 hidden size-[40rem] -translate-y-1/2 lg:block">
              <Orbit className="absolute inset-0 size-full" />
              <Image src="/icons/reward/orbit.png" alt="" width={500} height={500} sizes="22rem" className="planet-float absolute top-1/2 left-1/2 w-[22rem] -translate-x-1/2 -translate-y-1/2 drop-shadow-[0_40px_80px_rgba(47,99,240,0.5)]" />
            </div>
            <div className="relative mx-auto max-w-6xl px-4 py-28 sm:px-6 lg:py-44">
              <Kicker number="—">Ready when you are</Kicker>
              <h2 data-split className="corp-title mt-6 max-w-5xl">
                Your next idea has probably been waiting for the right people.
              </h2>
              <p data-reveal="up" className="text-band-muted mt-8 max-w-xl text-xl leading-relaxed">
                Join your campus community on UniSphere. It takes about two minutes.
              </p>
              <div data-reveal="up" data-delay="0.1" className="mt-12 flex flex-wrap items-center gap-4">
                <Button asChild size="lg" variant="hot" className="sh-magnet group h-16 rounded-full px-10 text-lg">
                  <Link href="/register">
                    Join UniSphere <ArrowRight className="transition-transform duration-300 group-hover:translate-x-1" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-16 rounded-full px-10 text-lg">
                  <Link href="/about">About the team</Link>
                </Button>
              </div>
            </div>
          </section>
        </LandingFx>
      </MotionFeatures>
    </div>
  );
}
