import Link from "next/link";
import { ClipboardCheck, Eye, MessagesSquare, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyBlock, SectionHeading } from "@/components/academy/ui/section";
import { Reveal, RevealGroup, RevealItem } from "@/components/academy/ui/reveal";
import { listMentors } from "@/lib/services/academy";

export const metadata = {
  title: "Mentorship",
  description: "How mentors on UniSphere Academy review your work: rubric scores, written feedback and a chance to resubmit.",
  alternates: { canonical: "/academy/mentorship" },
};

const POINTS = [
  [ClipboardCheck, "A clear rubric", "Assignments are scored on stated criteria such as correctness, code quality, documentation and completeness, so you know what good looks like before you start."],
  [MessagesSquare, "Written feedback", "A mentor reads your repository or demo and writes back with what worked and what to change. You are told as soon as it is reviewed."],
  [Repeat, "A chance to improve", "Where an assignment allows it, you can fix the work and submit again. Your earlier attempts and the feedback stay on record."],
  [Eye, "Only your courses", "A mentor sees the work of students in the courses they teach, and nothing about payments or other courses."],
];

export default async function MentorshipPage() {
  const mentors = await listMentors();
  return (
    <>
      <section className="ac-band">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <div className="ac-stagger max-w-3xl">
            <p className="ac-kicker" style={{ "--i": 0 }}>Mentorship</p>
            <h1 className="ac-display mt-4 text-[clamp(2.4rem,5vw,4rem)]" style={{ "--i": 1 }}>Someone reads <em>your</em> work</h1>
            <p className="mt-4 text-lg text-[#c3c7e6]" style={{ "--i": 2 }}>Mentorship on the Academy is feedback on what you build. It is part of the courses and programs rather than a separate product.</p>
            <div className="mt-8" style={{ "--i": 3 }}><Button asChild size="lg" className="rounded-full px-7"><Link href="/academy/programs">See programs with mentors</Link></Button></div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-16 px-4 py-14 sm:px-6">
        <section>
          <SectionHeading kicker="What to expect" title="How mentors help" />
          <RevealGroup className="mt-8 grid gap-4 md:grid-cols-2">
            {POINTS.map(([Icon, title, text]) => (
              <RevealItem key={title}>
                <div className="ac-card flex h-full gap-4 p-6">
                  <span className="bg-primary-soft text-primary-text grid size-11 shrink-0 place-items-center rounded-xl"><Icon className="size-5" aria-hidden /></span>
                  <div><h3 className="ac-display text-xl">{title}</h3><p className="text-muted-foreground mt-1.5 text-[15px]">{text}</p></div>
                </div>
              </RevealItem>
            ))}
          </RevealGroup>
        </section>

        <section>
          <SectionHeading kicker="The team" title="Our mentors" />
          {mentors.length === 0 ? (
            <Reveal className="mt-8"><EmptyBlock title="Mentors will be introduced here">Each mentor is added by the Academy team with a short introduction before they review anyone&apos;s work.</EmptyBlock></Reveal>
          ) : (
            <RevealGroup className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {mentors.map((m) => (
                <RevealItem key={m.user_id}>
                  <div className="ac-card h-full p-5">
                    <span className="bg-primary-soft text-primary-text grid size-12 place-items-center rounded-full text-lg font-bold" aria-hidden>{m.display_name[0]}</span>
                    <p className="ac-display mt-3 text-xl">{m.display_name}</p>
                    {m.headline && <p className="text-muted-foreground text-sm">{m.headline}</p>}
                    {m.bio && <p className="text-muted-foreground mt-2 text-sm">{m.bio}</p>}
                  </div>
                </RevealItem>
              ))}
            </RevealGroup>
          )}
        </section>
      </div>
    </>
  );
}
