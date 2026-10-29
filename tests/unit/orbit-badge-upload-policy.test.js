import { describe, expect, it } from "vitest";
import { MIME_EXTENSION, UPLOAD_PURPOSES, detectMime } from "@/lib/storage/policy";

describe("badge picture upload policy", () => {
  it("is a public-bucket image purpose that only staff who manage Orbits may use", () => {
    const rule = UPLOAD_PURPOSES.orbit_badge;
    expect(rule).toMatchObject({ bucket: "public", permission: "orbits.manage" });
    expect(rule.mimes).toEqual(["image/jpeg", "image/png", "image/webp"]);
    // every other purpose stays open to its own owner: only staff purposes carry a permission (the badge, and the Academy's cover,
    // resource and certificate-template files, each tied to its own permission)
    const staffOnly = Object.fromEntries(Object.entries(UPLOAD_PURPOSES).filter(([, r]) => r.permission).map(([k, r]) => [k, r.permission]));
    expect(staffOnly).toEqual({ orbit_badge: "orbits.manage", academy_cover: "academy.courses.manage", academy_resource: "academy.courses.manage", academy_template: "academy.templates.manage" });
    expect(UPLOAD_PURPOSES.academy_submission.permission).toBeUndefined(); // a student's own assignment file
  });

  it("decides the type from the file's bytes, so a renamed file cannot pass", () => {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
    expect(detectMime(png)).toBe("image/png");
    expect(MIME_EXTENSION[detectMime(png)]).toBe("png");
    expect(detectMime(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>"))).toBeNull(); // an SVG could carry script
    expect(detectMime(Buffer.from("%PDF-1.7 not a picture at all"))).toBe("application/pdf"); // a PDF is not in this purpose's list
    expect(UPLOAD_PURPOSES.orbit_badge.mimes).not.toContain("application/pdf");
  });
});
