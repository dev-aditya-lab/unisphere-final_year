import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ExternalLink, Info, Landmark, MapPin, Users } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PersonCard } from "@/components/people/person-card";
import { CollegeMembershipButton, ReportCollegeDialog } from "@/components/colleges/college-actions";
import { ListingBadge, collegeLocation } from "@/components/colleges/listing";
import { Button } from "@/components/ui/button";
import { getAuthUser, getCurrentProfile } from "@/lib/auth/session";
import { getCollegeBySlug, listCollegeMembers } from "@/lib/services/colleges";

export async function generateMetadata({ params }) {
  const { collegeSlug } = await params;
  const college = await getCollegeBySlug(collegeSlug);
  return { title: college?.name ?? "College", robots: { index: false, follow: false } };
}

export default async function CollegePage({ params }) {
  const { collegeSlug } = await params;
  const college = await getCollegeBySlug(collegeSlug);
  if (!college) notFound();
  // A duplicate that was merged keeps working: old links land on the record that stayed.
  if (college.merged_into_slug) redirect(`/colleges/${college.merged_into_slug}`);

  const user = await getAuthUser();
  const profile = user ? await getCurrentProfile() : null;
  const members = await listCollegeMembers(college.id, 12);
  const isMine = profile?.college_id === college.id;
  const count = Number(college.member_count);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className="surface-raised p-5 sm:p-6" aria-labelledby="college-name">
        <div className="flex items-start gap-4">
          <span className="tone-chip tone-teal flex size-14 shrink-0 items-center justify-center rounded-xl">
            <Landmark className="size-7" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 id="college-name" className="text-2xl leading-tight font-extrabold break-words">{college.name}</h1>
            {college.short_name && <p className="text-muted-foreground text-sm font-semibold">{college.short_name}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
              {collegeLocation(college) && (
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <MapPin className="size-4" aria-hidden="true" /> {collegeLocation(college)}
                </span>
              )}
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Users className="size-4" aria-hidden="true" />
                {count.toLocaleString()} {count === 1 ? "member has" : "members have"} connected their profile
              </span>
              <ListingBadge status={college.listing_status} />
            </div>
          </div>
        </div>

        {college.description && <p className="mt-4 text-[15px] leading-relaxed">{college.description}</p>}

        {college.website && (
          <p className="mt-3 text-sm">
            <a href={college.website} target="_blank" rel="noopener noreferrer nofollow ugc" className="text-blue-text inline-flex items-center gap-1 font-semibold hover:underline">
              Website <ExternalLink className="size-3.5" aria-hidden="true" />
              <span className="sr-only">(opens in a new tab, added by a member)</span>
            </a>
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <CollegeMembershipButton collegeId={college.id} collegeName={college.name} isMine={isMine} signedIn={Boolean(profile)} />
          {profile && <ReportCollegeDialog collegeId={college.id} collegeName={college.name} />}
        </div>

        <p className="bg-sunken text-muted-foreground mt-5 flex items-start gap-2 rounded-xl p-3 text-xs leading-relaxed">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {college.listing_status === "verified"
            ? "This listing was reviewed by UniSphere staff. Members who connect this college have only chosen it: membership is not verified unless a person shows a Verified badge."
            : "This listing was added by a member and has not been checked. Anyone can suggest corrections. Connecting it to a profile does not mean someone studies or works here."}
        </p>
      </section>

      <section aria-labelledby="members-title">
        <h2 id="members-title" className="font-heading mb-3 text-lg font-bold">
          Members
        </h2>
        {members.length === 0 ? (
          <EmptyState icon={Users} title="No visible members yet">
            People appear here when they connect this college and their profile is visible to you.
          </EmptyState>
        ) : (
          <ul className="grid grid-cols-1 gap-3">
            {members.map((m) => (
              <li key={m.id}>
                <PersonCard person={m} />
              </li>
            ))}
          </ul>
        )}
        {count > members.length && (
          <p className="text-muted-foreground mt-3 text-sm">
            {(count - members.length).toLocaleString()} more {count - members.length === 1 ? "member is" : "members are"} not shown: their profiles are private, or only visible to people they allow.{" "}
            <Button asChild variant="link" size="sm" className="h-auto p-0">
              <Link href="/colleges">Browse all colleges</Link>
            </Button>
          </p>
        )}
      </section>
    </div>
  );
}
