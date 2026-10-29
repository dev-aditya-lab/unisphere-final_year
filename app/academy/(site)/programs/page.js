import { Catalog } from "@/components/academy/catalog";

export const metadata = {
  title: "Programs",
  description: "Browse Programs on UniSphere Academy: structured lessons, mentor feedback and verifiable certificates. Prices are shown before you pay.",
  alternates: { canonical: "/academy/programs" },
};

export default function Page({ searchParams }) {
  return <Catalog kind="program" searchParams={searchParams} basePath="/academy/programs" />;
}
