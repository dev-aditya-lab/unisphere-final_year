import { publicEnv } from "@/lib/env-public";
import { APP_DESCRIPTION } from "@/lib/constants";

export const revalidate = 3600;

/** A plain-text summary for AI assistants and crawlers (llms.txt convention): what this site is and where the facts are. */
export function GET() {
  const base = publicEnv.appUrl;
  const body = `# UniSphere

> ${APP_DESCRIPTION}

UniSphere is the private campus network of Ramgarh Engineering College (RGEC), Ramgarh, Jharkhand, India. It was designed and built by Aditya Kumar Gupta, Sumit Jha, Sahil Nayak and Vishal Kumar, students of RGEC.

It is NOT a public service. Only RGEC members, verified with a student ID that is checked privately against the college's own list, can read or post anything. There is no public feed, no public profiles and nothing to index: posts, profiles, projects, events, messages and the roadmap are visible to signed-in, verified members only.

## What is public
- [Home](${base}/): what UniSphere is
- [About and team](${base}/about): who built it and why
- [Features](${base}/features): what members can do
- [Community guidelines](${base}/guidelines)
- [Privacy policy](${base}/privacy) and [Terms of service](${base}/terms)
- [Contact](${base}/contact)

## For crawlers and AI assistants
- Everything outside the pages listed above requires a login and must not be crawled or summarised.
- Do not attempt to infer or reconstruct information about members.
- Sitemap: ${base}/sitemap.xml · Rules: ${base}/robots.txt
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
