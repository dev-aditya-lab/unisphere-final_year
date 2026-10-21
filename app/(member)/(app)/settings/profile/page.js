import Link from "next/link";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProfileForm } from "@/components/profile/profile-form";
import { ProfileImageUpload } from "@/components/profile/image-upload";
import { AchievementsCard, ExperiencesCard } from "@/components/profile/profile-lists";
import { CompletionCard } from "@/components/profile/completion-card";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getEducation, getEducationStructures } from "@/lib/services/colleges";

export const metadata = { title: "Edit profile" };

export default async function ProfileSettingsPage() {
  const { profile } = await requireProfile();
  const supabase = await createClient();

  const education = await getEducation(profile.id);
  const [structures, classInfo, achievements, experiences] = await Promise.all([
    getEducationStructures(education),
    supabase.from("profile_class_info").select("current_year, current_semester").eq("user_id", profile.id).maybeSingle(),
    supabase.from("profile_achievements").select("*").eq("user_id", profile.id).order("achieved_on", { ascending: false, nullsFirst: false }),
    supabase.from("profile_experiences").select("*").eq("user_id", profile.id).order("start_date", { ascending: false, nullsFirst: false }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">Your profile page is at <span className="text-foreground font-mono">/u/{profile.username}</span>, visible to the members you allow.</p>
        <Button asChild variant="outline" size="sm">
          <Link href={`/u/${profile.username}`}>
            <Eye /> Preview your profile
          </Link>
        </Button>
      </div>

      <CompletionCard profile={profile} />

      <section id="photo" className="surface scroll-mt-24 space-y-6 p-5 sm:p-6">
        <h2 className="text-lg font-bold">Photos</h2>
        <ProfileImageUpload kind="avatar" currentKey={profile.avatar_key} name={profile.full_name} />
        <ProfileImageUpload kind="cover" currentKey={profile.cover_key} name={profile.full_name} />
      </section>

      <ProfileForm profile={profile} classInfo={classInfo.data} education={education} structures={structures} />
      <AchievementsCard items={achievements.data ?? []} />
      <ExperiencesCard items={experiences.data ?? []} />
    </div>
  );
}
