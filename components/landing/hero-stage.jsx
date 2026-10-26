import Image from "next/image";
import { Lightbulb } from "@/components/icons/lucide-compat";
import { HeroLayer, HeroPointer } from "@/components/landing/hero-pointer";
import { AiNote, MockPost } from "@/components/marketing/mock-parts";
import { landingImage } from "@/lib/landing/image-specs.mjs";

/**
 * The hero's picture: a wide photograph (public/landing/hero-campus.jpg) with two pieces of the product resting against it. The
 * frame wipes open and the photograph settles from a zoom, in CSS, from the first paint. On a desktop the photograph also gets
 * sheryjs's WebGL ripple under the pointer (landing-fx.jsx starts it late; the class `sh-hero` marks the image) and the cards drift
 * a little against the mouse (Motion).
 *
 * The photograph is `unoptimized` on purpose: sheryjs reads the image's own `src` and uses it as a texture, so one URL for one
 * file keeps it from downloading a second, larger variant. Export it at the size in lib/landing/image-specs.mjs.
 * On a phone the frame is portrait, so the same photograph is cropped by `object-cover`.
 */
export function HeroStage() {
  return (
    <figure className="relative mt-14 w-full lg:mt-20">
      <HeroPointer className="relative">
        <div data-hero-media className="hero-frame img-frame aspect-4/5 sm:aspect-16/10 lg:aspect-video">
          <Image src={landingImage("hero-campus.jpg")} alt="" fill priority unoptimized sizes="(min-width: 1152px) 1152px, 100vw" className="hero-img sh-hero object-cover" />
        </div>

        <HeroLayer depth={9} className="absolute bottom-4 left-3 z-10 w-[min(18rem,82%)] sm:-bottom-10 sm:left-8">
          <div className="hero-card" style={{ "--i": 0 }}>
            <div className="rounded-2xl shadow-[var(--shadow-pop)]">
              <MockPost initials="AK" name="Asha K." meta="Example · 3rd year, CSE" category="Project" tone="tone-blue" stats={[24, 6]}>
                Shipped the first version of a hostel laundry-slot tracker. Looking for someone comfortable with React Native.
              </MockPost>
            </div>
          </div>
        </HeroLayer>

        <HeroLayer depth={16} className="absolute -top-10 right-6 z-10 hidden w-64 sm:block lg:right-12">
          <div className="hero-card" style={{ "--i": 1 }}>
            <div className="surface-raised p-4 shadow-[var(--shadow-pop)]">
              <p className="text-signal-text flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.12em] uppercase">
                <Lightbulb className="size-3.5" aria-hidden="true" /> Found for you
              </p>
              <p className="mt-2 text-sm leading-snug font-medium">Who is already working on reducing food waste in hostels?</p>
              <AiNote className="mt-3" label="AI suggestion">
                Add meal-demand forecasting from mess data.
              </AiNote>
            </div>
          </div>
        </HeroLayer>
      </HeroPointer>
      <figcaption className="hero-in text-muted-foreground mt-14 text-xs sm:mt-16" style={{ "--i": 6 }}>
        Illustrative example with invented people, not real members.
      </figcaption>
    </figure>
  );
}
