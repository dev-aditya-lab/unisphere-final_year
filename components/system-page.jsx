import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

/** Full-page frame for 404 / errors / maintenance / suspended screens. */
export function SystemPage({ code, title, children, actions }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))] sm:p-6">
        <Logo />
        <ThemeToggle />
      </header>
      <main id="main" tabIndex={-1} className="flex flex-1 items-center justify-center px-4 pb-20 outline-none">
        <div className="relative max-w-lg text-center">
          {/* A small orbit: a planet and a satellite that has wandered off. Decorative, and still when motion is reduced. */}
          <svg aria-hidden="true" viewBox="0 0 200 120" className="mx-auto mb-2 h-24 w-40" fill="none">
            <ellipse cx="100" cy="64" rx="86" ry="30" transform="rotate(-14 100 64)" stroke="var(--border-strong)" strokeWidth="2" strokeDasharray="3 6" />
            <circle cx="100" cy="62" r="26" fill="var(--sun)" stroke="var(--foreground)" strokeWidth="2.5" />
            <circle cx="100" cy="62" r="26" fill="none" />
            <g className="origin-center [animation:orbit_24s_linear_infinite]" style={{ transformOrigin: "100px 62px" }}>
              <circle cx="176" cy="40" r="8" fill="var(--coral)" stroke="var(--foreground)" strokeWidth="2.5" />
            </g>
          </svg>
          {code && <p className="text-coral-text text-sm font-extrabold tracking-[0.2em] uppercase">{code}</p>}
          <h1 className="display-sm mt-3">{title}</h1>
          <div className="text-muted-foreground mt-4 space-y-3 text-base leading-relaxed">{children}</div>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {actions ?? (
              <>
                <Button asChild variant="hot">
                  <Link href="/">Go home</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/contact">Contact support</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
