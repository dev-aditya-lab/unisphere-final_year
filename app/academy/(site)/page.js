import Link from "next/link";
import { ArrowRight, ExternalLink, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Preloader } from "@/components/academy/landing/preloader";
import { HorizontalShowcase, ParallaxWord, PinnedStory, ScrollWords, WindowHero } from "@/components/academy/landing/scroll-sections";
import { VerifyForm } from "@/components/academy/verify-form";
import { CourseCard } from "@/components/academy/ui/course-card";
import { EmptyBlock } from "@/components/academy/ui/section";
import { Reveal, RevealGroup, RevealItem } from "@/components/academy/ui/reveal";
import { JsonLd } from "@/components/json-ld";
import { publicEnv } from "@/lib/env-public";
import { createClient } from "@/lib/supabase/server";
import { featuredCourses, getAcademySettings, listCategories, listCourses, listMentors } from "@/lib/services/academy";

export const metadata = {
  title: { absolute: "UniSphere Academy: learn skills, build real projects, prove your growth" },
  description: "Structured courses, guided projects and mentor feedback, with certificates that anyone can verify online.",
  alternates: { canonical: "/academy" },
  openGraph: { title: "UniSphere Academy", description: "Learn skills. Build real projects. Prove your growth.", url: "/academy" },
};

const STORY = [
  { title: "Pick a path.", text: "Courses, guided programs and project internships, each with a clear syllabus, a named mentor and the full price up front.", src: "/academy/story-1.webp", alt: "Course cards on a tablet" },
  { title: "Learn by building.", text: "Short lessons, quizzes, and assignments where you hand in a repository or a live demo, not just an answer.", src: "/academy/story-2.webp", alt: "A student writing code on a laptop" },
  { title: "Get a real review.", text: "A mentor scores your work against a rubric and writes back. Fix it, resubmit, and watch the score move.", src: "/academy/story-3.webp", alt: "A mentor and a student reviewing scores" },
  { title: "Prove it.", text: "Finish, and you receive a certificate with its own ID and QR code that anyone can check, with no account.", src: "/academy/story-4.webp", alt: "A printed certificate with a QR code" },
];

const SHOWCASE = [
  { title: "Courses", text: "Lessons, quizzes and graded assignments.", src: "/academy/show-courses.svg" },
  { title: "Programs", text: "Guided paths of projects, with a cohort.", src: "/academy/show-programs.svg" },
  { title: "Project internships", text: "A real brief and a mentor. Training, not employment.", src: "/academy/show-internships.svg" },
  { title: "Live classes", text: "Live or recorded, your choice. For live classes you get a Google Calendar invitation by email and join the Meet in one tap.", src: "/academy/show-live.svg" },
  { title: "Mentor reviews", text: "Rubric scores and written feedback.", src: "/academy/show-mentors.svg" },
  { title: "Verified certificates", text: "A public page that says valid or revoked.", src: "/academy/show-verify.svg" },
];

const TICKER = ["Web development", "Python", "UI/UX design", "Data science", "Mobile apps", "Career skills", "Projects", "Mentor feedback", "Certificates"];

const BENTO = [
  { cls: "md:col-span-2", title: "One account. Everything connected.", text: "The Academy lives inside UniSphere. Your profile, your notifications and your messages are the ones you already have." },
  { cls: "", title: "See the price first.", text: "Sale, coupon and tax are shown before you pay. Once." },
  { cls: "", title: "Reminders that matter.", text: "Live classes, deadlines, feedback and certificates reach you in the bell, on your phone or by email. You choose." },
  { cls: "md:col-span-2", title: "Honest by design.", text: "Certificates show what you completed. We do not promise jobs or placements, and a project internship is training, not employment." },
];

const FAQ = [
  ["Is the Academy free?", "Some courses are free and some are paid. The price, any sale and the total you will pay (including tax if it applies) are shown on the course page and again at checkout before you confirm."],
  ["Do I need a separate account?", "No. The Academy is part of UniSphere. You sign in with the account you already have, and your learning, payments and certificates appear in the same app."],
  ["Do I get a job or a placement?", "No. The Academy teaches skills and gives you a certificate of what you completed. We do not guarantee jobs, placements or recognition by any employer."],
  ["What is a project internship?", "A structured, project-based training programme run by UniSphere Academy, with a mentor and deliverables. It is training, not employment."],
  ["How does a certificate get verified?", "Every certificate has an ID like US-2026-WD-00142 and a QR code. Scanning it opens the official verification page, which reads our records and shows valid, revoked or not found."],
  ["What does the verification page show about me?", "Your name, the course, dates and the issuing organisation. Your score and project link appear only if you switch that on. Never your email or phone number."],
  ["Can I get a refund?", "Yes, within the window in the refund policy. Ask from your payments page; a person reviews it and the money goes back through the same payment provider."],
  ["How do I join a live class?", "When you enrol, Google emails you a Calendar invitation for each live class. Open it, or the course page, and join the Google Meet. People who were not enrolled have to ask to be let in."],
  ["Are live classes recorded?", "Only if participants were told beforehand. Recordings are available only to that course's students, for a limited time."],
];

