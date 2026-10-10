import "server-only";
import { getMyPermissions } from "@/lib/auth/session";
import { listColleges } from "@/lib/services/admin";

/**
 * Which college(s) the member may see numbers for. Platform-wide staff may pick any college or look at
 * everything; college-scoped staff are pinned to their own college(s). The database enforces the same rule.
 */
export async function getScope(permission, requestedCollege) {
  const perms = (await getMyPermissions()).filter((p) => p.permission === permission);
  if (perms.length === 0) return null;
  const colleges = await listColleges();
  if (perms.some((p) => p.college_id === null)) {
    const college = colleges.some((c) => c.id === requestedCollege) ? requestedCollege : null;
    return { global: true, college, options: colleges.map((c) => ({ id: c.id, name: c.name })) };
  }
  const allowed = [...new Set(perms.map((p) => p.college_id))];
  const college = allowed.includes(requestedCollege) ? requestedCollege : allowed[0];
  return { global: false, college, options: colleges.filter((c) => allowed.includes(c.id)).map((c) => ({ id: c.id, name: c.name })) };
}
