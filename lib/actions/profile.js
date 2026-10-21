"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/rate-limit";
import { dbError, fail, ok, parseInput } from "@/lib/actions/result";
import { deleteObject } from "@/lib/storage/r2";
import {
  profileSchema,
  onboardingSchema,
  privacySchema,
  achievementSchema,
  experienceSchema,
} from "@/lib/validators/profile";

function socialLinks({ linkedinUrl, twitterUrl }) {
  const links = {};
  if (linkedinUrl) links.linkedin = linkedinUrl;
  if (twitterUrl) links.twitter = twitterUrl;
  return links;
}

async function upsertClassInfo(supabase, userId, { currentYear, currentSemester }) {
  if (currentYear == null && currentSemester == null) {
    await supabase.from("profile_class_info").delete().eq("user_id", userId);
    return null;
  }
  const { error } = await supabase.from("profile_class_info").upsert(
    { user_id: userId, current_year: currentYear, current_semester: currentSemester, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
  return error;
}

/** The entry that stands for the member: the one marked primary, else the first. */
function primaryEntry(education) {
  return education.find((e) => e.isPrimary) ?? education[0] ?? null;
}

const EDUCATION_ERRORS = {
  college_not_found: ["education", "One of the colleges is no longer listed. Please choose it again."],
  duplicate_entry: ["education", "You listed the same college with the same role twice."],
  too_many_entries: ["education", "You can list up to eight schools or colleges."],
  invalid_years: ["education", "Check the years: the end cannot be before the start."],
  college_required: ["education", "Your profile is visible to “My college” only, so it needs a college. Add one, or change who can see your profile."],
};

/** Saves the member's list of schools and colleges (the database mirrors the primary one onto the profile). */
async function saveEducation(supabase, education) {
  const primary = primaryEntry(education);
  const rows = education.map((e) => ({
    college_id: e.collegeId,
    role: e.role,
    department_id: e.departmentId ?? null,
    program_id: e.programId ?? null,
    start_year: e.startYear,
    end_year: e.endYear,
    is_primary: e === primary,
  }));
  const { error } = await supabase.rpc("set_my_education", { p_entries: rows });
  if (!error) return null;
  const msg = String(error.message ?? "");
  for (const [needle, [field, text]] of Object.entries(EDUCATION_ERRORS)) {
    if (msg.includes(needle)) return fail("Please correct the highlighted fields.", { code: "validation", fieldErrors: { [field]: text } });
  }
  return dbError(error);
}

export async function saveOnboardingAction(input) {
  const user = await requireUser();
  const { data, failure } = parseInput(onboardingSchema, input);
  if (failure) return failure;

  const limited = await enforceRateLimit("profile-write", user.id, { limit: 30, windowSec: 60 });
  if (limited) return limited;

  const supabase = await createClient();

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: data.fullName,
      username: data.username,
      headline: data.headline ?? null,
      skills: data.skills,
      interests: data.interests,
      open_to_collaboration: data.openToCollaboration,
      onboarded_at: new Date().toISOString(),
    })
    .eq("id", user.id);
  if (error) {
    const res = dbError(error);
    if (res.code === "invalid_username" || res.code === "reserved_username" || res.code === "username_recently_released" || res.code === "duplicate") {
      return fail("Please correct the highlighted fields.", { code: "validation", fieldErrors: { username: res.error } });
    }
    return res;
  }

  const educationFailure = await saveEducation(supabase, data.education);
  if (educationFailure) return educationFailure;

  const classError = await upsertClassInfo(supabase, user.id, primaryEntry(data.education)?.role === "student" ? data : { currentYear: null, currentSemester: null });
  if (classError) return dbError(classError);

  revalidatePath("/", "layout");
  return ok();
}

export async function updateProfileAction(input) {
  const user = await requireUser();
  const { data, failure } = parseInput(profileSchema, input);
  if (failure) return failure;

  const limited = await enforceRateLimit("profile-write", user.id, { limit: 30, windowSec: 60 });
  if (limited) return limited;

  const supabase = await createClient();
  const { data: before } = await supabase.from("profiles").select("username").eq("id", user.id).single();
  const usernameChanged = before && before.username !== data.username;

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: data.fullName,
      ...(usernameChanged ? { username: data.username } : {}),
      headline: data.headline ?? null,
      bio: data.bio ?? null,
      skills: data.skills,
      interests: data.interests,
      github_url: data.githubUrl ?? null,
      portfolio_url: data.portfolioUrl ?? null,
      social_links: socialLinks(data),
      open_to_collaboration: data.openToCollaboration,
      preferred_roles: data.preferredRoles,
      availability: data.availability ?? null,
      open_to_mentoring: data.openToMentoring,
      mentoring_topics: data.mentoringTopics,
      industry: data.industry ?? null,
      company: data.company ?? null,
      job_title: data.jobTitle ?? null,
    })
    .eq("id", user.id);
  if (error) {
    const res = dbError(error);
    if (["invalid_username", "reserved_username", "username_cooldown", "username_recently_released", "duplicate"].includes(res.code)) {
      return fail("Please correct the highlighted fields.", { code: "validation", fieldErrors: { username: res.error } });
    }
    return res;
  }

  const educationFailure = await saveEducation(supabase, data.education);
  if (educationFailure) return educationFailure;

  const classError = await upsertClassInfo(supabase, user.id, primaryEntry(data.education)?.role === "student" ? data : { currentYear: null, currentSemester: null });
  if (classError) return dbError(classError);

  revalidatePath("/", "layout");
  return ok({ message: "Profile saved." });
}

