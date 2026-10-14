import { describe, expect, it } from "vitest";
import { registerSchema, passwordSchema, usernameSchema, resetPasswordSchema } from "@/lib/validators/auth";
import { profileSchema, tagList, privacySchema } from "@/lib/validators/profile";

const validRegistration = {
  fullName: "Asha Kumar",
  username: "asha-k",
  email: "ASHA@Example.com",
  password: "Passw0rd!",
  acceptTerms: true,
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
    accountType: "student",
    skills: [],
    interests: [],
    openToCollaboration: false,
    preferredRoles: [],
    openToMentoring: false,
    mentoringTopics: [],
    graduationYear: "",
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

describe("optional role and college on a profile", () => {
  const base = {
    fullName: "Asha Kumar", username: "asha-k", headline: "", bio: "", graduationYear: "", currentYear: "", currentSemester: "",
    skills: [], interests: [], githubUrl: "", portfolioUrl: "", linkedinUrl: "", twitterUrl: "",
    openToCollaboration: false, preferredRoles: [], availability: "", openToMentoring: false, mentoringTopics: [],
    industry: "", company: "", jobTitle: "",
  };
  it("accepts no role and no college", () => {
    const parsed = profileSchema.parse({ ...base, accountType: null, collegeId: null });
    expect(parsed.accountType).toBeNull();
    expect(parsed.collegeId).toBeNull();
  });
  it("treats an empty role as not stated, and still rejects an unknown one", () => {
    expect(profileSchema.parse({ ...base, accountType: "" }).accountType).toBeNull();
    expect(profileSchema.safeParse({ ...base, accountType: "administrator" }).success).toBe(false);
  });
  it("only accepts a real college id", () => {
    expect(profileSchema.safeParse({ ...base, collegeId: "not-a-uuid" }).success).toBe(false);
  });
});
