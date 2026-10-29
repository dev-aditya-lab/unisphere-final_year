import Link from "next/link";
import { BadgePercent, Receipt, RotateCcw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PriceTag } from "@/components/academy/ui/price";
import { EmptyBlock, SectionHeading } from "@/components/academy/ui/section";
import { Reveal } from "@/components/academy/ui/reveal";
import { KINDS, detailPath } from "@/lib/academy/constants";
import { formatBps } from "@/lib/academy/money";
import { getAcademySettings, getPrices, listCourses } from "@/lib/services/academy";

export const metadata = {
  title: "Pricing",
  description: "What UniSphere Academy courses, programs and project internships cost, how sales and coupons work, and how refunds are handled.",
  alternates: { canonical: "/academy/pricing" },
};

// Prices come from the pricing engine on every view; nothing on this page is a number someone typed into it.
export const revalidate = 60;

export default async function PricingPage() {
  const [{ courses }, settings] = await Promise.all([listCourses({ pageSize: 60, sort: "title" }), getAcademySettings()]);
  const prices = await getPrices(courses.map((c) => c.id));
  const byKind = Object.keys(KINDS).map((k) => ({ kind: k, items: courses.filter((c) => c.kind === k) })).filter((g) => g.items.length > 0);
  const tax = settings.taxMode === "exclusive" ? `${settings.taxLabel} (${formatBps(settings.taxRateBps)}) is added at checkout and shown as its own line.`
    : settings.taxMode === "inclusive" ? `Prices include ${settings.taxLabel} (${formatBps(settings.taxRateBps)}); the checkout shows how much of the total it is.`
    : "No tax is added at checkout at present.";

  return (
    <>
      <section className="ac-band">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <div className="ac-stagger max-w-3xl">
            <p className="ac-kicker" style={{ "--i": 0 }}>Pricing</p>
            <h1 className="ac-display mt-4 text-[clamp(2.4rem,5vw,4rem)]" style={{ "--i": 1 }}>Pay once. See the total first.</h1>
            <p className="mt-4 text-lg text-[#c3c7e6]" style={{ "--i": 2 }}>Each course has its own price, set by the Academy team. There is no subscription. Any sale, coupon and tax is shown before you confirm.</p>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-16 px-4 py-14 sm:px-6">
        <section aria-labelledby="how">
          <SectionHeading kicker="How it works" title="What goes into the price" />
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              [Receipt, "List price", "Set per course or program by the Academy team. Free courses cost nothing."],
              [BadgePercent, "Sales and coupons", `Scheduled sale prices have a clear end date. A coupon code can lower the price further${settings.couponWithSale === "block" ? ", but not on top of a sale" : ""}; the checkout tells you if a code does not apply.`],
              [ShieldCheck, "Tax", tax],
              [RotateCcw, "Refunds", `You can ask for a refund within ${settings.refundWindowDays} days. See the `],
            ].map(([Icon, title, text], i) => (
              <Reveal key={title} delay={i * 0.06}>
                <div className="ac-card h-full p-5">
                  <span className="bg-primary-soft text-primary-text grid size-10 place-items-center rounded-xl"><Icon className="size-5" aria-hidden /></span>
                  <h3 className="ac-display mt-4 text-xl">{title}</h3>
                  <p className="text-muted-foreground mt-2 text-sm">{text}{title === "Refunds" && <Link href="/refund-policy" className="text-primary-text underline">refund policy</Link>}{title === "Refunds" && "."}</p>
                </div>
              </Reveal>
            ))}
          </div>
          {!settings.salesEnabled && <p className="bg-muted mt-6 rounded-lg px-4 py-3 text-sm" role="status">Paid enrolment has not opened yet. Free courses can be taken now.</p>}
        </section>

        <section aria-labelledby="list">
          <SectionHeading kicker="Today's prices" title="Courses, programs and internships" />
          {byKind.length === 0 ? (
            <Reveal className="mt-8"><EmptyBlock title="Nothing is on sale yet" action={<Button asChild variant="outline"><Link href="/academy/courses">Browse the catalogue</Link></Button>}>Prices appear here as soon as the first courses are published.</EmptyBlock></Reveal>
          ) : (
            byKind.map((g) => (
              <div key={g.kind} className="mt-10">
                <h3 className="ac-display text-2xl">{KINDS[g.kind].plural}</h3>
                <div className="ac-card mt-4 divide-y">
                  {g.items.map((c) => (
                    <div key={c.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4">
                      <div className="min-w-0 flex-1">
                        <Link href={detailPath(c)} className="ac-display text-lg hover:underline">{c.title}</Link>
                        <p className="text-muted-foreground font-mono text-xs">{c.code}</p>
                      </div>
                      <PriceTag price={prices[c.id]} />
                      <Button asChild size="sm" variant="outline" className="rounded-full"><Link href={detailPath(c)}>Details</Link></Button>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </section>
      </div>
    </>
  );
}
