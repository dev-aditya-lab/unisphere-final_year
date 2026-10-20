import { NotificationPrefsForm } from "@/components/settings/notification-prefs-form";
import { requireProfile } from "@/lib/auth/session";
import { getPreferences } from "@/lib/services/notifications";
import { AppSettings } from "@/components/settings/app-settings";
import { getIntegrations } from "@/lib/env";
import { publicEnv } from "@/lib/env-public";

export const metadata = { title: "Notification settings" };

export default async function NotificationSettingsPage() {
  const { user } = await requireProfile();
  const prefs = await getPreferences(user.id);
  return (
    <div className="space-y-6">
      <AppSettings pushConfigured={getIntegrations().push} vapidPublicKey={publicEnv.vapidPublicKey} />
      <NotificationPrefsForm initial={prefs} />
    </div>
  );
}
