import { describe, expect, it } from "vitest";
import { UPLOAD_PURPOSES, detectMime, sanitizeFilename } from "@/lib/storage/policy";

const pad = (bytes) => Buffer.concat([Buffer.from(bytes), Buffer.alloc(32)]);

describe("detectMime", () => {
  it("recognises real image and PDF signatures", () => {
    expect(detectMime(pad([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(detectMime(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(detectMime(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBPVP8 "), Buffer.alloc(8)]))).toBe("image/webp");
    expect(detectMime(Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(16)]))).toBe("application/pdf");
  });
  it("rejects scripts and SVG disguised as images", () => {
    expect(detectMime(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"))).toBeNull();
    expect(detectMime(Buffer.from("<?php echo 1; ?>                    "))).toBeNull();
    expect(detectMime(Buffer.from("GIF89a" + "x".repeat(30)))).toBeNull();
    expect(detectMime(Buffer.alloc(4))).toBeNull();
  });
});

describe("upload purposes", () => {
  it("never allow SVG or HTML and keep sensitive purposes private", () => {
    for (const rule of Object.values(UPLOAD_PURPOSES)) {
      expect(rule.mimes.some((m) => m.includes("svg") || m.includes("html"))).toBe(false);
    }
    expect(UPLOAD_PURPOSES.verification_document.bucket).toBe("private");
    expect(UPLOAD_PURPOSES.message_attachment.bucket).toBe("private");
    expect(UPLOAD_PURPOSES.post_attachment.bucket).toBe("private");
  });
});

describe("sanitizeFilename", () => {
  it("removes path components and unsafe characters", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("C:\\Users\\me\\résumé<1>.pdf")).toBe("r_sum_1_.pdf");
    expect(sanitizeFilename("a..b")).toBe("a.b");
  });
});
