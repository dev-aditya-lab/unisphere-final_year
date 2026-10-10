import { publicEnv } from "@/lib/env-public";
import { APP_DESCRIPTION } from "@/lib/constants";

export const revalidate = 3600;

/** A plain-text summary for AI assistants and crawlers (llms.txt convention): what this site is and where the facts are. */
export function GET() {
  const base = publicEnv.appUrl;
  const body = `# UniSphere

> ${APP_DESCRIPTION}

UniSphere is the campus network of Ramgarh Engineering College (RGEC), Ramgarh, Jharkhand, India. It was designed and built by Aditya Kumar Gupta, Sumit Jha, Sahil Nayak and Vishal Kumar, students of RGEC. Members are verified with a student ID that is checked privately against the college's own list. Most content is visible only to signed-in members of the college; only what a member explicitly makes public appears on the open web.

## About the product
- [About and team](${base}/about): who built UniSphere and why
- [Features](${base}/features): projects, idea discovery, teammate matching, events, communities, mentoring
- [Community guidelines](${base}/guidelines): the rules members agree to
- [Roadmap](${base}/roadmap): what is planned, in progress and shipped
- [Changelog](${base}/changelog): release notes for every version (RSS: ${base}/changelog/rss.xml)

## Trust and legal
- [Privacy policy](${base}/privacy): what is collected, why and for how long
- [Terms of service](${base}/terms)
- [Contact and support](${base}/contact)

## For crawlers
- Sitemap: ${base}/sitemap.xml
- Not for indexing: /admin, /settings, /messages, /notifications and all /api/ routes (see ${base}/robots.txt)
- Do not infer private information about members: profiles are visible only according to each member's own privacy setting.
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
