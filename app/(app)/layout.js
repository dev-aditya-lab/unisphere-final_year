import { AppShell } from "@/components/shell/app-shell";
import { getMyPermissions, requireProfile } from "@/lib/auth/session";
import { getUnreadCounts } from "@/lib/services/notifications";
import { getFlags } from "@/lib/settings";

// Everything under (app) requires a signed-in, onboarded member in good standing.
export default async function AppLayout({ children }) {
  // Everything the frame needs is independent of everything else, so it is fetched together (one round trip's wait
  // instead of four in a row). Each helper is memoised per request, so AppShell reuses the results.
  const [{ profile }, unread] = await Promise.all([requireProfile(), getUnreadCounts(), getFlags(), getMyPermissions()]);
  return (
    <AppShell profile={profile} counts={{ "/messages": unread.messages, "/notifications": unread.notifications }} bellCount={unread.notifications}>
      {children}
    </AppShell>
  );
}
