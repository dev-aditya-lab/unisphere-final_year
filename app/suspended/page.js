import Link from "next/link";
import { redirect } from "next/navigation";
import { SystemPage } from "@/components/system-page";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/lib/actions/auth";
import { getCurrentProfile, requireUser } from "@/lib/auth/session";
import { AccountStanding } from "@/components/settings/account-standing";
import { getMyModerationState } from "@/lib/services/admin";

export const metadata = { title: "Account restricted", robots: { index: false, follow: false } };

export default async function SuspendedPage() {
  await requireUser();
  const profile = await getCurrentProfile();
  if (!profile || profile.status === "active" || profile.status === "restricted") redirect("/feed");

  const deactivated = profile.status === "deactivated" || profile.status === "deleted";
  const standing = deactivated ? [] : (await getMyModerationState(profile.id)).filter((a) => a.action === "suspend" || a.action === "restrict").slice(0, 3);
  return (
    <SystemPage
      code={deactivated ? "Account inactive" : "Account suspended"}
      title={deactivated ? "This account is not active" : "Your account is suspended"}
      actions={
        <>
          <Button asChild>
            <Link href="/contact">Contact support</Link>
          </Button>
          <form action={logoutAction}>
            <Button type="submit" variant="outline">
              Log out
            </Button>
          </form>
        </>
      }
    >
      <p>
        {deactivated
          ? "This account has been deactivated."
          : "A moderator suspended this account for breaking the community guidelines. While suspended you cannot post, comment or message."}
      </p>
      {standing.length > 0 ? (
        <div className="bg-card mt-2 rounded-lg border p-4">
          <AccountStanding items={standing} accountStatus={profile.status} />
        </div>
      ) : (
        !deactivated && <p>If you think this was a mistake, you can contact support and ask for a review.</p>
      )}
    </SystemPage>
  );
}
