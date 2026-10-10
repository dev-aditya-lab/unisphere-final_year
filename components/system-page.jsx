import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

/** Full-page frame for 404 / errors / maintenance / suspended screens. */
export function SystemPage({ code, title, children, actions }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between p-4 sm:p-6">
        <Logo />
        <ThemeToggle />
      </header>
      <main id="main" className="flex flex-1 items-center justify-center px-4 pb-20">
        <div className="max-w-lg text-center">
          {code && <p className="text-primary font-mono text-sm font-semibold tracking-[0.2em]">{code}</p>}
          <h1 className="mt-3 text-3xl font-extrabold sm:text-4xl">{title}</h1>
          <div className="text-muted-foreground mt-4 space-y-3 text-base">{children}</div>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {actions ?? (
              <>
                <Button asChild>
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
