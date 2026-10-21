import { describe, expect, it } from "vitest";
import { registerSchema, passwordSchema, usernameSchema, resetPasswordSchema } from "@/lib/validators/auth";
import { profileSchema, tagList, privacySchema } from "@/lib/validators/profile";

const validRegistration = {
  fullName: "Asha Kumar",
  username: "asha-k",
  email: "ASHA@Example.com",
  password: "Passw0rd!",
  acceptTerms: true,
  acceptPrivacy: true,
  confirmAdult: true,
};

describe("registerSchema", () => {
  it("normalises email and username", () => {
    const parsed = registerSchema.parse({ ...validRegistration, username: " Asha-K " });
    expect(parsed.email).toBe("asha@example.com");
    expect(parsed.username).toBe("asha-k");
  });
  it("requires accepting the terms", () => {
    expect(registerSchema.safeParse({ ...validRegistration, acceptTerms: false }).success).toBe(false);
  });
  it("needs the privacy statement and the adult declaration as separate, explicit ticks", () => {
    // Accepting the Terms is not privacy consent, and neither stands in for the age declaration.
    expect(registerSchema.safeParse({ ...validRegistration, acceptPrivacy: false }).success).toBe(false);
    expect(registerSchema.safeParse({ ...validRegistration, confirmAdult: false }).success).toBe(false);
    const { acceptPrivacy, ...withoutPrivacy } = validRegistration;
    expect(acceptPrivacy).toBe(true);
    expect(registerSchema.safeParse(withoutPrivacy).success).toBe(false);
  });
  it("accepts no optional consent at signup: AI and the like are chosen later, in Settings", () => {
    const parsed = registerSchema.parse({ ...validRegistration, aiAssist: true, ai_discovery_index: true, marketing: true });
    expect(Object.keys(parsed).sort()).toEqual(["acceptPrivacy", "acceptTerms", "confirmAdult", "email", "fullName", "password", "username"]);
  });
  it("asks for no role, college or ID: only name, username, email and password", () => {
    expect(registerSchema.safeParse(validRegistration).success).toBe(true);
    // a smuggled role is dropped, never trusted
    const parsed = registerSchema.parse({ ...validRegistration, accountType: "global_admin", collegeId: "x" });
    expect(parsed).not.toHaveProperty("accountType");
    expect(parsed).not.toHaveProperty("collegeId");
  });
});

describe("passwordSchema", () => {
  it.each(["short1A", "alllowercase1", "ALLUPPERCASE1", "NoDigitsHere"])("rejects %s", (p) => {
    expect(passwordSchema.safeParse(p).success).toBe(false);
  });
  it("accepts a compliant password", () => expect(passwordSchema.safeParse("Passw0rdOK").success).toBe(true));
});

describe("usernameSchema", () => {
  it.each(["admin", "feed", "ab", "has space", "x".repeat(31), "-start", "end-", "dou--ble"])("rejects %j", (u) => {
    expect(usernameSchema.safeParse(u).success).toBe(false);
  });
  it("accepts valid names", () => {
    expect(usernameSchema.safeParse("aditya_gupta").success).toBe(true);
    expect(usernameSchema.safeParse("aditya-gupta").success).toBe(true);
  });
});

describe("resetPasswordSchema", () => {
  it("requires matching confirmation", () => {
    expect(resetPasswordSchema.safeParse({ password: "Passw0rdOK", confirmPassword: "Different1A" }).success).toBe(false);
  });
});

describe("tagList", () => {
  it("de-duplicates case-insensitively and trims", () => {
    expect(tagList().parse([" Python ", "python", "React"])).toEqual(["Python", "React"]);
  });
  it("enforces the maximum number of items", () => {
    expect(tagList(2).safeParse(["a", "b", "c"]).success).toBe(false);
  });
});

