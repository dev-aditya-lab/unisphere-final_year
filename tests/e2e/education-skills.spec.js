import { test, expect } from "@playwright/test";
import { GREENFIELD, RIVERSIDE, admin, cleanupUsers, createUser, grantRoleDirect, PASSWORD } from "../helpers/supabase.js";

/**
 * Onboarding without a "how do you describe yourself" step, several colleges with a role at each, departments members add,
 * skills beyond coding, the admin screens for them, the post button on a phone, and the shape of post pictures.
 */

async function login(page, email, expectUrl = /\/(feed|onboarding)/) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(expectUrl, { timeout: 30_000 });
}

test.describe.serial("Colleges, roles, skills and posts", () => {
  test.setTimeout(180_000);
  let tag, newcomer, member, gadmin, createdDepartmentName;

  test.beforeAll(async () => {
    tag = Math.random().toString(36).slice(2, 7);
    newcomer = await createUser("edu-new", { collegeId: null, accountType: null });
    await admin.from("profiles").update({ onboarded_at: null }).eq("id", newcomer.id);
    member = await createUser("edu-member", { collegeId: GREENFIELD });
    gadmin = await createUser("edu-gadmin", { collegeId: null });
    await grantRoleDirect(gadmin.id, "global_admin");
    createdDepartmentName = `Marine Biology ${tag}`;
  });
  test.afterAll(async () => {
    await admin.from("departments").delete().eq("name", createdDepartmentName);
    await cleanupUsers();
  });

  test("onboarding has no role question, takes several colleges with a role each, and offers skills beyond coding", async ({ browser }) => {
    const page = await (await browser.newContext()).newPage();
    await login(page, newcomer.email, /\/onboarding/);
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("How would you describe yourself")).toHaveCount(0);
    await expect(page.getByRole("radio", { name: "Prefer not to say" })).toHaveCount(0);
    await page.getByRole("button", { name: "Continue" }).click();

    // colleges: the first as a student, with a department the member adds
    await expect(page.getByRole("heading", { name: "Your schools and colleges" })).toBeVisible();
    await page.getByRole("button", { name: "Add a school or college" }).click();
    await page.getByRole("combobox", { name: /School or college/ }).fill("Greenfield");
    await page.getByRole("option", { name: /Greenfield Institute/ }).click();
    await page.getByRole("radiogroup", { name: /Your role at Greenfield/ }).getByRole("radio", { name: "Student" }).click();
    await page.getByRole("button", { name: "Department not listed? Add it" }).click();
    await page.getByLabel("Department not listed? Add it").fill(createdDepartmentName);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByRole("combobox", { name: "Department" })).toContainText(createdDepartmentName, { timeout: 20_000 });

    // and a second one as an alumnus
    await page.getByRole("button", { name: "Add another school or college" }).click();
    await page.getByRole("combobox", { name: /School or college/ }).fill("Riverside");
    await page.getByRole("option", { name: /Riverside University/ }).click();
    await page.getByRole("radiogroup", { name: /Your role at Riverside/ }).getByRole("radio", { name: "Alumni" }).click();
    await page.getByRole("button", { name: "Continue" }).click();

    // skills: categories beyond technology are there
    await expect(page.getByRole("heading", { name: /good at and curious about/ })).toBeVisible();
    const skillCategories = page.getByRole("group", { name: "Skills categories" });
    for (const c of ["Design & Creative", "Business & Management", "Health & Wellbeing", "Languages", "Sports & Games"]) {
      await expect(skillCategories.getByRole("button", { name: c })).toBeVisible({ timeout: 15_000 });
    }
    await skillCategories.getByRole("button", { name: "Design & Creative" }).click();
    await page.getByRole("button", { name: "+ Graphic Design" }).click();
    await page.getByLabel("Skills", { exact: true }).fill("Photo");
    await page.getByRole("button", { name: "+ Photography" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: /Enter UniSphere/ }).click();
    await expect(page).toHaveURL(/\/feed/, { timeout: 30_000 });

    const { data: rows } = await admin.from("profile_education").select("college_id, role, is_primary, department_id").eq("user_id", newcomer.id).order("position");
    expect(rows.map((r) => [r.college_id, r.role, r.is_primary])).toEqual([[GREENFIELD, "student", true], [RIVERSIDE, "alumni", false]]);
    const { data: dept } = await admin.from("departments").select("id, is_community, created_by").eq("name", createdDepartmentName).single();
    expect(dept).toMatchObject({ is_community: true, created_by: newcomer.id });
    expect(rows[0].department_id).toBe(dept.id);
    const { data: profile } = await admin.from("profiles").select("college_id, account_type, skills").eq("id", newcomer.id).single();
    expect(profile).toMatchObject({ college_id: GREENFIELD, account_type: "student" });
    expect(profile.skills).toEqual(expect.arrayContaining(["Graphic Design", "Photography"]));

    // the profile page lists both, with the role at each
    await page.goto(`/u/${newcomer.username}`);
    const colleges = page.getByRole("list", { name: "Schools and colleges" });
    await expect(colleges).toContainText("Greenfield Institute");
    await expect(colleges).toContainText("Student");
    await expect(colleges).toContainText("Riverside University");
    await expect(colleges).toContainText("Alumni");
  });

  test("a member can change the list in settings, and there is no verification page any more", async ({ browser }) => {
    const page = await (await browser.newContext()).newPage();
    await login(page, newcomer.email, /\/feed/);
    await page.goto("/settings/profile");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Schools & colleges" })).toBeVisible();
    await expect(page.getByText("How you describe yourself")).toHaveCount(0);
    await page.getByRole("button", { name: "Remove Riverside University (demo)", exact: true }).click();
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByText("Profile saved.")).toBeVisible({ timeout: 20_000 });
    expect((await admin.from("profile_education").select("id").eq("user_id", newcomer.id)).data).toHaveLength(1);

    const gone = await page.goto("/settings/verification");
    expect(gone.status()).toBe(404);
  });

  test("the admin sees skills, departments and courses, and no student-ID or verification screens", async ({ browser }) => {
    const page = await (await browser.newContext()).newPage();
    await login(page, gadmin.email, /\/feed/);
    await page.goto("/admin/skills");
    await expect(page.getByRole("heading", { name: "Skills & interests", level: 1 })).toBeVisible();
    await page.goto("/admin/skills?q=Graphic");
    await expect(page.getByRole("cell", { name: "Graphic Design", exact: true })).toBeVisible();
    await page.goto("/admin/skills");
    const nav = page.getByRole("navigation", { name: /Admin/ });
    await expect(nav.getByRole("link", { name: "Skills & interests" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Departments & courses" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Student IDs" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Verification" })).toHaveCount(0);

    // add one with the form
    await page.getByRole("button", { name: "Add a skill" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill(`Beekeeping ${tag}`);
    await dialog.getByLabel("Category").fill("Hands-on & Trades");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Added.")).toBeVisible({ timeout: 15_000 });
    expect((await admin.from("skill_catalog").select("id").eq("name", `Beekeeping ${tag}`)).data).toHaveLength(1);
    await admin.from("skill_catalog").delete().eq("name", `Beekeeping ${tag}`);

    // the department the newcomer added is listed as member-added
    await page.goto(`/admin/academics?q=${encodeURIComponent(createdDepartmentName)}`);
    await expect(page.getByRole("heading", { name: "Departments & courses", level: 1 })).toBeVisible();
    await expect(page.getByRole("row", { name: new RegExp(createdDepartmentName) })).toContainText(`@${newcomer.username}`);

    expect((await page.goto("/admin/roster")).status()).toBe(404);
    expect((await page.goto("/admin/verification")).status()).toBe(404);
  });

  test("on a phone the + button opens the post editor, from the feed and from other pages", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await login(page, member.email, /\/feed/);
    await page.waitForLoadState("networkidle");

    await page.getByRole("link", { name: "Write a post" }).click();
    await expect(page.getByRole("dialog", { name: "Create post" })).toBeVisible();
    await expect(page.getByLabel("Post text")).toBeFocused();
    await page.getByRole("button", { name: "Close editor" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // again, on the same page: the address does not change, so this is not a hash navigation
    await page.getByRole("link", { name: "Write a post" }).click();
    await expect(page.getByRole("dialog", { name: "Create post" })).toBeVisible();
    await page.getByRole("button", { name: "Close editor" }).click();

    // from another page it goes to the feed and opens there
    await page.goto("/explore");
    await page.waitForLoadState("networkidle");
    await page.getByRole("link", { name: "Write a post" }).click();
    await expect(page).toHaveURL(/\/feed/);
    await expect(page.getByRole("dialog", { name: "Create post" })).toBeVisible({ timeout: 15_000 });
    await context.close();
  });

  test("a post picture is framed by its own shape, and tapping it shows the whole picture", async ({ browser }) => {
    const cases = [
      { w: 1920, h: 1080, ratio: "1.7777" },
      { w: 3000, h: 2000, ratio: "1.5" },
      { w: 4000, h: 3000, ratio: "1.3333" },
      { w: 1000, h: 1000, ratio: "1" },
      { w: 3000, h: 4000, ratio: "0.75" },
    ];
    const ids = [];
    for (const [i, c] of cases.entries()) {
      const { data: file } = await admin
        .from("files")
        .insert({ owner_id: member.id, bucket: "private", storage_key: `post_attachment/${member.id}/${tag}-${i}.jpg`, purpose: "post_attachment", mime_type: "image/jpeg", size_bytes: 1000, width: c.w, height: c.h, status: "ready" })
        .select("id")
        .single();
      const { data: post } = await admin.from("posts").insert({ author_id: member.id, slug: `shape-${tag}-${i}`, body: `Shape test ${c.w} by ${c.h} ${tag}`, visibility: "public", status: "published" }).select("id").single();
      await admin.from("post_attachments").insert({ post_id: post.id, file_id: file.id, position: 0 });
      ids.push(post.id);
    }
    try {
      const page = await (await browser.newContext({ viewport: { width: 1100, height: 900 } })).newPage();
      await login(page, member.email, /\/feed/);
      await page.goto(`/u/${member.username}`);
      await page.waitForLoadState("networkidle");
      for (const c of cases) {
        const card = page.getByRole("article").filter({ hasText: `Shape test ${c.w} by ${c.h} ${tag}` });
        const frame = card.locator("ul", { has: page.getByRole("button", { name: /View image 1 of 1 full size/ }) });
        const ratio = await frame.evaluate((el) => getComputedStyle(el).aspectRatio);
        expect(Number(ratio.split("/")[0]), `${c.w}x${c.h}`).toBeCloseTo(Number(c.ratio), 2);
      }
      const first = page.getByRole("article").filter({ hasText: `Shape test 1920 by 1080 ${tag}` });
      await first.getByRole("button", { name: /View image 1 of 1 full size/ }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page.getByRole("button", { name: "Close image viewer" })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
    } finally {
      await admin.from("posts").delete().in("id", ids);
      await admin.from("files").delete().like("storage_key", `%${tag}-%`);
    }
  });

  test("Messages shows its frame straight away", async ({ browser }) => {
    const page = await (await browser.newContext({ viewport: { width: 1100, height: 900 } })).newPage();
    await login(page, member.email, /\/feed/);
    await page.waitForLoadState("networkidle");
    const started = Date.now();
    await page.getByRole("link", { name: "Messages" }).first().click();
    await expect(page.getByRole("heading", { name: "Messages", level: 1 })).toBeVisible({ timeout: 5_000 });
    expect(Date.now() - started).toBeLessThan(3_000);
  });
});
