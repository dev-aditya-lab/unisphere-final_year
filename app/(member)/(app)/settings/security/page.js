import Link from "next/link";
import { ChangePasswordCard, SessionsCard } from "@/components/settings/security-panels";
import { requireProfile } from "@/lib/auth/session";
import { AccountStanding } from "@/components/settings/account-standing";
import { getMyModerationState } from "@/lib/services/admin";

export const metadata = { title: "Security settings" };

export default async function SecuritySettingsPage() {
  const { user, profile } = await requireProfile();
  const standing = await getMyModerationState(profile.id);

  return (
    <div className="space-y-6">
      {standing.length > 0 && (
        <section className="surface p-5 sm:p-6" aria-labelledby="standing-heading">
          <h2 id="standing-heading" className="text-lg font-bold">Account standing</h2>
          <p className="text-muted-foreground mt-1 mb-4 text-sm">Decisions moderators made about your account or content. You can ask for each one to be reviewed once.</p>
          <AccountStanding items={standing} accountStatus={profile.status} />
        </section>
      )}
      <section className="surface p-5 sm:p-6">
        <h2 className="text-lg font-bold">Sign-in email</h2>
        <p className="mt-1 text-sm">{user.email}</p>
        <p className="text-muted-foreground mt-1 text-xs">Only you can see this. It is never shown on your profile.</p>
      </section>
      <section className="surface p-5 sm:p-6">
        <h2 className="text-lg font-bold">Your data</h2>
        <p className="text-muted-foreground mt-1 text-sm">Download a copy of what you have posted and set on UniSphere as a JSON file. You can do this up to three times an hour.</p>
        <a href="/api/account/export" download className="text-blue-text mt-3 inline-block text-sm font-semibold hover:underline">Download my data</a>
        <span className="text-muted-foreground text-xs"> · more in <Link href="/privacy-requests" className="text-blue-text underline">Data &amp; requests</Link></span>
      </section>
      <ChangePasswordCard />
      <SessionsCard />
      <section className="border-destructive/30 rounded-lg border p-5 sm:p-6">
        <h2 className="text-destructive-text text-lg font-bold">Delete account</h2>
        <p className="text-muted-foreground mt-1 text-sm">Erase your account and the data you own. You confirm with your password and have 14 days to change your mind.</p>
        <Link href="/delete-account" className="text-destructive-text mt-3 inline-block text-sm font-semibold underline">Go to account deletion</Link>
      </section>
    </div>
  );
}
