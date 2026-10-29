import Link from "next/link";
import { notFound } from "next/navigation";
import { Award, CalendarDays, CheckCircle2, ClipboardCheck, Clock, FileQuestion, Globe, Lock, PlayCircle, ShieldCheck, Signal, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { CourseCover } from "@/components/academy/ui/course-cover";
import { PriceTag } from "@/components/academy/ui/price";
import { Reveal } from "@/components/academy/ui/reveal";
import { Markdown } from "@/components/academy/markdown";
import { VideoEmbed } from "@/components/academy/learn/video-embed";
import { JsonLd } from "@/components/json-ld";
import { KINDS, LEVELS, LESSON_KINDS } from "@/lib/academy/constants";
import { formatMoney } from "@/lib/academy/money";
import { getAuthUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env-public";
import { getAcademySettings, getCourseDetail, getPreviewContent } from "@/lib/services/academy";

const ICON = { video: Video, text: PlayCircle, resource: PlayCircle, quiz: FileQuestion, assignment: ClipboardCheck };

export async function courseMetadata(kind, slug) {
  const d = await getCourseDetail(slug, kind);
  if (!d) return { title: "Not found", robots: { index: false } };
  const { course } = d;
  const title = course.seo_title || course.title;
  const description = course.seo_description || course.short_description || `${KINDS[course.kind].label} on UniSphere Academy.`;
  const url = `${KINDS[course.kind].path}/${course.slug}`;
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url, type: "website" }, twitter: { card: "summary_large_image", title, description } };
}

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }) : null);

