"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { requireProfile } from "@/lib/auth/session";
import { fail, parseInput } from "@/lib/actions/result";
import * as projects from "@/lib/services/projects";
import { enqueueAndProcess } from "@/lib/ai/embeddings/jobs";
import { inviteSchema, joinRequestSchema, mentorshipSchema, projectSchema, roleDraftSchema } from "@/lib/validators/project";

const id = z.uuid();
const bad = () => fail("Invalid request.");

function refreshProject() {
  revalidatePath("/projects");
  revalidatePath("/projects/[projectSlug]", "page");
}

export async function createProjectAction(input) {
  const { user } = await requireProfile();
  const { data, failure } = parseInput(projectSchema, input);
  if (failure) return failure;
  const res = await projects.createProject({ user, input: data });
  if (res.ok) {
    after(() => enqueueAndProcess("project", res.id));
    revalidatePath("/projects");
  }
  return res;
}

export async function updateProjectAction({ projectId, input }) {
  await requireProfile();
  if (!id.safeParse(projectId).success) return bad();
  const { data, failure } = parseInput(projectSchema.omit({ openRoles: true }), input);
  if (failure) return failure;
  const res = await projects.updateProject({ projectId, input: data });
  if (res.ok) {
    after(() => enqueueAndProcess("project", projectId));
    refreshProject();
  }
  return res;
}

export async function addRoleAction({ projectId, role }) {
  await requireProfile();
  if (!id.safeParse(projectId).success) return bad();
  const { data, failure } = parseInput(roleDraftSchema, role);
  if (failure) return failure;
  const res = await projects.addOpenRole({ projectId, role: data });
  if (res.ok) refreshProject();
  return res;
}

export async function setRoleOpenAction({ roleId, isOpen }) {
  await requireProfile();
  if (!id.safeParse(roleId).success) return bad();
  const res = await projects.setRoleOpen({ roleId, isOpen: Boolean(isOpen) });
  if (res.ok) refreshProject();
  return res;
}

export async function deleteRoleAction(roleId) {
  await requireProfile();
  if (!id.safeParse(roleId).success) return bad();
  const res = await projects.deleteRole({ roleId });
  if (res.ok) refreshProject();
  return res;
}

export async function requestToJoinAction(input) {
  const { user } = await requireProfile();
  const { data, failure } = parseInput(joinRequestSchema, input);
  if (failure) return failure;
  const res = await projects.requestToJoin({ user, ...data });
  if (res.ok) refreshProject();
  return res;
}

export async function respondToJoinRequestAction({ requestId, accept }) {
  await requireProfile();
  if (!id.safeParse(requestId).success) return bad();
  const res = await projects.respondToJoinRequest({ requestId, accept: Boolean(accept) });
  if (res.ok) refreshProject();
  return res;
}

export async function withdrawJoinRequestAction(requestId) {
  await requireProfile();
  if (!id.safeParse(requestId).success) return bad();
  const res = await projects.withdrawJoinRequest({ requestId });
  if (res.ok) refreshProject();
  return res;
}

export async function inviteToProjectAction(input) {
  const { user } = await requireProfile();
  const { data, failure } = parseInput(inviteSchema, input);
  if (failure) return failure;
  const res = await projects.inviteToProject({ user, ...data });
  if (res.ok) refreshProject();
  return res;
}

export async function respondToInvitationAction({ invitationId, accept }) {
  await requireProfile();
  if (!id.safeParse(invitationId).success) return bad();
  const res = await projects.respondToInvitation({ invitationId, accept: Boolean(accept) });
  if (res.ok) refreshProject();
  return res;
}

export async function revokeInvitationAction(invitationId) {
  await requireProfile();
  if (!id.safeParse(invitationId).success) return bad();
  const res = await projects.revokeInvitation({ invitationId });
  if (res.ok) refreshProject();
  return res;
}

export async function removeMemberAction({ projectId, userId }) {
  await requireProfile();
  if (!id.safeParse(projectId).success || !id.safeParse(userId).success) return bad();
  const res = await projects.removeProjectMember({ projectId, userId });
  if (res.ok) refreshProject();
  return res;
}

export async function setMemberRoleAction({ projectId, userId, role }) {
  await requireProfile();
  if (!id.safeParse(projectId).success || !id.safeParse(userId).success) return bad();
  const res = await projects.setMemberRole({ projectId, userId, role });
  if (res.ok) refreshProject();
  return res;
}

export async function deleteProjectAction(projectId) {
  await requireProfile();
  if (!id.safeParse(projectId).success) return bad();
  const res = await projects.deleteProject({ projectId });
  if (res.ok) {
    after(() => enqueueAndProcess("project", projectId));
    refreshProject();
  }
  return res;
}

export async function teammateSuggestionsAction({ projectId, project }) {
  const { user } = await requireProfile();
  if (!id.safeParse(projectId).success) return bad();
  return projects.getTeammateSuggestions({ user, projectId, project });
}

export async function requestMentorshipAction(input) {
  const { user } = await requireProfile();
  const { data, failure } = parseInput(mentorshipSchema, input);
  if (failure) return failure;
  const res = await projects.requestMentorship({ user, ...data });
  if (res.ok) revalidatePath("/alumni");
  return res;
}

export async function respondToMentorshipAction({ requestId, accept, message }) {
  await requireProfile();
  if (!id.safeParse(requestId).success) return bad();
  const res = await projects.respondToMentorship({ requestId, accept: Boolean(accept), message: typeof message === "string" ? message.slice(0, 500) : undefined });
  if (res.ok) revalidatePath("/alumni");
  return res;
}

export async function cancelMentorshipAction(requestId) {
  await requireProfile();
  if (!id.safeParse(requestId).success) return bad();
  const res = await projects.cancelMentorship({ requestId });
  if (res.ok) revalidatePath("/alumni");
  return res;
}