const words = (text, offset = 0) => text.split(" ").map((w, i) => <span key={`${w}${i}`} className="ac-w" style={{ "--w": i + offset }}>{w}&nbsp;</span>);

async function showcaseProjects() {
  const { data } = await (await createClient()).rpc("academy_public_showcase", { p_limit: 6 });
  return data ?? [];
}

function Block({ kicker, title, intro, courses, prices, href, empty, dark = false }) {
  return (
    <section className={dark ? "ac-band-solid" : ""}>
      <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <Reveal className="max-w-2xl">
            <p className="ac-kicker">{kicker}</p>
            <h2 className="ac-display mt-3 text-[clamp(2.2rem,5vw,3.8rem)]">{title}</h2>
            <p className="text-muted-foreground mt-4 text-xl">{intro}</p>
          </Reveal>
          <Reveal><Button asChild variant="outline" className="rounded-full"><Link href={href}>See all<ArrowRight aria-hidden /></Link></Button></Reveal>
        </div>
        {courses.length === 0 ? (
          <Reveal className="mt-10"><EmptyBlock title={empty.title}>{empty.text}</EmptyBlock></Reveal>
        ) : (
          <RevealGroup className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((c) => <RevealItem key={c.id}><CourseCard course={c} price={prices[c.id]} /></RevealItem>)}
          </RevealGroup>
        )}
      </div>
    </section>
  );
}

