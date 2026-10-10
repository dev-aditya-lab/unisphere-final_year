import Link from "next/link";
import { SystemPage } from "@/components/system-page";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <SystemPage
      code="404"
      title="We could not find that page"
      actions={
        <>
          <Button asChild>
            <Link href="/">Go home</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/search">Search UniSphere</Link>
          </Button>
        </>
      }
    >
      <p>The link may be broken, or the page may have been removed or made private.</p>
    </SystemPage>
  );
}
