import { AppShell } from "@/components/shell/app-shell";
import { VerificationGate } from "@/components/shell/verification-gate";
import { getMembershipGate, isGateExempt } from "@/lib/auth/gate";
import { requireProfile } from "@/lib/auth/session";
import { getUnreadCounts } from "@/lib/services/notifications";

// Everything under (app) requires a signed-in, onboarded member in good standing.
export default async function AppLayout({ children }) {
  const { profile } = await requireProfile();
  // Not yet verified: only the verification screen and the member's own settings are available.
  if ((await getMembershipGate(profile)).blocked && !(await isGateExempt())) return <VerificationGate profile={profile} />;
  const unread = await getUnreadCounts();
  return (
    <AppShell profile={profile} counts={{ "/messages": unread.messages, "/notifications": unread.notifications }} bellCount={unread.notifications}>
      {children}
    </AppShell>
  );
}
