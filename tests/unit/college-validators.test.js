import { describe, expect, it } from "vitest";
import { createCollegeSchema, reportCollegeSchema, searchCollegesSchema } from "@/lib/validators/college";

describe("createCollegeSchema", () => {
  it("needs only a name", () => {
    const parsed = createCollegeSchema.parse({ name: "  Ramgarh Engineering College  " });
    expect(parsed).toMatchObject({ name: "Ramgarh Engineering College", force: false });
    expect(parsed.city).toBeUndefined();
  });
  it("turns empty optional fields into nothing", () => {
    const parsed = createCollegeSchema.parse({ name: "St. Xavier's College", city: "", state: " ", country: "", website: "" });
    expect(parsed.city).toBeUndefined();
    expect(parsed.website).toBeUndefined();
  });
  it.each(["ab", "visit www.example.com", "<b>College</b>", "mail@college.edu", "12345 67", "x".repeat(161)])("rejects the name %j", (name) => {
    expect(createCollegeSchema.safeParse({ name }).success).toBe(false);
  });
  it("accepts names in other scripts", () => {
    expect(createCollegeSchema.safeParse({ name: "रामगढ़ इंजीनियरिंग कॉलेज" }).success).toBe(true);
  });
  it("accepts only http(s) websites", () => {
    expect(createCollegeSchema.safeParse({ name: "Some College", website: "https://college.example" }).success).toBe(true);
    expect(createCollegeSchema.safeParse({ name: "Some College", website: "javascript:alert(1)" }).success).toBe(false);
  });
});

describe("searchCollegesSchema", () => {
  it("needs two characters and caps the page size", () => {
    expect(searchCollegesSchema.safeParse({ q: "r" }).success).toBe(false);
    expect(searchCollegesSchema.parse({ q: "ra", limit: "5" }).limit).toBe(5);
    expect(searchCollegesSchema.safeParse({ q: "ra", limit: "500" }).success).toBe(false);
  });
});

describe("reportCollegeSchema", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  const other = "00000000-0000-4000-8000-000000000002";
  it("requires a target for duplicates and a field and value for corrections", () => {
    expect(reportCollegeSchema.safeParse({ collegeId: id, kind: "duplicate" }).success).toBe(false);
    expect(reportCollegeSchema.safeParse({ collegeId: id, kind: "duplicate", duplicateOf: id }).success).toBe(false);
    expect(reportCollegeSchema.safeParse({ collegeId: id, kind: "duplicate", duplicateOf: other }).success).toBe(true);
    expect(reportCollegeSchema.safeParse({ collegeId: id, kind: "correction", field: "city" }).success).toBe(false);
    expect(reportCollegeSchema.safeParse({ collegeId: id, kind: "correction", field: "city", proposed: "Ranchi" }).success).toBe(true);
    expect(reportCollegeSchema.safeParse({ collegeId: id, kind: "abuse" }).success).toBe(true);
  });
});
