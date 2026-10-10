import Link from "next/link";
import { SystemPage } from "@/components/system-page";
import { Button } from "@/components/ui/button";
import { getAuthUser } from "@/lib/auth/session";

export const metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default async function NotFound() {
  // Signed-in members can search; a visitor is offered the way in (nothing inside is public).
  let signedIn = false;
  try {
    signedIn = Boolean(await getAuthUser());
  } catch {
    /* the sign-in service is unreachable: show the visitor version */
  }
  return (
    <SystemPage
      code="404"
      title="We could not find that page"
      actions={
        <>
          <Button asChild variant="hot">
            <Link href={signedIn ? "/feed" : "/"}>{signedIn ? "Back to your feed" : "Go home"}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={signedIn ? "/search" : "/login"}>{signedIn ? "Search UniSphere" : "Log in"}</Link>
          </Button>
        </>
      }
    >
      <p>The link may be broken, or the page may have been removed or made private.</p>
    </SystemPage>
  );
}
