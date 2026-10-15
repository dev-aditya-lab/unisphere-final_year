import Link from "next/link";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { JsonLd } from "@/components/json-ld";
import { ads } from "@/lib/ads";
import { monetag } from "@/lib/monetag";
import { getFaq } from "@/lib/content/faq";
import { publicEnv } from "@/lib/env-public";

export const metadata = {
  title: "Frequently asked questions",
  description: "Answers about who can join UniSphere, how colleges work, privacy, AI features, reporting content and deleting your account.",
  alternates: { canonical: "/faq" },
};

export default function FaqPage() {
  const faq = getFaq({ adsEnabled: ads.enabled || monetag.enabled });
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6 sm:py-20">
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
          },
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: publicEnv.appUrl },
              { "@type": "ListItem", position: 2, name: "FAQ", item: `${publicEnv.appUrl}/faq` },
            ],
          },
        ]}
      />
      <p className="eyebrow mb-2">Help</p>
      <h1 className="text-4xl font-extrabold">Frequently asked questions</h1>
      <p className="text-muted-foreground mt-4 text-lg">The short answers. The policies linked in the footer have the details.</p>
      <Accordion type="single" collapsible className="mt-10">
        {faq.map((f) => (
          <AccordionItem key={f.id} value={f.id}>
            <AccordionTrigger className="text-left text-base font-bold">{f.q}</AccordionTrigger>
            <AccordionContent className="text-muted-foreground text-[15px] leading-relaxed">{f.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
      <p className="text-muted-foreground mt-10">
        Did not find your answer?{" "}
        <Link href="/contact" className="text-blue-text font-semibold underline underline-offset-2">
          Contact us
        </Link>
        .
      </p>
      <div className="mt-8">
        <Button asChild size="lg" variant="hot">
          <Link href="/register">Join UniSphere</Link>
        </Button>
      </div>
    </div>
  );
}