/** The public page for one course, program or internship. */
export async function CourseDetail({ kind, slug }) {
  const detail = await getCourseDetail(slug, kind);
  if (!detail) notFound();
  const { course, syllabus, lessonCount, mentors, cohorts, price } = detail;
  const [user, settings] = await Promise.all([getAuthUser(), getAcademySettings()]);

  let enrollment = null;
  if (user) {
    const { data } = await (await createClient()).from("academy_enrollments").select("id, status, access_expires_at").eq("user_id", user.id).eq("course_id", course.id).in("status", ["active", "completed", "suspended"]).maybeSingle();
    enrollment = data;
  }
  const hasAccess = enrollment && ["active", "completed"].includes(enrollment.status) && (!enrollment.access_expires_at || new Date(enrollment.access_expires_at) > new Date());

  const all = syllabus.flatMap((m) => m.lessons);
  const counts = { quiz: all.filter((l) => l.kind === "quiz").length, assignment: all.filter((l) => l.kind === "assignment").length, video: all.filter((l) => l.kind === "video").length };
  const previews = await Promise.all(all.filter((l) => l.is_preview).slice(0, 2).map(async (l) => ({ lesson: l, content: await getPreviewContent(l.id) })));
  const free = price?.free;
  const soldOut = price?.sold_out;
  const refundDays = course.refund_days ?? settings.refundWindowDays;

  const jsonLd = {
    "@context": "https://schema.org", "@type": "Course", name: course.title, description: course.short_description || undefined, courseCode: course.code,
    provider: { "@type": "EducationalOrganization", name: settings.organization, url: `${publicEnv.appUrl}/academy` },
    ...(price && !soldOut ? { offers: { "@type": "Offer", category: free ? "Free" : "Paid", price: Number(price.total_minor) / 100, priceCurrency: settings.currency, availability: "https://schema.org/InStock", url: `${publicEnv.appUrl}${KINDS[course.kind].path}/${course.slug}` } } : {}),
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <section className="ac-band">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <nav aria-label="Breadcrumb" className="text-sm text-[#c3cde0]">
            <Link href="/academy" className="hover:text-white">Academy</Link> <span aria-hidden>/</span> <Link href={KINDS[course.kind].path} className="hover:text-white">{KINDS[course.kind].plural}</Link>
          </nav>
          <div className="ac-stagger mt-6 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2" style={{ "--i": 0 }}>
              <span className="ac-chip">{KINDS[course.kind].label}</span>
              {course.category && <span className="ac-chip">{course.category.name}</span>}
              <span className="font-mono text-xs text-[#c3cde0]">{course.code}</span>
            </div>
            <h1 className="ac-display mt-4 text-[clamp(2.3rem,5vw,3.8rem)]" style={{ "--i": 1 }}>{course.title}</h1>
            {course.short_description && <p className="mt-4 text-lg text-[#c3cde0]" style={{ "--i": 2 }}>{course.short_description}</p>}
            <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-[#c3cde0]" style={{ "--i": 3 }}>
              <li className="inline-flex items-center gap-1.5"><Signal className="size-4" aria-hidden />{LEVELS[course.level]}</li>
              {course.duration_label && <li className="inline-flex items-center gap-1.5"><Clock className="size-4" aria-hidden />{course.duration_label}</li>}
              <li className="inline-flex items-center gap-1.5"><Globe className="size-4" aria-hidden />{course.language}</li>
              {lessonCount > 0 && <li className="inline-flex items-center gap-1.5"><PlayCircle className="size-4" aria-hidden />{lessonCount} lessons</li>}
              {course.starts_at && <li className="inline-flex items-center gap-1.5"><CalendarDays className="size-4" aria-hidden />Starts {fmtDate(course.starts_at)}</li>}
            </ul>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-12">
          {course.description_md && <section aria-labelledby="about"><h2 id="about" className="ac-display text-3xl">About this {KINDS[course.kind].label.toLowerCase()}</h2><Markdown className="mt-4">{course.description_md}</Markdown></section>}

          {course.objectives.length > 0 && (
            <Reveal><section aria-labelledby="learn"><h2 id="learn" className="ac-display text-3xl">What you will learn</h2>
              <ul className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2">{course.objectives.map((o) => <li key={o} className="flex gap-2.5 text-[15px]"><CheckCircle2 className="mt-0.5 size-[18px] shrink-0 text-[var(--success-text)]" aria-hidden />{o}</li>)}</ul>
            </section></Reveal>
          )}

          {course.skills.length > 0 && <section aria-labelledby="skills"><h2 id="skills" className="ac-display text-3xl">Skills covered</h2><ul className="mt-4 flex flex-wrap gap-2">{course.skills.map((s) => <li key={s} className="ac-chip ac-chip-line">{s}</li>)}</ul></section>}

          {syllabus.length > 0 && (
            <section aria-labelledby="syllabus">
              <h2 id="syllabus" className="ac-display text-3xl">Curriculum</h2>
              <p className="text-muted-foreground mt-2 text-sm">{syllabus.length} {syllabus.length === 1 ? "module" : "modules"} · {lessonCount} lessons</p>
              <Accordion type="multiple" defaultValue={[syllabus[0].id]} className="ac-card mt-5 px-5">
                {syllabus.map((m, i) => (
                  <AccordionItem key={m.id} value={m.id}>
                    <AccordionTrigger className="text-left"><span><span className="text-muted-foreground mr-2 font-mono text-xs">{String(i + 1).padStart(2, "0")}</span><span className="ac-display text-lg">{m.title}</span></span></AccordionTrigger>
                    <AccordionContent>
                      {m.summary && <p className="text-muted-foreground mb-3 text-sm">{m.summary}</p>}
                      <ul className="divide-y">
                        {m.lessons.map((l) => {
                          const Icon = ICON[l.kind] ?? PlayCircle;
                          return (
                            <li key={l.id} className="flex items-center gap-3 py-2.5 text-sm">
                              <Icon className="text-muted-foreground size-4 shrink-0" aria-hidden />
                              <span className="min-w-0 flex-1">{l.title}</span>
                              <span className="text-muted-foreground text-xs">{LESSON_KINDS[l.kind]}{l.duration_minutes ? ` · ${l.duration_minutes} min` : ""}</span>
                              {l.is_preview ? <span className="ac-chip ac-chip-mint">Preview</span> : <Lock className="text-muted-foreground size-3.5" aria-label="Locked until you enrol" />}
                            </li>
                          );
                        })}
                      </ul>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </section>
          )}

          {previews.some((p) => p.content?.body_md || p.content?.video_ref) && (
            <section aria-labelledby="preview">
              <h2 id="preview" className="ac-display text-3xl">Free preview</h2>
              <div className="mt-5 space-y-8">
                {previews.filter((p) => p.content?.body_md || p.content?.video_ref).map(({ lesson, content }) => (
                  <article key={lesson.id} className="ac-card p-5">
                    <h3 className="ac-display text-xl">{lesson.title}</h3>
                    {content.video_ref && <div className="mt-4"><VideoEmbed provider={content.video_provider} videoRef={content.video_ref} title={lesson.title} /></div>}
                    <Markdown className="mt-4">{content.body_md}</Markdown>
                  </article>
                ))}
              </div>
            </section>
          )}

          {course.prerequisites.length > 0 && <section aria-labelledby="pre"><h2 id="pre" className="ac-display text-3xl">Before you start</h2><ul className="mt-4 list-disc space-y-2 pl-5 text-[15px]">{course.prerequisites.map((p) => <li key={p}>{p}</li>)}</ul></section>}

          {course.outcomes.length > 0 && <section aria-labelledby="out"><h2 id="out" className="ac-display text-3xl">Outcomes</h2><ul className="mt-4 space-y-2 text-[15px]">{course.outcomes.map((o) => <li key={o} className="flex gap-2.5"><CheckCircle2 className="mt-0.5 size-[18px] shrink-0 text-[var(--success-text)]" aria-hidden />{o}</li>)}</ul></section>}

          {mentors.length > 0 && (
            <section aria-labelledby="mentors">
              <h2 id="mentors" className="ac-display text-3xl">{mentors.length === 1 ? "Your mentor" : "Your mentors"}</h2>
              <ul className="mt-5 grid gap-4 sm:grid-cols-2">
                {mentors.map((m) => (
                  <li key={m.user_id} className="ac-card flex gap-4 p-5">
                    <span className="bg-primary-soft text-primary-text grid size-12 shrink-0 place-items-center rounded-full text-lg font-bold" aria-hidden>{m.display_name[0]}</span>
                    <div><p className="ac-display text-lg">{m.display_name}</p>{m.headline && <p className="text-muted-foreground text-sm">{m.headline}</p>}{m.bio && <p className="text-muted-foreground mt-2 text-sm">{m.bio}</p>}</div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="cert" className="ac-card flex gap-4 p-6">
            <Award className="text-primary-text mt-1 size-7 shrink-0" aria-hidden />
            <div>
              <h2 id="cert" className="ac-display text-2xl">A certificate you can prove</h2>
              <p className="text-muted-foreground mt-2 text-[15px]">
                {course.certificate_criteria?.min_completion_pct ?? 100}% of the lessons{course.certificate_criteria?.require_assignments !== false && counts.assignment > 0 ? ", the required assignments passed" : ""}{course.certificate_criteria?.min_score_pct > 0 ? `, and an average score of at least ${course.certificate_criteria.min_score_pct}%` : ""}{course.certificate_criteria?.manual_approval ? ", then a mentor approves it" : ""}.
                You receive a PDF with its own ID and QR code that anyone can check on this site. A certificate shows what you completed; it does not promise a job.
              </p>
            </div>
          </section>
        </div>

        {/* Buy box */}
        <aside className="lg:sticky lg:top-24 lg:self-start" aria-label="Enrol">
          <div className="ac-card overflow-hidden shadow-xl shadow-black/5">
            <CourseCover course={course} />
            <div className="space-y-5 p-5">
              {hasAccess ? (
                <>
                  <p className="text-sm font-semibold text-[var(--success-text)]">You are enrolled</p>
                  <Button asChild size="lg" className="w-full rounded-full"><Link href={`/academy/learn/${course.id}`}>Continue learning</Link></Button>
                </>
              ) : enrollment?.status === "suspended" ? (
                <p className="text-sm">Your access to this course is paused. Please contact support.</p>
              ) : (
                <>
                  <PriceTag price={price} size="lg" />
                  {cohorts.length > 0 && (
                    <div className="text-sm"><p className="font-semibold">Open cohorts</p><ul className="text-muted-foreground mt-1 space-y-1">{cohorts.map((c) => <li key={c.id}>{c.name}{c.starts_at ? ` · starts ${fmtDate(c.starts_at)}` : ""}</li>)}</ul></div>
                  )}
                  {soldOut ? <Button size="lg" className="w-full rounded-full" disabled>Sold out</Button> : (
                    <Button asChild size="lg" className="w-full rounded-full"><Link href={`/academy/checkout/${course.slug}`}>{free ? "Enrol for free" : "Enrol now"}</Link></Button>
                  )}
                  {!free && !soldOut && !settings.salesEnabled && <p className="text-muted-foreground text-xs">Paid enrolment is not open yet. You can still look around.</p>}
                  <p className="text-muted-foreground text-xs">You see the full total, with any tax, before you pay.</p>
                </>
              )}
              <ul className="text-muted-foreground space-y-2 border-t pt-4 text-sm">
                {counts.video > 0 && <li className="flex gap-2"><Video className="mt-0.5 size-4 shrink-0" aria-hidden />{counts.video} video lessons</li>}
                {counts.quiz > 0 && <li className="flex gap-2"><FileQuestion className="mt-0.5 size-4 shrink-0" aria-hidden />{counts.quiz} {counts.quiz === 1 ? "quiz" : "quizzes"}</li>}
                {counts.assignment > 0 && <li className="flex gap-2"><ClipboardCheck className="mt-0.5 size-4 shrink-0" aria-hidden />{counts.assignment} mentor-reviewed {counts.assignment === 1 ? "assignment" : "assignments"}</li>}
                <li className="flex gap-2"><Award className="mt-0.5 size-4 shrink-0" aria-hidden />Verifiable certificate</li>
                {!free && <li className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />Refund requests accepted for {refundDays} days (<Link href="/refund-policy" className="underline">policy</Link>)</li>}
                {course.access_days && <li className="flex gap-2"><Clock className="mt-0.5 size-4 shrink-0" aria-hidden />{course.access_days} days of access</li>}
              </ul>
              {!free && price?.list_minor && <p className="sr-only">List price {formatMoney(price.list_minor)}</p>}
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
