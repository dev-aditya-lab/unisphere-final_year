import Link from "next/link";
import { Lightbulb, Users, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { APP_TAGLINE } from "@/lib/constants";

const POINTS = [
  { icon: Lightbulb, title: "See what already exists", text: "AI finds related ideas and projects on your campus before you build from scratch." },
  { icon: Users, title: "Find the right teammates", text: "Match on listed skills and open roles, with a plain-language reason for every suggestion." },
  { icon: ShieldCheck, title: "Verified, private by default", text: "College verification badges and profile visibility controls you decide." },
];

export default function AuthLayout({ children }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="bg-[#17243A] text-[#F7F5EF] relative hidden flex-col justify-between overflow-hidden p-10 lg:flex xl:p-14">
        <div className="relative z-10">
          <Logo tile className="text-[#F7F5EF]" />
        </div>
        <div className="relative z-10 max-w-md">
          <p className="eyebrow !text-[#9aa6bf]">The campus network</p>
          <h2 className="mt-4 text-4xl leading-[1.1] font-extrabold text-balance">{APP_TAGLINE}</h2>
          <ul className="mt-10 space-y-6">
            {POINTS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md border border-white/15 bg-white/5">
                  <Icon className="size-4.5 text-[#9fb4ff]" aria-hidden="true" />
                </span>
                <div>
                  <p className="font-heading font-semibold">{title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-[#b7c1d6]">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative z-10 text-xs text-[#8d99b3]">&copy; {new Date().getFullYear()} UniSphere</p>
        {/* Decorative orbit lines */}
        <svg aria-hidden="true" className="pointer-events-none absolute -right-40 -bottom-40 size-[34rem] opacity-[0.07]" viewBox="0 0 200 200" fill="none" stroke="#F7F5EF">
          <circle cx="100" cy="100" r="95" />
          <circle cx="100" cy="100" r="70" />
          <circle cx="100" cy="100" r="45" />
          <ellipse cx="100" cy="100" rx="98" ry="38" transform="rotate(-24 100 100)" />
        </svg>
      </aside>

      <div className="flex flex-col">
        <header className="flex items-center justify-between p-4 sm:p-6">
          <Logo className="lg:invisible" />
          <div className="flex items-center gap-1">
            <ThemeToggle />
          </div>
        </header>
        <main id="main" className="flex flex-1 items-center justify-center px-4 pb-12 sm:px-6">
          <div className="w-full max-w-[26rem]">{children}</div>
        </main>
        <footer className="text-muted-foreground px-6 pb-6 text-center text-xs">
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
