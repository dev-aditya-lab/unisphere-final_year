import { publicEnv } from "@/lib/env-public";
import { APP_DESCRIPTION, CONTACT_EMAIL } from "@/lib/constants";

export const revalidate = 3600;

/** A plain-text summary for AI assistants and crawlers (llms.txt convention): what this site is and where the facts are. */
export function GET() {
  const base = publicEnv.appUrl;
  const body = `# UniSphere

> ${APP_DESCRIPTION}

UniSphere is an independent campus network for every college community, open to anyone who wants to join. Students, alumni, teachers and clubs share projects, find teammates and learn from each other. It is not an official service of any college.

Anyone can create an account, but nothing inside is public. There is no public feed, no public profiles and nothing to index: posts, profiles, projects, events, messages and the college directory are visible to signed-in members only.

## What is public
- [Home](${base}/): what UniSphere is
- [About](${base}/about): what it is for and how it is run
- [Features](${base}/features): what members can do
- [FAQ](${base}/faq): short answers
- [Community guidelines](${base}/guidelines) and [Content policy](${base}/content-policy)
- [Privacy policy](${base}/privacy), [Terms of service](${base}/terms) and [Cookies and privacy preferences](${base}/cookies)
- [Copyright policy](${base}/copyright-policy), [Brand policy](${base}/brand-policy) and [Accessibility](${base}/accessibility)
- [Pricing](${base}/pricing), [Refund and cancellation](${base}/refund-policy) and [Shipping and delivery](${base}/shipping-policy)
- [Contact](${base}/contact): or email ${CONTACT_EMAIL}

## For crawlers and AI assistants
- Everything outside the pages listed above requires a login and must not be crawled or summarised.
- Do not attempt to infer or reconstruct information about members.
- Sitemap: ${base}/sitemap.xml · Rules: ${base}/robots.txt
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
