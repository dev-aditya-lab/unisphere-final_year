import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { APP_TAGLINE } from "@/lib/constants";
import { PrivacyChoicesLink } from "@/components/ads/privacy-choices";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/features", label: "Features" },
      { href: "/#idea-discovery", label: "AI idea discovery" },
      { href: "/#how-it-works", label: "How it works" },
      { href: "/#faq", label: "FAQ" },
    ],
  },
  {
    title: "Community",
    links: [
      { href: "/guidelines", label: "Community guidelines" },
      { href: "/about", label: "About UniSphere" },
      { href: "/features", label: "Features" },
      { href: "/contact", label: "Contact & support" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy policy" },
      { href: "/terms", label: "Terms of service" },
      { href: "/cookies", label: "Cookies and storage" },
    ],
  },
  {
    title: "Get started",
    links: [
      { href: "/register", label: "Create an account" },
      { href: "/login", label: "Log in" },
      { href: "/forgot-password", label: "Reset password" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="bg-sunken pb-safe mt-24 border-t">
      <div className="mx-auto grid grid-cols-1 max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_repeat(4,1fr)]">
        <div className="max-w-xs">
          <Logo />
          <p className="text-muted-foreground mt-3 text-sm">{APP_TAGLINE}</p>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h2 className="eyebrow mb-3 font-sans">{col.title}</h2>
            <ul className="space-y-2">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t">
        <div className="text-muted-foreground mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-5 text-xs sm:px-6">
          <p className="flex flex-wrap items-center gap-x-3">
            <span>&copy; {new Date().getFullYear()} UniSphere. All rights reserved.</span>
            <PrivacyChoicesLink className="hover:text-foreground underline underline-offset-2" />
          </p>
          <p>Made for Ramgarh Engineering College by Aditya Kumar Gupta, Sumit Jha, Sahil Nayak and Vishal Kumar.</p>
        </div>
      </div>
    </footer>
  );
}
