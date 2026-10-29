import { Catalog } from "@/components/academy/catalog";

export const metadata = {
  title: "Internships",
  description: "Browse Internships on UniSphere Academy: structured lessons, mentor feedback and verifiable certificates. Prices are shown before you pay.",
  alternates: { canonical: "/academy/internships" },
};

export default function Page({ searchParams }) {
  return <Catalog kind="internship" searchParams={searchParams} basePath="/academy/internships" />;
}
