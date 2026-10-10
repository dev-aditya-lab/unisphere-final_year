// Fills a LOCAL database with a believable, entirely fictional RGEC community for demos and store screenshots.
//   npm run seed:demo
// Safe by design: it refuses to run unless Supabase is on localhost, every person is invented, and every demo
// account shares the password printed at the end (development only).
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!/^https?:\/\/(localhost|127\.0\.0\.1)/.test(url ?? "")) throw new Error(`Refusing to seed demo data into ${url}: it is not a local database.`);

const RGEC = "00000000-0000-4000-8000-0000000000a1";
export const DEMO_PASSWORD = "Demo-Pass-2026!";
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, secret, opts);

const PEOPLE = [
  { key: "ananya", name: "Ananya Sharma", headline: "CSE · 3rd year · building things with React and Supabase", dept: "computer-science", year: 2027, skills: ["React", "Next.js", "PostgreSQL", "UI design"], interests: ["web apps", "open source", "hackathons"], bio: "I like turning rough ideas into small tools people actually use. Currently working on a QR-based attendance system." },
  { key: "rohan", name: "Rohan Prasad", headline: "Mechanical · 4th year · CAD, robotics and drones", dept: "mechanical", year: 2026, skills: ["SolidWorks", "Arduino", "3D printing"], interests: ["robotics", "drones", "automation"], bio: "Final-year student who would rather prototype than present slides. Always looking for people who enjoy hardware." },
  { key: "priya", name: "Priya Kumari", headline: "Electrical · 2nd year · embedded systems and IoT", dept: "electrical", year: 2028, skills: ["C", "Embedded C", "ESP32", "Circuit design"], interests: ["IoT", "energy", "sensors"], bio: "Learning in public. Happy to explain what I figured out last week." },
  { key: "imran", name: "Imran Ansari", headline: "Civil · 3rd year · surveying and sustainable construction", dept: "civil", year: 2027, skills: ["AutoCAD", "Surveying", "STAAD Pro"], interests: ["green buildings", "GIS", "infrastructure"], bio: "Interested in how campuses and towns can be built better with less." },
];

const log = (...a) => console.log("•", ...a);
async function must(label, promise) {
  const { data, error } = await promise;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

// ── People ──────────────────────────────────────────────────────────────────
const depts = Object.fromEntries((await must("departments", admin.from("departments").select("id, slug").eq("college_id", RGEC))).map((d) => [d.slug, d.id]));
const users = {};
for (const p of PEOPLE) {
  const email = `demo.${p.key}@demo.unisphere.test`;
  const created = await admin.auth.admin.createUser({ email, password: DEMO_PASSWORD, email_confirm: true, user_metadata: { full_name: p.name, account_type: "student" } });
  let id = created.data?.user?.id;
  if (!id) {
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    id = data.users.find((u) => u.email === email)?.id;
    if (!id) throw created.error;
  }
  await must(`profile ${p.key}`, admin.from("profiles").update({
    college_id: RGEC, department_id: depts[p.dept] ?? null, graduation_year: p.year, headline: p.headline, bio: p.bio, skills: p.skills, interests: p.interests,
    onboarded_at: new Date().toISOString(), verification_status: "verified", verified_at: new Date().toISOString(), open_to_collaboration: true, visibility: "college",
  }).eq("id", id).select("id"));
  const client = createClient(url, publishable, opts);
  const { error } = await client.auth.signInWithPassword({ email, password: DEMO_PASSWORD });
  if (error) throw error;
  users[p.key] = { id, client, ...p };
}
log("people ready:", Object.keys(users).join(", "));

const ids = Object.values(users).map((u) => u.id).sort();
for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) await admin.from("connections").upsert({ user_a: ids[i], user_b: ids[j] }, { onConflict: "user_a,user_b", ignoreDuplicates: true });

// ── Posts, comments, reactions ──────────────────────────────────────────────
const slug = (s) => `${s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60)}-demo`;
async function post(u, p) {
  const row = { author_id: u.id, slug: slug(p.title ?? p.body), visibility: "college", ...p };
  const existing = await admin.from("posts").select("id").eq("slug", row.slug).maybeSingle();
  if (existing.data) return existing.data.id;
  return (await must("post", u.client.from("posts").insert(row).select("id").single())).id;
}
const p1 = await post(users.ananya, { category: "projects", title: "QR attendance for lab classes", body: "We lose ten minutes of every lab to roll call. I am building a QR-based attendance tool: the teacher shows a code that changes every 20 seconds, students scan it with their phone. Looking for someone to help with the admin dashboard and someone to test it in a real lab.\n\n#attendance #nextjs #campus" });
const p2 = await post(users.rohan, { category: "ideas", title: "A shared tool library for the workshop", body: "Half the tools in our department workshop are used twice a semester. What if there was a simple booking board so teams from other branches could borrow them, with a deposit and a return checklist? Anyone done something similar?\n\n#workshop #sharing" });
const p3 = await post(users.priya, { category: "questions", title: "Best way to start with ESP32 for a mini project?", body: "I have a basic idea (soil moisture alerts for the college garden) but I am not sure whether to use MicroPython or Arduino C++. What did you use and what would you do differently?\n\n#iot #esp32" });
const p4 = await post(users.imran, { category: "achievements", title: "Our survey team finished mapping the east block", body: "Three weekends, two total stations and a lot of chai. The drawings are now with the department for review. Thank you to everyone who held the staff in the sun!\n\n#surveying #teamwork" });
const reactions = [[users.rohan, p1], [users.priya, p1], [users.imran, p1], [users.ananya, p2], [users.priya, p2], [users.ananya, p3], [users.rohan, p3], [users.ananya, p4], [users.priya, p4]];
for (const [u, postId] of reactions) await u.client.from("post_reactions").upsert({ post_id: postId, user_id: u.id, reaction: "like" }, { onConflict: "post_id,user_id", ignoreDuplicates: true });
const comments = [
  [users.priya, p1, "Love this. Rotating the code is smart. How will you stop someone sending a screenshot to a friend?"],
  [users.ananya, p1, "Good question! Each code also checks the student is on the college Wi-Fi. Still testing how well that works."],
  [users.ananya, p3, "I started with Arduino C++ because the docs are everywhere. MicroPython is great once you want to change things without reflashing."],
  [users.imran, p2, "Great idea. A simple checklist at return time would solve most of the problems."],
];
for (const [u, postId, body] of comments) {
  const dupe = await admin.from("comments").select("id").eq("post_id", postId).eq("author_id", u.id).eq("body", body).maybeSingle();
  if (!dupe.data) await u.client.from("comments").insert({ post_id: postId, author_id: u.id, body });
}
log("posts, comments and reactions ready");

