import { describe, expect, it } from "vitest";
import { normalizeStudentId, studentIdHint } from "@/lib/student-id";

describe("student ID normalisation", () => {
  it("treats case, spaces, dashes and slashes as irrelevant", () => {
    expect(normalizeStudentId("21-cse/045")).toBe("21CSE045");
    expect(normalizeStudentId(" 21 CSE 045 ")).toBe("21CSE045");
    expect(normalizeStudentId("21CSE045")).toBe("21CSE045");
  });
  it("rejects values that cannot be a student ID", () => {
    expect(normalizeStudentId("")).toBeNull();
    expect(normalizeStudentId("12")).toBeNull();
    expect(normalizeStudentId("---")).toBeNull();
    expect(normalizeStudentId("A".repeat(25))).toBeNull();
    expect(normalizeStudentId(null)).toBeNull();
  });
  it("keeps only the last three characters as a hint", () => {
    expect(studentIdHint("21CSE045")).toBe("••045");
  });
});
