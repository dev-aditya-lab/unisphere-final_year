import { Lightbulb, Users } from "@/components/icons/lucide-compat";
import { OrbitRings } from "@/components/marketing/illustrations";
import { AiNote, MockPost, MockSearch, MockWindow, TypeChip } from "@/components/marketing/mock-parts";

/**
 * The hero's product visual: a window onto the feed with two pieces of the product resting against it, set in front
 * of orbit lines. Layers are plain CSS (a perspective tilt on large screens, nothing animated on load), so the first
 * paint is the finished picture. On small screens the floating pieces stack under the window.
 */
export function HeroStage({ className }) {
  return (
    <figure className={className}>
      <div className="relative mx-auto max-w-[36rem] pb-4 lg:pb-16">
        <OrbitRings className="absolute -top-16 -right-24 -z-0 hidden size-[34rem] opacity-70 lg:block" />

        <div className="relative lg:[transform:perspective(1400px)_rotateY(-6deg)_rotateX(2deg)]">
          <MockWindow title="unisphere / feed">
            <div className="space-y-3 p-3 sm:p-4">
              <div className="bg-card flex items-center gap-2 rounded-xl border px-3 py-2.5">
                <span aria-hidden="true" className="bg-accent size-7 rounded-full" />
                <span className="text-muted-foreground text-sm">Share an update, a project or a question…</span>
              </div>
              <MockPost initials="AK" name="Asha K." meta="Example · 3rd year, CSE" category="Project" tone="tone-blue" stats={[24, 6]}>
                Shipped the first version of a hostel laundry-slot tracker. Looking for someone comfortable with React Native for notifications.
              </MockPost>
              <MockPost initials="PD" name="Priya D." meta="Example · 2nd year, ECE" category="Question" tone="tone-plum" stats={[8, 14]}>
                Has anyone worked with low-power sensors for campus air-quality monitoring? Where would you start?
              </MockPost>
            </div>
          </MockWindow>
        </div>

        {/* Pieces resting against the window (stacked on small screens) */}
        <div className="relative mt-4 grid gap-3 sm:grid-cols-2 lg:absolute lg:inset-x-0 lg:bottom-0 lg:mt-0 lg:block">
          <div className="surface-raised tone-teal p-3.5 lg:absolute lg:-right-8 lg:-bottom-6 lg:w-[15.5rem] lg:[transform:rotate(2deg)]">
            <p className="text-teal-text flex items-center gap-1.5 text-xs font-bold">
              <Lightbulb className="size-3.5" aria-hidden="true" /> Found for you
            </p>
            <MockSearch>Who is already working on reducing food waste in hostels?</MockSearch>
            <AiNote className="mt-2" label="AI suggestion">
              Add meal-demand forecasting from mess data.
            </AiNote>
          </div>
          <div className="surface-raised tone-sun p-3.5 lg:absolute lg:-bottom-8 lg:-left-6 lg:w-[14rem] lg:[transform:rotate(-2.5deg)]">
            <p className="flex items-center gap-1.5 text-sm font-bold">
              <Users className="size-4" aria-hidden="true" /> Campus Lost &amp; Found
            </p>
            <p className="text-muted-foreground mt-0.5 text-xs">3 of 5 members · open roles</p>
            <p className="mt-2 flex flex-wrap gap-1.5">
              <TypeChip tone="tone-leaf">Mobile developer</TypeChip>
              <TypeChip tone="tone-rose">UI/UX designer</TypeChip>
            </p>
          </div>
        </div>
      </div>
      <figcaption className="text-muted-foreground mt-3 text-center text-xs font-medium lg:mt-14 lg:text-left">
        Illustrative example with invented people, not real members.
      </figcaption>
    </figure>
  );
}