// ── Project, community, event, conversation ─────────────────────────────────
const pj = await admin.from("projects").select("id").eq("slug", "qr-attendance-demo").maybeSingle();
if (!pj.data) {
  const project = await must("project", users.ananya.client.from("projects").insert({
    owner_id: users.ananya.id, slug: "qr-attendance-demo", name: "QR Attendance", tagline: "Roll call in ten seconds instead of ten minutes", visibility: "college", looking_for_members: true, status: "in_progress", team_size: 4,
    problem: "Taking attendance by name wastes time in every lab and is easy to game.", solution: "A rotating QR code the teacher shows on screen. Students scan it on the college network and attendance is recorded instantly.",
    goals: ["Pilot in one lab batch", "Teacher dashboard with CSV export", "Protect against shared screenshots"], tech_stack: ["Next.js", "Supabase", "Tailwind"], required_skills: ["React", "PostgreSQL", "UI design"],
  }).select("id").single());
  await users.ananya.client.from("project_open_roles").insert([
    { project_id: project.id, title: "Frontend developer", description: "Build the teacher dashboard and the student scan screen.", skills: ["React", "Tailwind"] },
    { project_id: project.id, title: "Pilot tester", description: "A lab batch willing to try it for two weeks and give honest feedback.", skills: [] },
  ]);
}
const cm = await admin.from("communities").select("id").eq("slug", "coding-club-demo").maybeSingle();
let communityId = cm.data?.id;
if (!communityId) communityId = (await must("community", users.ananya.client.from("communities").insert({ created_by: users.ananya.id, slug: "coding-club-demo", name: "Coding Club", kind: "club", description: "Weekly build nights, peer code reviews and hackathon prep. All branches welcome.", visibility: "college", join_policy: "open" }).select("id").single())).id;
for (const u of [users.rohan, users.priya, users.imran]) await u.client.rpc("join_community", { p_community: communityId });

const ev = await admin.from("events").select("id").eq("slug", "web-dev-workshop-demo").maybeSingle();
let eventId = ev.data?.id;
if (!eventId) {
  const start = new Date(Date.now() + 5 * 86_400_000);
  start.setUTCHours(11, 30, 0, 0);
  eventId = (await must("event", users.ananya.client.from("events").insert({
    organizer_id: users.ananya.id, slug: "web-dev-workshop-demo", title: "Build your first web app in one afternoon", kind: "workshop", mode: "in_person", location: "Computer Lab 2",
    description: "A hands-on workshop for beginners: we go from an empty folder to a deployed app. Bring a laptop; no experience needed.\n\nWe will cover HTML, a little JavaScript and how to put your project online.",
    starts_at: start.toISOString(), ends_at: new Date(start.getTime() + 3 * 3_600_000).toISOString(), timezone: "Asia/Kolkata", capacity: 60, registration_mode: "in_platform", visibility: "college", community_id: communityId,
  }).select("id").single())).id;
}
for (const u of [users.rohan, users.priya, users.imran]) await u.client.rpc("rsvp_event", { p_event: eventId, p_status: "going" });

const conv = await must("conversation", users.priya.client.rpc("start_direct_conversation", { p_other: users.ananya.id }));
const convId = typeof conv === "string" ? conv : conv?.id ?? conv;
const { count } = await admin.from("messages").select("id", { count: "exact", head: true }).eq("conversation_id", convId);
if (!count) {
  const talk = [[users.priya, "Hi Ananya! Saw your QR attendance post. I could help test it in our EE lab on Thursday."], [users.ananya, "That would be amazing, thank you! I will send you the link tonight."], [users.priya, "Perfect. Should I get a few classmates to try it too?"], [users.ananya, "Yes please, the more people the better. I want to see how it behaves with 40 phones scanning at once."]];
  for (const [u, body] of talk) await u.client.from("messages").insert({ conversation_id: convId, sender_id: u.id, body });
}
log("project, community, event and a conversation ready");

console.log(`\nDemo community ready. Sign in as demo.ananya@demo.unisphere.test (or .rohan / .priya / .imran) with password: ${DEMO_PASSWORD}`);
