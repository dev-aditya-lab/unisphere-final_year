import { Suspense } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { getMyPermissions, requireProfile } from "@/lib/auth/session";
import { getUnreadCounts } from "@/lib/services/notifications";
import { getFlags } from "@/lib/settings";
import { ReviewBanner } from "@/components/privacy/review-banner";
import { gateFor } from "@/lib/privacy/gate-server";
import { NOTICE_VERSION } from "@/lib/privacy/registry";
import { ReferralPromptGate } from "@/components/referrals/referral-prompt-gate";

// Everything under (member) requires a signed-in, onboarded member in good standing: the app pages in (app) and the
// content pages in (content) (posts, profiles, projects, events...). They share this one layout on purpose. A layout
// that is shared stays mounted while the member moves between pages, so the sidebar, bell, realtime connection and
// open menus are not torn down and rebuilt on every tap. Two separate layouts (as it used to be) rebuilt the whole
// frame each time a member went from the feed to a profile or a post, which cost a second or more on a phone.
export default async function MemberLayout({ children }) {
  // Everything the frame needs is independent of everything else, so it is fetched together (one round trip's wait
  // instead of four in a row). Each helper is memoised per request, so AppShell reuses the results.
  const [{ profile }, unread] = await Promise.all([requireProfile(), getUnreadCounts(), getFlags(), getMyPermissions()]);
  const gate = await gateFor(profile);
  return (
    <AppShell profile={profile} counts={{ "/messages": unread.messages, "/notifications": unread.notifications }} bellCount={unread.notifications}>
      {gate.state === "review_soft" && <ReviewBanner kind="soft" version={NOTICE_VERSION} />}
      {gate.state === "notice_updated" && <ReviewBanner kind="updated" version={NOTICE_VERSION} />}
      {children}
      {/* The Refer & Earn reminder: mounted only when the server says one is due, and never in the way of the page. */}
      <Suspense fallback={null}>
        <ReferralPromptGate />
      </Suspense>
    </AppShell>
  );
}