export default async function AcademyHome() {
  const [featured, programs, internships, categories, mentors, projects, settings] = await Promise.all([
    featuredCourses(6), listCourses({ kind: "program", pageSize: 3 }), listCourses({ kind: "internship", pageSize: 3 }),
    listCategories(), listMentors(), showcaseProjects(), getAcademySettings(),
  ]);
  const jsonLd = { "@context": "https://schema.org", "@type": "EducationalOrganization", name: "UniSphere Academy", url: `${publicEnv.appUrl}/academy`, description: "Courses, guided projects and mentor feedback with verifiable certificates." };
  const ticker = [...TICKER, ...TICKER];

  return (
    <>
      <JsonLd data={jsonLd} />
      <Preloader />

      {/* 1. Opening scene: the headline, then a window that opens to fill the screen */}
      <WindowHero src="/academy/hero-laptop.webp" alt="A laptop showing an Academy course lesson" caption="Everything you need to learn it, build it and prove it.">
        <p className="ac-kicker ac-rise text-base">UniSphere Academy</p>
        <h1 className="ac-display ac-words mt-4 text-[clamp(2.6rem,6.4vw,5.6rem)]">
          {words("Learn skills.")}<br />{words("Build projects.", 2)}<br /><em>{words("Prove it.", 4)}</em>
        </h1>
        <div className="ac-rise mt-7 flex flex-wrap justify-center gap-3" style={{ animationDelay: "1000ms" }}>
          <Button asChild size="lg" className="rounded-full px-7"><Link href="/academy/courses">Explore courses</Link></Button>
          <Button asChild size="lg" variant="outline" className="rounded-full px-6"><Link href="/academy/programs">Explore programs<ArrowRight aria-hidden /></Link></Button>
        </div>
      </WindowHero>

      {/* 2. Ticker */}
      <div className="ac-band-solid overflow-hidden py-5" aria-hidden>
        <div className="ac-marquee gap-10">{ticker.map((t, i) => <span key={i} className="ac-display flex items-center gap-10 pr-10 text-2xl text-white/70 sm:text-3xl">{t}<span className="text-xl text-white/30" aria-hidden>/</span></span>)}</div>
      </div>

      {/* 3. A statement that lights up as you scroll */}
      <section className="mx-auto max-w-5xl px-4 py-32 sm:px-6">
        <ScrollWords className="ac-display text-[clamp(2rem,5.4vw,4.2rem)]" text="Learning sticks when you build something real. So every course ends in work you made, reviewed by a person, and proven by a certificate that anyone can check." />
      </section>

      {/* 4. Pinned story */}
      <section className="ac-gray" aria-label="How it works">
        <div className="mx-auto max-w-6xl px-4 pt-24 sm:px-6"><Reveal><p className="ac-kicker">How it works</p><h2 className="ac-display mt-3 max-w-3xl text-[clamp(2.4rem,5.5vw,4.4rem)]">From first lesson to proof, in four steps.</h2></Reveal></div>
        <PinnedStory steps={STORY} />
      </section>

      {/* 5. Featured courses */}
      <Block kicker="Featured" title="Start with a course." intro="Practical lessons with quizzes and assignments. Prices are shown in full before you commit." courses={featured.courses} prices={featured.prices} href="/academy/courses" empty={{ title: "Courses are being prepared", text: "The first courses will appear here as soon as they are published." }} />

      {/* 6. Horizontal showcase */}
      <section className="ac-band" aria-label="Everything in the Academy">
        <div className="mx-auto max-w-6xl px-4 pt-24 sm:px-6"><Reveal><p className="ac-kicker">Everything in one place</p><h2 className="ac-display mt-3 max-w-3xl text-[clamp(2.4rem,5.5vw,4.4rem)]">All the ways to learn.</h2></Reveal></div>
        <HorizontalShowcase items={SHOWCASE} />
      </section>

      {/* 7. Learning paths */}
      <section className="ac-gray">
        <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
          <Reveal className="max-w-2xl"><p className="ac-kicker">Learning paths</p><h2 className="ac-display mt-3 text-[clamp(2.2rem,5vw,3.8rem)]">Choose a direction.</h2></Reveal>
          <RevealGroup className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((c) => (
              <RevealItem key={c.id}>
                <Link href={`/academy/courses?category=${c.slug}`} className="ac-card ac-card-hover group flex items-center gap-4 p-6">
                  <span className="ac-display text-muted-foreground text-3xl">{c.code_prefix}</span>
                  <span className="min-w-0"><span className="block text-lg font-semibold tracking-tight">{c.name}</span>{c.description && <span className="text-muted-foreground line-clamp-1 text-sm">{c.description}</span>}</span>
                  <ArrowRight className="text-muted-foreground ml-auto size-5 shrink-0 transition-transform group-hover:translate-x-1" aria-hidden />
                </Link>
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* 8. Programs */}
      <Block kicker="Programs" title="Guided, project-based." intro="A path of projects with a cohort and a mentor." courses={programs.courses} prices={programs.prices} href="/academy/programs" empty={{ title: "No programs yet", text: "Guided programs will be listed here when they open." }} />

      {/* 9. Internships */}
      <section className="ac-band">
        <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <Reveal className="max-w-2xl"><p className="ac-kicker">Project internships</p><h2 className="ac-display mt-3 text-[clamp(2.2rem,5vw,3.8rem)]">A real brief. A mentor.</h2><p className="mt-4 text-xl text-[#c3cde0]">A structured training programme run by UniSphere Academy. It is training, not employment, and not a promise of a job.</p></Reveal>
            <Reveal><Button asChild variant="outline" className="rounded-full border-white/30 bg-transparent text-[#ffffff] hover:bg-white/10 hover:text-white"><Link href="/academy/internships">See internships<ArrowRight aria-hidden /></Link></Button></Reveal>
          </div>
          {internships.courses.length === 0 ? (
            <Reveal className="mt-10"><div className="rounded-2xl border border-dashed border-white/20 px-6 py-14 text-center"><p className="ac-display text-2xl">No internships open right now</p><p className="mx-auto mt-2 max-w-md text-sm text-[#c3cde0]">When one opens it is listed here with its brief, duration and fee.</p></div></Reveal>
          ) : (
            <RevealGroup className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{internships.courses.map((c) => <RevealItem key={c.id}><CourseCard course={c} price={internships.prices[c.id]} /></RevealItem>)}</RevealGroup>
          )}
        </div>
      </section>

      {/* 10. Bento */}
      <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <Reveal className="max-w-2xl"><p className="ac-kicker">Why it feels different</p><h2 className="ac-display mt-3 text-[clamp(2.2rem,5vw,3.8rem)]">Part of UniSphere, not another login.</h2></Reveal>
        <RevealGroup className="mt-10 grid gap-4 md:grid-cols-3">
          {BENTO.map((b) => (
            <RevealItem key={b.title} className={b.cls}>
              <div className="ac-card ac-card-hover h-full p-8"><h3 className="ac-display text-2xl">{b.title}</h3><p className="text-muted-foreground mt-3 text-lg">{b.text}</p></div>
            </RevealItem>
          ))}
        </RevealGroup>
      </section>

      <ParallaxWord>Build · Review · Prove · Build · Review · Prove ·</ParallaxWord>

      {/* 11. Mentors and student projects */}
      <section className="ac-gray">
        <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
          <Reveal className="max-w-2xl"><p className="ac-kicker">Mentors</p><h2 className="ac-display mt-3 text-[clamp(2.2rem,5vw,3.8rem)]">People who read your work.</h2></Reveal>
          {mentors.length === 0 ? (
            <Reveal className="mt-10"><EmptyBlock title="Mentors will be introduced here">Each mentor is added by the Academy team with a short introduction before they review anyone&apos;s work.</EmptyBlock></Reveal>
          ) : (
            <RevealGroup className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {mentors.slice(0, 6).map((m) => (
                <RevealItem key={m.user_id}><div className="ac-card p-6"><span className="bg-primary-soft text-primary-text grid size-12 place-items-center rounded-full text-lg font-bold" aria-hidden>{m.display_name[0]}</span><p className="mt-4 text-xl font-semibold tracking-tight">{m.display_name}</p>{m.headline && <p className="text-muted-foreground text-sm">{m.headline}</p>}{m.bio && <p className="text-muted-foreground mt-2 line-clamp-3 text-sm">{m.bio}</p>}</div></RevealItem>
              ))}
            </RevealGroup>
          )}
          <Reveal className="mt-24 max-w-2xl"><p className="ac-kicker">Student projects</p><h2 className="ac-display mt-3 text-[clamp(2.2rem,5vw,3.8rem)]">Built by learners. Shared by choice.</h2><p className="text-muted-foreground mt-4 text-xl">A project appears here only when its author switched sharing on and earned a certificate.</p></Reveal>
          {projects.length === 0 ? (
            <Reveal className="mt-10"><EmptyBlock title="Nothing shared yet">When students finish a course and choose to share their project, it is listed here with a link.</EmptyBlock></Reveal>
          ) : (
            <RevealGroup className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((p) => (
                <RevealItem key={p.certificate_id}>
                  <div className="ac-card flex h-full flex-col p-6"><p className="text-xl font-semibold tracking-tight">{p.project_title}</p><p className="text-muted-foreground mt-1 text-sm">{p.recipient_name} · {p.course_title}</p>
                    <div className="mt-auto flex flex-wrap items-center gap-3 pt-5 text-sm"><a href={p.project_url} target="_blank" rel="noopener noreferrer nofollow ugc" className="text-primary-text inline-flex items-center gap-1 font-semibold hover:underline">View project<ExternalLink className="size-3.5" aria-hidden /></a><Link href={`/academy/verify/${p.certificate_id}`} className="text-muted-foreground ml-auto font-mono text-xs hover:underline">{p.certificate_id}</Link></div></div>
                </RevealItem>
              ))}
            </RevealGroup>
          )}
        </div>
      </section>

      {/* 12. Verification */}
      <section className="ac-band">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-28 sm:px-6 lg:grid-cols-2">
          <Reveal>
            <QrCode className="size-9 text-white" aria-hidden />
            <h2 className="ac-display mt-5 text-[clamp(2.2rem,5vw,3.8rem)]">Check a certificate <em>in seconds.</em></h2>
            <p className="mt-5 max-w-lg text-xl text-[#c3cde0]">Every certificate carries an ID and a QR code. The page it opens reads our records and says plainly: valid, revoked or unknown. No account needed.</p>
          </Reveal>
          <Reveal delay={0.1}><div className="ac-ink-card p-6 sm:p-8"><VerifyForm tone="dark" /></div></Reveal>
        </div>
      </section>

      {/* 13. FAQ */}
      <section className="mx-auto max-w-3xl px-4 py-24 sm:px-6">
        <Reveal className="text-center"><p className="ac-kicker">Questions</p><h2 className="ac-display mt-3 text-[clamp(2.2rem,5vw,3.8rem)]">Good to know.</h2></Reveal>
        <Reveal className="mt-10">
          <Accordion type="single" collapsible className="ac-card px-6">
            {FAQ.map(([q, a], i) => (
              <AccordionItem key={q} value={`q${i}`}><AccordionTrigger className="text-left text-base font-semibold">{q}</AccordionTrigger><AccordionContent className="text-muted-foreground text-[15px]">{a}</AccordionContent></AccordionItem>
            ))}
          </Accordion>
        </Reveal>
        {settings.supportEmail && <p className="text-muted-foreground mt-6 text-center text-sm">Still unsure? Write to <a className="text-primary-text underline" href={`mailto:${settings.supportEmail}`}>{settings.supportEmail}</a>.</p>}
      </section>

      {/* 14. Final call to action */}
      <section className="ac-band ac-ends-dark">
        <div className="mx-auto max-w-4xl px-4 py-32 text-center sm:px-6">
          <Reveal>
            <h2 className="ac-display text-[clamp(2.8rem,8vw,6rem)]">Your first project<br /><em>starts today.</em></h2>
            <p className="mx-auto mt-6 max-w-xl text-xl text-[#c3cde0]">Use the UniSphere account you already have, or create one for free.</p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg" className="rounded-full bg-[#ffffff] px-8 text-[#0b132b] hover:bg-white"><Link href="/academy/courses">Browse courses</Link></Button>
              <Button asChild size="lg" variant="ghost" className="rounded-full px-6 text-[#ffffff] hover:bg-white/10 hover:text-white"><Link href="/register?next=%2Facademy%2Fdashboard">Create a free account<ArrowRight aria-hidden /></Link></Button>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
