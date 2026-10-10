import Link from "next/link";
import { Button } from "@/components/ui/button";
import { JsonLd } from "@/components/json-ld";
import { publicEnv } from "@/lib/env-public";

export const metadata = {
  title: "About UniSphere",
  description: "UniSphere is the campus network for Ramgarh Engineering College, built by Aditya Kumar Gupta, Sumit Jha, Sahil Nayak and Vishal Kumar around ideas, projects and mentorship.",
  alternates: { canonical: "/about" },
};

const TEAM = ["Aditya Kumar Gupta", "Sumit Jha", "Sahil Nayak", "Vishal Kumar"];

export default function AboutPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6 sm:py-20">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: publicEnv.appUrl },
            { "@type": "ListItem", position: 2, name: "About", item: `${publicEnv.appUrl}/about` },
          ],
        }}
      />
      <p className="eyebrow mb-2">About</p>
      <h1 className="text-4xl font-extrabold sm:text-5xl">A campus network built around what people make.</h1>
      <div className="prose-uni mt-8 text-lg">
        <p>
          Most campus groups live in a patchwork of chat apps and spreadsheets. Good project ideas get lost, juniors do not know which seniors to ask, and teams form by luck.
        </p>
        <p>
          UniSphere puts students, seniors, alumni, faculty and clubs in one place and helps them find each other through what they are actually working on. Share a project, ask a question, or describe an idea, and UniSphere shows you related work and the people behind it.
        </p>
        <h2>What we believe</h2>
        <ul>
          <li><strong>Useful beats loud.</strong> Ideas, projects and questions get their own spaces so they do not drown in a general feed.</li>
          <li><strong>AI should explain itself.</strong> Suggestions come from real content on the platform and always say why. They are never published without your approval.</li>
          <li><strong>Privacy is a setting, not a footnote.</strong> You choose who sees your profile, posts and class details.</li>
          <li><strong>Trust is earned.</strong> Membership is verified with a student ID that is checked privately against the college&rsquo;s own list and never stored or shown. Administrators are appointed deliberately, never automatically.</li>
        </ul>
        <h2>Made for Ramgarh Engineering College</h2>
        <p>
          UniSphere is built for the students, alumni, faculty and clubs of Ramgarh Engineering College (RGEC), Ramgarh, Jharkhand. Departments, clubs and official announcements live here, and college administrators run their own community with moderation tools, an audit trail and an appeals process.
        </p>
        <h2>The team</h2>
        <p>UniSphere was designed and built by four RGEC students:</p>
      </div>
      <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label="The UniSphere team">
        {TEAM.map((name) => (
          <li key={name} className="surface flex items-center gap-3 p-4">
            <span aria-hidden="true" className="bg-accent text-accent-foreground flex size-10 items-center justify-center rounded-full text-sm font-bold">
              {name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
            </span>
            <span>
              <span className="font-heading block font-bold">{name}</span>
              <span className="text-muted-foreground text-xs">Ramgarh Engineering College</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-10 flex flex-wrap gap-3">
        <Button asChild size="lg">
          <Link href="/register">Join UniSphere</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/contact">Talk to us</Link>
        </Button>
      </div>
    </article>
  );
}
