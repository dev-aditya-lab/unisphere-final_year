import Link from "next/link";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProfileForm } from "@/components/profile/profile-form";
import { ProfileImageUpload } from "@/components/profile/image-upload";
import { AchievementsCard, ExperiencesCard } from "@/components/profile/profile-lists";
import { SettingsSection } from "@/components/settings/section";
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="text-muted-foreground min-w-0 text-sm">
          Your page: <span className="text-foreground font-mono break-all">/u/{profile.username}</span>
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href={`/u/${profile.username}`}>
            <Eye /> Preview
          </Link>
        </Button>
      </div>

      <CompletionCard profile={profile} />

      <SettingsSection id="photo" title="Photos" description="Your profile picture and cover.">
        <div className="space-y-6">
          <ProfileImageUpload kind="avatar" currentKey={profile.avatar_key} name={profile.full_name} />
          <ProfileImageUpload kind="cover" currentKey={profile.cover_key} name={profile.full_name} />
        </div>
      </SettingsSection>

      <ProfileForm profile={profile} classInfo={classInfo.data} education={education} structures={structures} />
      <AchievementsCard items={achievements.data ?? []} />
      <ExperiencesCard items={experiences.data ?? []} />
    </div>
  );
}
