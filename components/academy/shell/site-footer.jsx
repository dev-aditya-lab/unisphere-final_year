import Link from "next/link";
import { business } from "@/lib/business";
import { AcademyLogo } from "@/components/academy/brand/academy-logo";
import { getAcademySettings } from "@/lib/services/academy";

const COLUMNS = [
  { title: "Learn", links: [["Courses", "/academy/courses"], ["Programs", "/academy/programs"], ["Project internships", "/academy/internships"], ["Mentorship", "/academy/mentorship"], ["Pricing", "/academy/pricing"]] },
  { title: "Trust", links: [["Verify a certificate", "/academy/verify"], ["Terms of service", "/terms"], ["Refund policy", "/refund-policy"], ["Privacy policy", "/privacy"]] },
  { title: "UniSphere", links: [["Open UniSphere", "/feed"], ["Community guidelines", "/guidelines"], ["Privacy policy", "/privacy"], ["Grievance officer", "/grievance"], ["Contact", "/contact"]] },
];

export async function AcademyFooter() {
  const settings = await getAcademySettings();
  const email = settings.supportEmail || business.email;
  return (
    <footer className="ac-band-solid ac-noprint mt-24 ac-footer">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <AcademyLogo light="dark" />
          <p className="mt-3 max-w-xs text-sm text-[#c3cde0]">Learn practical skills, build real projects with a mentor, and earn a certificate anyone can verify.</p>
          <p className="mt-4 text-sm">
            Support: <a className="underline underline-offset-4 hover:text-white" href={`mailto:${email}`}>{email}</a>
          </p>
          {business.legalName && <p className="mt-2 text-xs text-[#9aa6bf]">Operated by {business.legalName}</p>}
          {business.addressLines.length > 0 && <address className="mt-1 text-xs not-italic text-[#9aa6bf]">{business.addressLines.join(", ")}</address>}
        </div>
        {COLUMNS.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <h2 className="text-xs font-bold tracking-[0.14em] text-[#9aa6bf] uppercase">{c.title}</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {c.links.map(([label, href]) => (
                <li key={href}><Link className="text-[#e3e8f3] transition-colors hover:text-white" href={href}>{label}</Link></li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-[var(--ac-line)]">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-[#9aa6bf] sm:px-6">
          Certificates show what a student completed on UniSphere Academy. They are not degrees, and the Academy does not promise jobs or placements.
        </p>
      </div>
    </footer>
  );
}
