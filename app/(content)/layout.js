import { AppShell } from "@/components/shell/app-shell";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { getAuthUser, getCurrentProfile } from "@/lib/auth/session";

/**
 * Pages that can be public (profiles, posts, ideas…): signed-in members get the app shell,
 * visitors get the marketing chrome. Whether a record is visible at all is decided by RLS.
 */
export default async function ContentLayout({ children }) {
  const user = await getAuthUser();
  const profile = user ? await getCurrentProfile() : null;
  if (profile && profile.onboarded_at && ["active", "restricted"].includes(profile.status)) {
    return <AppShell profile={profile}>{children}</AppShell>;
  }
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
