import Link from "next/link";
import { Briefcase, GraduationCap, MessagesSquare } from "lucide-react";
import { BadgeCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CancelMentorship, RequestMentorshipButton, RespondMentorship } from "@/components/alumni/mentorship-controls";
import { EmptyState } from "@/components/empty-state";
import { PostCard } from "@/components/posts/post-card";
import { PageHeader } from "@/components/shell/page-header";
import { UserAvatar } from "@/components/user-avatar";
import { requireProfile } from "@/lib/auth/session";
import { getCollegeStructure } from "@/lib/services/colleges";
import { getAlumniStories, getMentorshipRequests, searchMentors } from "@/lib/services/projects";
import { isFlagEnabled } from "@/lib/settings";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { notFound } from "next/navigation";

export const metadata = { title: "Alumni & mentors", robots: { index: false, follow: false } };

const selectCls = "border-input bg-card focus-visible:border-ring focus-visible:ring-ring/40 h-9 rounded-md border px-2.5 text-sm outline-none focus-visible:ring-[3px]";
const inputCls = "border-input bg-card focus-visible:border-ring focus-visible:ring-ring/40 h-9 rounded-md border px-3 text-sm outline-none focus-visible:ring-[3px]";
const TABS = [["directory", "Directory"], ["stories", "Stories"], ["requests", "Mentorship requests"]];

const STATUS_LABEL = { pending: "Pending", accepted: "Accepted", declined: "Declined", cancelled: "Withdrawn", completed: "Completed" };

const num = (v) => (Number.isInteger(Number(v)) && Number(v) > 1900 ? Number(v) : null);

