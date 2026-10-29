import Link from "next/link";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CourseCard } from "@/components/academy/ui/course-card";
import { EmptyBlock } from "@/components/academy/ui/section";
import { RevealGroup, RevealItem } from "@/components/academy/ui/reveal";
import { DELIVERY_MODES, KINDS, LEVELS } from "@/lib/academy/constants";
import { PAGE, listCategories, listCourses } from "@/lib/services/academy";

const field = "border-input bg-card h-10 rounded-lg border px-3 text-sm";

/** The catalogue for one kind (or all). Filters are a plain GET form, so the page works without JavaScript and every view has its own address. */
export async function Catalog({ kind, searchParams, basePath }) {
  const sp = await searchParams;
  const level = Object.hasOwn(LEVELS, sp.level) && sp.level !== "all" ? sp.level : null;
  const mode = typeof sp.mode === "string" && Object.hasOwn(DELIVERY_MODES, sp.mode) ? sp.mode : null;
  const sort = sp.sort === "title" ? "title" : "new";
  const page = Math.max(1, Number(sp.page) || 1);
  const q = typeof sp.q === "string" ? sp.q.slice(0, 60) : "";
  const category = typeof sp.category === "string" ? sp.category.slice(0, 60) : null;
  const [categories, { courses, total, prices }] = await Promise.all([listCategories(), listCourses({ kind, category, level, mode, q, sort, page })]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const href = (p) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (category) params.set("category", category);
    if (level) params.set("level", level);
    if (mode) params.set("mode", mode);
    if (sort !== "new") params.set("sort", sort);
    if (p > 1) params.set("page", String(p));
    const s = params.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  const filtered = Boolean(q || category || level || mode);

  return (
    <>
      <section className="ac-band">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <div className="ac-stagger max-w-3xl">
            <p className="ac-kicker" style={{ "--i": 0 }}>{kind ? KINDS[kind].plural : "Everything"}</p>
            <h1 className="ac-display mt-4 text-[clamp(2.4rem,5vw,4rem)]" style={{ "--i": 1 }}>{kind === "program" ? "Guided programs" : kind === "internship" ? "Project internships" : "Courses"}</h1>
            <p className="mt-4 text-lg text-[#c3cde0]" style={{ "--i": 2 }}>{kind ? KINDS[kind].blurb : "Structured lessons, quizzes, assignments and mentor feedback."}</p>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <form method="get" action={basePath} role="search" aria-label="Filter" className="flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1">
            <label htmlFor="f-q" className="text-xs font-semibold">Search</label>
            <div className="relative mt-1">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" aria-hidden />
              <input id="f-q" name="q" defaultValue={q} placeholder="Title, topic or code" maxLength={60} className={`${field} w-full pl-9`} />
            </div>
          </div>
          <div>
            <label htmlFor="f-cat" className="text-xs font-semibold">Subject</label>
            <select id="f-cat" name="category" defaultValue={category ?? ""} className={`${field} mt-1 block`}>
              <option value="">All subjects</option>
              {categories.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="f-level" className="text-xs font-semibold">Level</label>
            <select id="f-level" name="level" defaultValue={level ?? ""} className={`${field} mt-1 block`}>
              <option value="">Any level</option>
              {Object.entries(LEVELS).filter(([k]) => k !== "all").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="f-mode" className="text-xs font-semibold">How it is taught</label>
            <select id="f-mode" name="mode" defaultValue={mode ?? ""} className={`${field} mt-1 block`}>
              <option value="">Live or recorded</option>
              <option value="live">Live classes</option>
              <option value="recorded">Recorded</option>
            </select>
          </div>
          <div>
            <label htmlFor="f-sort" className="text-xs font-semibold">Order</label>
            <select id="f-sort" name="sort" defaultValue={sort} className={`${field} mt-1 block`}>
              <option value="new">Newest</option>
              <option value="title">Title A–Z</option>
            </select>
          </div>
          <Button type="submit">Apply</Button>
          {filtered && <Button asChild variant="ghost"><Link href={basePath}>Clear</Link></Button>}
        </form>

        <p className="text-muted-foreground mt-6 text-sm" aria-live="polite">{total} {total === 1 ? "result" : "results"}</p>

        {courses.length === 0 ? (
          <EmptyBlock className="mt-4" title={filtered ? "Nothing matches those filters" : "Nothing published here yet"} action={filtered ? <Button asChild variant="outline"><Link href={basePath}>Clear filters</Link></Button> : undefined}>
            {filtered ? "Try a different search or remove a filter." : "New items appear here as soon as they are published."}
          </EmptyBlock>
        ) : (
          <RevealGroup className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" key={`${q}${category}${level}${sort}${page}`}>
            {courses.map((c, i) => <RevealItem key={c.id}><CourseCard course={c} price={prices[c.id]} priority={i < 3} /></RevealItem>)}
          </RevealGroup>
        )}

        {pages > 1 && (
          <nav aria-label="Pages" className="mt-10 flex items-center justify-center gap-3">
            {page > 1 ? <Button asChild variant="outline" size="sm"><Link href={href(page - 1)} rel="prev"><ChevronLeft aria-hidden />Previous</Link></Button> : <span />}
            <span className="text-muted-foreground text-sm">Page {page} of {pages}</span>
            {page < pages ? <Button asChild variant="outline" size="sm"><Link href={href(page + 1)} rel="next">Next<ChevronRight aria-hidden /></Link></Button> : <span />}
          </nav>
        )}
      </div>
    </>
  );
}
