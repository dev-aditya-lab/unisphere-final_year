import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Not found" };

export default function AcademyNotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      <p className="ac-kicker">404</p>
      <h1 className="ac-display mt-3 text-4xl">We could not find that</h1>
      <p className="text-muted-foreground mt-3">The course, program or page may have moved, or it is not published yet.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button asChild><Link href="/academy/courses">Browse courses</Link></Button>
        <Button asChild variant="outline"><Link href="/academy">Academy home</Link></Button>
      </div>
    </div>
  );
}
