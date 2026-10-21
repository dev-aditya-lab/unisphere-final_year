import Link from "next/link";
import { Button } from "@/components/ui/button";
import { JsonLd } from "@/components/json-ld";
import { AdSlot } from "@/components/ads/ad-slot";
import { publicEnv } from "@/lib/env-public";

export const metadata = {
  title: "About UniSphere",
  description: "UniSphere is one space for every college community: an independent, free platform for sharing projects, finding teammates and learning from seniors and alumni.",
  alternates: { canonical: "/about" },
};

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
      <h1 className="text-4xl font-extrabold sm:text-5xl">One space for every college community.</h1>
      <div className="prose-uni mt-8 text-lg">
        <p>
          Most campus groups live in a patchwork of chat apps and spreadsheets. Good project ideas get lost, juniors do not know which seniors to ask, and teams form by luck.
        </p>
        <p>
          UniSphere puts students, seniors, alumni, teachers and clubs in one place and helps them find each other through what they are actually working on. Share a project, ask a question, or describe an idea, and UniSphere shows you related work and the people behind it.
        </p>
        <h2>What we believe</h2>
        <ul>
          <li><strong>Useful beats loud.</strong> Ideas, projects and questions get their own spaces so they do not drown in a general feed.</li>
          <li><strong>AI should explain itself.</strong> Suggestions come from real content on the platform and always say why. They are never published without your approval.</li>
          <li><strong>Privacy is a setting, not a footnote.</strong> You choose who sees your profile, posts and class details.</li>
          <li><strong>Open, and honest about it.</strong> Anyone can join. Connecting a college is a choice, not a claim, and listings added by members are labelled as such. Administrators are appointed deliberately, never automatically.</li>
        </ul>
        <h2>For every college</h2>
        <p>
          UniSphere is not tied to one institution. The directory of colleges grows as people join and add their own, and each college community can run its clubs, events and announcements with moderation tools, an audit trail and an appeals process.
        </p>
        <h2>Independent</h2>
        <p>
          UniSphere is an independent platform. It is not an official service of any college, and the colleges listed on it have not necessarily joined or approved it. Their names and logos belong to them; see the <Link href="/brand-policy">brand policy</Link>.
        </p>
        <h2>How we keep it safe</h2>
        <p>
          Anyone can report a post, comment, profile, message or college listing, and every decision about content or an account is made by a person and can be appealed. Read the <Link href="/guidelines">community guidelines</Link> and the <Link href="/content-policy">content policy</Link>, or <Link href="/contact">get in touch</Link>.
        </p>
      </div>
      <AdSlot className="mt-12" />
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
