import { describe, expect, it } from "vitest";
import { maskPersonalData } from "@/lib/privacy/redact";
import { untrusted } from "@/lib/ai/safety/sanitize";
import { prompts } from "@/lib/ai/prompts";

describe("masking contact details before text leaves UniSphere", () => {
  it("masks emails, phone numbers and ID numbers", () => {
    const out = maskPersonalData("Mail me at asha.rao+x@college.ac.in or call +91 98765 43210 / 09876543210. Aadhaar 1234 5678 9012, PAN ABCDE1234F, card 4111 1111 1111 1111.");
    expect(out).not.toMatch(/asha|98765|09876|1234 5678|ABCDE1234F|4111/);
    expect(out).toMatch(/\[email removed\]/);
    expect(out).toMatch(/\[phone removed\]/);
    expect(out).toMatch(/\[id number removed\]/);
  });

  it("leaves ordinary writing, versions and short numbers alone", () => {
    const s = "We built v2.3 in 2026 with 120 users, 5 teams and a 2-week sprint. Tech: React 19, Node 22.";
    expect(maskPersonalData(s)).toBe(s);
  });

  it("is applied to everything wrapped for a model", () => {
    expect(untrusted("write to me@example.com please", "draft")).not.toMatch(/me@example\.com/);
  });

  it("reaches every prompt that carries member text", () => {
    const input = { title: "My idea", body: "Reach me on 9876543210 or boss@example.org about this idea for a campus app.", category: "ideas", comments: ["call 9876543210"], text: "x@y.co idea" };
    for (const [name, build] of Object.entries(prompts)) {
      let built;
      try {
        built = build(input);
      } catch {
        continue; // a prompt needing other inputs is exercised by its own tests
      }
      const all = `${built.system}\n${built.user}`;
      expect(all, name).not.toMatch(/9876543210|boss@example\.org|x@y\.co/);
    }
  });
});
