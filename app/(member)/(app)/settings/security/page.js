import Link from "next/link";
import { ChangePasswordCard, SessionsCard } from "@/components/settings/security-panels";
import { requireProfile } from "@/lib/auth/session";
import { SettingsSection } from "@/components/settings/section";
import { AccountStanding } from "@/components/settings/account-standing";
import { getMyModerationState } from "@/lib/services/admin";

export const metadata = { title: "Security settings" };

export default async function SecuritySettingsPage() {
  const { user, profile } = await requireProfile();
  const standing = await getMyModerationState(profile.id);

  return (
    <div className="space-y-4">
      {standing.length > 0 && (
        <SettingsSection id="standing" title="Account standing" description="Decisions moderators made about your account or content. You can ask for each one to be reviewed once." defaultOpen>
          <AccountStanding items={standing} accountStatus={profile.status} />
        </SettingsSection>
      )}
      <SettingsSection id="email" title="Sign-in email" description={user.email} defaultOpen>
        <p className="text-muted-foreground text-xs">Only you can see this. It is never shown on your profile.</p>
      </SettingsSection>
      <ChangePasswordCard />
      <SessionsCard />
      <SettingsSection id="data" title="Your data" description="Download a copy of what you have posted and set.">
        <p className="text-muted-foreground text-sm">A JSON file with what you have posted and set on UniSphere. You can do this up to three times an hour.</p>
        <a href="/api/account/export" download className="text-blue-text inline-block text-sm font-semibold hover:underline">Download my data</a>
        <p className="text-muted-foreground text-xs">More in <Link href="/privacy-requests" className="text-blue-text underline">Data &amp; requests</Link>.</p>
      </SettingsSection>
      <SettingsSection id="delete" tone="danger" title="Delete account" description="Erase your account and the data you own.">
        <p className="text-muted-foreground text-sm">You confirm with your password and have 14 days to change your mind. Nothing is deleted by opening the next page.</p>
        <Link href="/delete-account" className="text-destructive-text inline-block text-sm font-semibold underline">Go to account deletion</Link>
      </SettingsSection>
    </div>
  );
}
