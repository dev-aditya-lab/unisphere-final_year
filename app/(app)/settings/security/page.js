import { ChangePasswordCard, DeleteAccountCard, SessionsCard } from "@/components/settings/security-panels";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { AccountStanding } from "@/components/settings/account-standing";
import { getMyModerationState } from "@/lib/services/admin";

export const metadata = { title: "Security settings" };

export default async function SecuritySettingsPage() {
  const { user, profile } = await requireProfile();
  const supabase = await createClient();
  const { data: pendingRequest } = await supabase
    .from("account_deletion_requests")
    .select("id, scheduled_for")
    .eq("user_id", profile.id)
    .eq("status", "pending")
    .maybeSingle();

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
      </section>
      <ChangePasswordCard />
      <SessionsCard />
      <DeleteAccountCard pendingRequest={pendingRequest} />
    </div>
  );
}
