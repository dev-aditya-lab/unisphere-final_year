import { describe, expect, it } from "vitest";
import {
  GUIDELINES,
  getAccessibilitySections,
  getBrandSections,
  getContentPolicySections,
  getCookieSections,
  getCopyrightSections,
  getPrivacySections,
  getTermsSections,
} from "@/lib/content/legal";
import { CONTACT_EMAIL } from "@/lib/constants";
import { CONTACT_TOPICS } from "@/lib/content/contact-topics";
import { isProtectedPath } from "@/lib/routes";

import { getDeliverySections, getPricingSections, getRefundSections } from "@/lib/content/commerce";

const DOCS = {
  pricing: getPricingSections(),
  refund: getRefundSections(),
  delivery: getDeliverySections(),
  guidelines: GUIDELINES,
  privacy: getPrivacySections(),
  terms: getTermsSections(),
  cookies: getCookieSections(),
  content: getContentPolicySections(),
  copyright: getCopyrightSections(),
  brand: getBrandSections(),
  accessibility: getAccessibilitySections(),
};

const text = (sections) => sections.flatMap((s) => [s.heading, ...(s.body ?? []), ...(s.list ?? [])]);

describe("policy pages", () => {
  it("have no unresolved template placeholders or TODO markers", () => {
    for (const [name, sections] of Object.entries(DOCS)) {
      for (const t of text(sections)) {
        expect(t, `${name}: ${t.slice(0, 50)}`).not.toMatch(/\$\{|TODO|FIXME|lorem ipsum|undefined/i);
      }
    }
  });

  it("only link to real public pages, with a known contact topic where one is used", () => {
    const topics = new Set(CONTACT_TOPICS.map((t) => t.slug));
    for (const [name, sections] of Object.entries(DOCS)) {
      for (const t of text(sections)) {
        for (const m of t.matchAll(/\]\((\/[^)\s]*)\)/g)) {
          const url = new URL(m[1], "https://x.test");
          expect(isProtectedPath(url.pathname), `${name} links to ${m[1]}, which is members-only`).toBe(false);
          const topic = url.searchParams.get("topic");
          if (topic) expect(topics.has(topic), `${name}: unknown contact topic ${topic}`).toBe(true);
        }
      }
    }
  });

  it("give the verified contact address wherever a route to a person is described", () => {
    for (const name of ["privacy", "copyright", "content", "accessibility", "brand", "terms", "pricing", "refund", "delivery"]) {
      expect(JSON.stringify(DOCS[name]), name).toContain(CONTACT_EMAIL);
    }
  });

  it("do not name a college, a founder or an invented legal entity", () => {
    const all = JSON.stringify(Object.values(DOCS));
    expect(all).not.toMatch(/Ramgarh|RGEC|Pvt\.? Ltd|Private Limited|registered office|LinkedIn/i);
  });

  it("say truthfully that no advertising is shown", () => {
    expect(JSON.stringify(DOCS.privacy)).toMatch(/does not currently show advertising/);
    expect(JSON.stringify(DOCS.privacy)).not.toMatch(/AdSense|Monetag/);
    expect(JSON.stringify(DOCS.cookies)).not.toMatch(/AdSense|Monetag/);
  });
});