export async function updatePrivacyAction(input) {
  const user = await requireUser();
  const { data, failure } = parseInput(privacySchema, input);
  if (failure) return failure;

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ visibility: data.visibility, allow_messages_from: data.allowMessagesFrom, show_class: data.showClass, ai_assist_enabled: data.aiAssistEnabled, personalize_feed: data.personalizeFeed })
    .eq("id", user.id);
  if (error) return dbError(error);
  revalidatePath("/", "layout");
  return ok({ message: "Privacy settings saved." });
}

const imageSchema = z.object({ kind: z.enum(["avatar", "cover"]), fileId: z.uuid().nullable() });

/** Attach an uploaded (ready, owned) image as avatar / cover, or remove it with fileId = null. */
export async function setProfileImageAction(input) {
  const user = await requireUser();
  const { data, failure } = parseInput(imageSchema, input);
  if (failure) return failure;

  const supabase = await createClient();
  const column = data.kind === "avatar" ? "avatar_key" : "cover_key";
  const { data: current } = await supabase.from("profiles").select(column).eq("id", user.id).single();
  const oldKey = current?.[column] ?? null;

  let newKey = null;
  if (data.fileId) {
    const { data: file } = await supabase
      .from("files")
      .select("storage_key, status, purpose, owner_id")
      .eq("id", data.fileId)
      .maybeSingle();
    if (!file || file.owner_id !== user.id || file.status !== "ready" || file.purpose !== data.kind) {
      return fail("That image is not available. Please upload it again.", { code: "invalid_file" });
    }
    newKey = file.storage_key;
  }

  const { error } = await supabase.from("profiles").update({ [column]: newKey }).eq("id", user.id);
  if (error) return dbError(error);

  // Best-effort cleanup of the replaced object (in whichever bucket it was stored).
  if (oldKey && oldKey !== newKey) {
    const admin = createAdminClient();
    const { data: oldFile } = await admin.from("files").select("id, bucket").eq("storage_key", oldKey).maybeSingle();
    if (oldFile) {
      await admin.from("files").update({ status: "deleted", deleted_at: new Date().toISOString() }).eq("id", oldFile.id);
      try {
        await deleteObject({ visibility: oldFile.bucket, key: oldKey });
      } catch (err) {
        console.error("[profile] could not delete replaced image:", err?.message);
      }
    }
  }

  revalidatePath("/", "layout");
  return ok({ key: newKey });
}

export async function addAchievementAction(input) {
  const user = await requireUser();
  const { data, failure } = parseInput(achievementSchema, input);
  if (failure) return failure;
  const supabase = await createClient();
  const { error } = await supabase.from("profile_achievements").insert({
    user_id: user.id,
    title: data.title,
    description: data.description ?? null,
    achieved_on: data.achievedOn ?? null,
    url: data.url ?? null,
  });
  if (error) return dbError(error);
  revalidatePath("/settings/profile");
  return ok({ message: "Achievement added." });
}

export async function deleteAchievementAction(id) {
  const user = await requireUser();
  if (!z.uuid().safeParse(id).success) return fail("Invalid request.");
  const supabase = await createClient();
  const { error } = await supabase.from("profile_achievements").delete().eq("id", id).eq("user_id", user.id);
  if (error) return dbError(error);
  revalidatePath("/settings/profile");
  return ok();
}

export async function addExperienceAction(input) {
  const user = await requireUser();
  const { data, failure } = parseInput(experienceSchema, input);
  if (failure) return failure;
  const supabase = await createClient();
  const { error } = await supabase.from("profile_experiences").insert({
    user_id: user.id,
    kind: data.kind,
    title: data.title,
    organization: data.organization,
    start_date: data.startDate ?? null,
    end_date: data.endDate ?? null,
    description: data.description ?? null,
  });
  if (error) return dbError(error);
  revalidatePath("/settings/profile");
  return ok({ message: "Experience added." });
}

export async function deleteExperienceAction(id) {
  const user = await requireUser();
  if (!z.uuid().safeParse(id).success) return fail("Invalid request.");
  const supabase = await createClient();
  const { error } = await supabase.from("profile_experiences").delete().eq("id", id).eq("user_id", user.id);
  if (error) return dbError(error);
  revalidatePath("/settings/profile");
  return ok();
}
