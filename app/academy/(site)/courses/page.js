import { Catalog } from "@/components/academy/catalog";

export const metadata = {
  title: "Courses",
  description: "Browse Courses on UniSphere Academy: structured lessons, mentor feedback and verifiable certificates. Prices are shown before you pay.",
  alternates: { canonical: "/academy/courses" },
};

export default function Page({ searchParams }) {
  return <Catalog kind="course" searchParams={searchParams} basePath="/academy/courses" />;
}
