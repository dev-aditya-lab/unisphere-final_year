import Link from "next/link";
import { SystemPage } from "@/components/system-page";
import { Button } from "@/components/ui/button";

export const metadata = { title: "No access", robots: { index: false, follow: false } };

export default function ForbiddenPage() {
  return (
    <SystemPage
      code="403"
      title="You do not have access to that"
      actions={
        <Button asChild>
          <Link href="/feed">Back to UniSphere</Link>
        </Button>
      }
    >
      <p>Your account does not have the permission needed for this area. If you think this is a mistake, ask an administrator at your college.</p>
    </SystemPage>
  );
}