export default async function AlumniPage({ searchParams }) {
  if (!(await isFlagEnabled("alumni_network"))) notFound();
  const { user, profile } = await requireProfile();
  const sp = await searchParams;
  const tab = TABS.some(([id]) => id === sp.tab) ? sp.tab : "directory";
  const str = (k, max = 80) => (typeof sp[k] === "string" ? sp[k].trim().slice(0, max) : "");

  const myCollege = profile.college_id ? await getCollegeStructure(profile.college_id) : null;
  const departmentId = myCollege?.departments.some((d) => d.id === sp.dept) ? sp.dept : null;

  const [people, stories, requests] = await Promise.all([
    tab === "directory"
      ? searchMentors({
          query: str("q"), collegeId: sp.scope === "all" ? null : profile.college_id, departmentId, gradFrom: num(sp.from), gradTo: num(sp.to),
          skills: str("skill", 40) ? [str("skill", 40)] : null, industry: str("industry"), onlyMentors: sp.mentors === "1",
        })
      : [],
    tab === "stories" ? getAlumniStories() : [],
    getMentorshipRequests(user.id),
  ]);
  const incoming = requests.received.filter((r) => r.status === "pending").length;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader eyebrow="Network" title="Alumni & mentors" description="Find seniors and alumni by department, graduation year, industry or skill. Mentoring is always opt-in, and contact details are never shared automatically." />

      <nav aria-label="Alumni sections" className="mb-5 flex gap-1 overflow-x-auto border-b">
        {TABS.map(([id, label]) => (
          <Link key={id} href={`/alumni?tab=${id}`} aria-current={tab === id ? "page" : undefined} className={cn("relative px-3 py-2.5 text-sm font-medium whitespace-nowrap", tab === id ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
            {label}
            {id === "requests" && incoming > 0 && <span className="bg-primary text-primary-foreground ml-1.5 rounded-full px-1.5 text-[11px] leading-5 font-semibold">{incoming}</span>}
            {tab === id && <span aria-hidden="true" className="bg-primary absolute inset-x-3 -bottom-px h-0.5 rounded-full" />}
          </Link>
        ))}
      </nav>

      {tab === "directory" && (
        <>
          <form method="get" action="/alumni" role="search" className="surface mb-5 space-y-3 p-4">
            <div className="flex flex-wrap gap-2">
              <label htmlFor="alumni-q" className="sr-only">Search by name, role, company or experience</label>
              <input id="alumni-q" name="q" defaultValue={str("q")} placeholder="Name, role, company, experience…" className={cn(inputCls, "min-w-56 flex-1")} />
              <Button type="submit">Search</Button>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {myCollege && myCollege.departments.length > 0 && (
                <select name="dept" defaultValue={departmentId ?? ""} className={selectCls} aria-label="Department">
                  <option value="">All departments</option>
                  {myCollege.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              )}
              <input name="from" type="number" min={1960} max={2100} defaultValue={sp.from ?? ""} placeholder="Batch from" aria-label="Graduation year from" className={cn(inputCls, "w-28")} />
              <input name="to" type="number" min={1960} max={2100} defaultValue={sp.to ?? ""} placeholder="Batch to" aria-label="Graduation year to" className={cn(inputCls, "w-28")} />
              <input name="industry" defaultValue={str("industry")} placeholder="Industry" aria-label="Industry" className={cn(inputCls, "w-36")} />
              <input name="skill" defaultValue={str("skill", 40)} placeholder="Skill" aria-label="Skill" className={cn(inputCls, "w-32")} />
              <label className="flex items-center gap-1.5"><input type="checkbox" name="mentors" value="1" defaultChecked={sp.mentors === "1"} className="accent-[var(--primary)]" /> Open to mentoring</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" name="scope" value="all" defaultChecked={sp.scope === "all"} className="accent-[var(--primary)]" /> All colleges</label>
            </div>
          </form>
          {people.length === 0 ? (
            <EmptyState icon={GraduationCap} title="No alumni or mentors match">
              Try removing a filter. Alumni appear once they join and set their account type to Alumni, and mentors once they turn on “Open to mentoring”.
            </EmptyState>
          ) : (
            <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {people.map((p) => (
                <li key={p.id} className="surface flex flex-col p-4">
                  <div className="flex items-start gap-3">
                    <Link href={`/u/${p.username}`} aria-label={`${p.full_name}'s profile`}><UserAvatar name={p.full_name} avatarKey={p.avatar_key} size="lg" /></Link>
                    <div className="min-w-0">
                      <Link href={`/u/${p.username}`} className="font-heading flex items-center gap-1 font-bold hover:underline">
                        {p.full_name}{p.verified && <BadgeCheck className="text-teal-text size-4" aria-label="Verified" />}
                      </Link>
                      <p className="text-muted-foreground text-sm">
                        {[p.job_title, p.company].filter(Boolean).join(" at ") || p.headline || (p.account_type === "alumni" ? "Alumnus" : "Member")}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {[p.department_name, p.graduation_year ? `Class of ${p.graduation_year}` : null, p.industry].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  </div>
                  {p.mentoring_topics?.length > 0 && (
                    <p className="mt-3 flex flex-wrap gap-1">{p.mentoring_topics.map((t) => <Badge key={t} variant="soft">{t}</Badge>)}</p>
                  )}
                  {p.skills?.length > 0 && <p className="text-muted-foreground mt-2 text-xs"><Briefcase className="mr-1 inline size-3" aria-hidden="true" />{p.skills.slice(0, 5).join(", ")}</p>}
                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                    {p.open_to_mentoring ? <RequestMentorshipButton mentorId={p.id} mentorName={p.full_name} /> : <span className="text-muted-foreground text-xs">Not currently offering mentoring</span>}
                    <Button asChild size="sm" variant="ghost"><Link href={`/u/${p.username}`}>View profile</Link></Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {tab === "stories" &&
        (stories.length === 0 ? (
          <EmptyState icon={MessagesSquare} title="No alumni stories yet">
            Alumni can share lessons from their journey by posting with the “Experience” type.
          </EmptyState>
        ) : (
          <ul className="mx-auto max-w-2xl space-y-4">{stories.map((s) => <li key={s.id}><PostCard post={s} viewerId={user.id} /></li>)}</ul>
        ))}

      {tab === "requests" && (
        <div className="space-y-8">
          <section aria-labelledby="in-title">
            <h2 id="in-title" className="eyebrow mb-3">Requests to you ({requests.received.length})</h2>
            {requests.received.length === 0 ? <p className="text-muted-foreground text-sm">{profile.open_to_mentoring ? "No requests yet." : "You are not listed as a mentor. Turn on “Open to mentoring” in your profile to receive requests."}</p> : (
              <ul className="space-y-3">
                {requests.received.map((r) => (
                  <li key={r.id} className="surface p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <UserAvatar name={r.person?.full_name ?? "Member"} avatarKey={r.person?.avatar_key} size="sm" />
                        <div className="leading-tight">
                          {r.person ? <Link className="text-sm font-semibold hover:underline" href={`/u/${r.person.username}`}>{r.person.full_name}</Link> : <span className="text-sm font-semibold">Member</span>}
                          <p className="text-muted-foreground text-xs">{timeAgo(r.created_at)}{r.topic ? ` · ${r.topic}` : ""}</p>
                        </div>
                      </div>
                      <Badge variant={r.status === "accepted" ? "success" : r.status === "pending" ? "warning" : "mono"}>{STATUS_LABEL[r.status]}</Badge>
                    </div>
                    <p className="bg-muted/50 mt-3 rounded-md p-3 text-sm">{r.message}</p>
                    {r.status === "pending" && <RespondMentorship requestId={r.id} />}
                    {r.response_message && <p className="text-muted-foreground mt-2 text-xs">Your reply: {r.response_message}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="out-title">
            <h2 id="out-title" className="eyebrow mb-3">Your requests ({requests.sent.length})</h2>
            {requests.sent.length === 0 ? <p className="text-muted-foreground text-sm">You have not asked anyone yet. Browse the directory to find a mentor.</p> : (
              <ul className="space-y-3">
                {requests.sent.map((r) => (
                  <li key={r.id} className="surface p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{r.person ? <Link href={`/u/${r.person.username}`} className="hover:underline">{r.person.full_name}</Link> : "Mentor"}<span className="text-muted-foreground font-normal"> · {timeAgo(r.created_at)}</span></p>
                      <div className="flex items-center gap-2">
                        <Badge variant={r.status === "accepted" ? "success" : r.status === "pending" ? "warning" : "mono"}>{STATUS_LABEL[r.status]}</Badge>
                        {r.status === "pending" && <CancelMentorship requestId={r.id} />}
                      </div>
                    </div>
                    {r.response_message && <p className="bg-muted/50 mt-2 rounded-md p-3 text-sm">“{r.response_message}”</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