describe("profileSchema URL handling", () => {
  const base = {
    fullName: "Asha K",
    username: "asha-k",
    education: [],
    skills: [],
    interests: [],
    openToCollaboration: false,
    preferredRoles: [],
    openToMentoring: false,
    mentoringTopics: [],
    currentYear: "",
    currentSemester: "",
  };
  it("accepts https URLs and turns blanks into null", () => {
    const out = profileSchema.parse({ ...base, githubUrl: "https://github.com/asha", portfolioUrl: "" });
    expect(out.githubUrl).toBe("https://github.com/asha");
    expect(out.portfolioUrl).toBeNull();
  });
  it.each(["javascript:alert(1)", "ftp://x.test", "not a url", "data:text/html,hi"])("rejects %s", (url) => {
    expect(profileSchema.safeParse({ ...base, githubUrl: url }).success).toBe(false);
  });
});

describe("privacySchema", () => {
  it("only allows known visibility values", () => {
    expect(privacySchema.safeParse({ visibility: "everyone-on-earth", allowMessagesFrom: "nobody", showClass: false }).success).toBe(false);
  });
});

describe("schools and colleges on a profile", () => {
  const base = {
    fullName: "Asha Kumar", username: "asha-k", headline: "", bio: "", currentYear: "", currentSemester: "",
    skills: [], interests: [], githubUrl: "", portfolioUrl: "", linkedinUrl: "", twitterUrl: "",
    openToCollaboration: false, preferredRoles: [], availability: "", openToMentoring: false, mentoringTopics: [],
    industry: "", company: "", jobTitle: "",
  };
  const GF = "00000000-0000-4000-8000-000000000001";
  const RV = "00000000-0000-4000-8000-000000000002";
  it("accepts no college at all", () => {
    expect(profileSchema.parse({ ...base, education: [] }).education).toEqual([]);
  });
  it("no longer takes a role or a college outside the list", () => {
    const parsed = profileSchema.parse({ ...base, education: [], accountType: "student", collegeId: GF });
    expect(parsed).not.toHaveProperty("accountType");
    expect(parsed).not.toHaveProperty("collegeId");
  });
  it("takes several colleges, each with a role, and turns blank years into null", () => {
    const out = profileSchema.parse({
      ...base,
      education: [
        { collegeId: GF, role: "student", startYear: "2023", endYear: "2027", isPrimary: true },
        { collegeId: RV, role: "alumni", startYear: "", endYear: "" },
      ],
    });
    expect(out.education).toHaveLength(2);
    expect(out.education[0]).toMatchObject({ startYear: 2023, endYear: 2027, isPrimary: true });
    expect(out.education[1]).toMatchObject({ startYear: null, endYear: null, isPrimary: false });
  });
  it("needs a real college and one of the four roles for every entry", () => {
    expect(profileSchema.safeParse({ ...base, education: [{ collegeId: "not-a-uuid", role: "student" }] }).success).toBe(false);
    expect(profileSchema.safeParse({ ...base, education: [{ collegeId: GF, role: "administrator" }] }).success).toBe(false);
    expect(profileSchema.safeParse({ ...base, education: [{ collegeId: GF }] }).success).toBe(false);
  });
  it("allows the same college with another role, but not the same role twice", () => {
    const entry = (role) => ({ collegeId: GF, role, startYear: "", endYear: "" });
    expect(profileSchema.safeParse({ ...base, education: [entry("student"), entry("alumni")] }).success).toBe(true);
    expect(profileSchema.safeParse({ ...base, education: [entry("student"), entry("student")] }).success).toBe(false);
  });
  it("rejects years that are out of range or backwards, and more than eight entries", () => {
    const one = (extra) => profileSchema.safeParse({ ...base, education: [{ collegeId: GF, role: "student", ...extra }] }).success;
    expect(one({ startYear: "1800" })).toBe(false);
    expect(one({ startYear: "2025", endYear: "2020" })).toBe(false);
    expect(one({ startYear: "2020", endYear: "2025" })).toBe(true);
    const nine = Array.from({ length: 9 }, (_, i) => ({ collegeId: GF, role: "student", startYear: String(2000 + i) }));
    expect(profileSchema.safeParse({ ...base, education: nine }).success).toBe(false);
  });
});
