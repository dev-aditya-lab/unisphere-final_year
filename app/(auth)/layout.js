import Link from "next/link";
import { Lightbulb, ShieldCheck, Users } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { APP_TAGLINE } from "@/lib/constants";

// Three plain promises, each on a slightly crooked "sticker". Every one is something the product really does.
const POINTS = [
  { icon: Lightbulb, title: "See what already exists", text: "Before you build, find the ideas and projects your campus has already started.", tilt: "-rotate-[1.5deg]", tone: "tone-sun" },
  { icon: Users, title: "Find your teammates", text: "Match on real skills and open roles, with a plain reason for every suggestion.", tilt: "rotate-[1deg] sm:translate-x-5", tone: "tone-teal" },
  { icon: ShieldCheck, title: "Open, and private", text: "Anyone can join. Nothing here is public: you only see it when you are signed in.", tilt: "-rotate-[0.75deg]", tone: "tone-blue" },
];

export default function AuthLayout({ children }) {
  return (
    <div className="grid grid-cols-1 min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {/* The "cover": always the brand coral, in light and dark, so the product has one unmistakable colour. */}
      <aside className="bg-accent-hot text-accent-hot-foreground relative hidden flex-col justify-between overflow-hidden p-10 lg:flex xl:p-14">
        <div className="relative z-10">
          <Logo tile />
        </div>
        <div className="relative z-10 max-w-md">
          <p className="text-[0.6875rem] font-extrabold tracking-[0.16em] uppercase">Open to everyone</p>
          <h2 className="display-sm mt-4 text-balance">{APP_TAGLINE}</h2>
          <ul className="mt-10 space-y-4">
            {POINTS.map(({ icon: Icon, title, text, tilt, tone }) => (
              <li
                key={title}
                className={`bg-card text-card-foreground border-foreground flex gap-3.5 rounded-xl border p-4 shadow-[3px_3px_0_0_var(--hard)] ${tilt} ${tone}`}
              >
                <span className="tone-chip flex size-9 shrink-0 items-center justify-center rounded-lg">
                  <Icon className="size-[18px]" aria-hidden="true" />
                </span>
                <div>
                  <p className="font-heading leading-tight font-bold">{title}</p>
                  <p className="text-muted-foreground mt-0.5 text-sm leading-snug">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative z-10 text-xs font-semibold">&copy; {new Date().getFullYear()} UniSphere · Made at RGEC</p>
        {/* Brand motion: the orbit turns very slowly (transform only, stopped for reduced motion). */}
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute -right-44 -bottom-44 size-[38rem] origin-center opacity-25 [animation:orbit_90s_linear_infinite]"
          viewBox="0 0 200 200"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
        >
          <circle cx="100" cy="100" r="95" />
          <circle cx="100" cy="100" r="68" strokeDasharray="2 5" />
          <circle cx="100" cy="100" r="42" />
          <ellipse cx="100" cy="100" rx="98" ry="38" transform="rotate(-24 100 100)" />
          <circle cx="172" cy="62" r="6" fill="var(--sun)" stroke="none" />
        </svg>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="flex items-center justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))] sm:p-6">
          <Logo className="lg:invisible" />
          <ThemeToggle />
        </header>
        <main id="main" tabIndex={-1} className="flex flex-1 items-center justify-center px-4 pb-12 outline-none sm:px-6">
          <div className="w-full max-w-[26rem]">{children}</div>
        </main>
        <footer className="text-muted-foreground px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center text-xs font-medium">
          <Link href="/terms" className="hover:text-foreground underline-offset-2 hover:underline">Terms</Link>
          <span aria-hidden="true"> · </span>
          <Link href="/privacy" className="hover:text-foreground underline-offset-2 hover:underline">Privacy</Link>
          <span aria-hidden="true"> · </span>
          <Link href="/guidelines" className="hover:text-foreground underline-offset-2 hover:underline">Guidelines</Link>
        </footer>
      </div>
    </div>
  );
}
