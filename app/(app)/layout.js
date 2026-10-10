import { AppShell } from "@/components/shell/app-shell";
import { requireProfile } from "@/lib/auth/session";
import { getUnreadCounts } from "@/lib/services/notifications";

// Everything under (app) requires a signed-in, onboarded member in good standing.
export default async function AppLayout({ children }) {
  const { profile } = await requireProfile();
  const unread = await getUnreadCounts();
  return (
    <AppShell profile={profile} counts={{ "/messages": unread.messages, "/notifications": unread.notifications }} bellCount={unread.notifications}>
      {children}
    </AppShell>
  );
}
