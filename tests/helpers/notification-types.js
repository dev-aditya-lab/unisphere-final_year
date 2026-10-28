import fs from "node:fs";
import path from "node:path";

/**
 * Every notification type the application can create, found by reading the code itself, so a new feature that notifies cannot be added
 * without the tests noticing it needs a category, a text and a channel (docs/NOTIFICATIONS.md).
 *  - SQL:  notify(<user>, '<type>', …) in the migrations;
 *  - JS:   p_type: "<type>" passed to the notify function from the server, and rows written straight into `notifications`.
 */
const ROOT = path.resolve(import.meta.dirname, "../..");

function* files(dir, ext) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".next", "tests", "android"].includes(entry.name) || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* files(full, ext);
    else if (entry.name.endsWith(ext)) yield full;
  }
}

// Written straight into `notifications` by a statement that does not go through notify() (it has no sender and no block list to apply).
const WRITTEN_DIRECTLY = ["referral_campaign", "moderation_privacy_incident"];

export function emittedNotificationTypes() {
  const found = new Map(); // type -> where it was found
  const add = (type, where) => found.set(type, [...(found.get(type) ?? []), where]);

  for (const file of files(path.join(ROOT, "supabase/migrations"), ".sql")) {
    const sql = fs.readFileSync(file, "utf8");
    for (const m of sql.matchAll(/\bnotify\(\s*(?:[^,()]|\([^()]*\))+,\s*'([a-z_]+)'/g)) add(m[1], path.basename(file));
  }
  for (const file of [...files(path.join(ROOT, "lib"), ".js"), ...files(path.join(ROOT, "app"), ".js")]) {
    const js = fs.readFileSync(file, "utf8");
    if (!js.includes("notif")) continue;
    for (const m of js.matchAll(/p_type:\s*"([a-z_]+)"/g)) if (m[1] !== "embed") add(m[1], path.relative(ROOT, file));
  }
  for (const type of WRITTEN_DIRECTLY) add(type, "written directly");
  return found;
}
