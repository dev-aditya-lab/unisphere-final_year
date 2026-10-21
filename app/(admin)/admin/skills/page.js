import { PageHeader } from "@/components/shell/page-header";
import { DataTable, EmptyRow, FilterTabs, Pager, Panel, fmtNumber } from "@/components/admin/ui";
import { ActionDialog } from "@/components/admin/action-dialog";
import { SkillDialog, UnlistedAdder, VisibilitySwitch } from "@/components/admin/skills-admin";
import { Button } from "@/components/ui/button";
import { deleteSkillAction } from "@/lib/actions/admin";
import { PAGE_SIZE, listSkillCategories, listSkills, listUnlistedSkills, pageOffset } from "@/lib/services/admin";

export const metadata = { title: "Skills & interests" };

const KINDS = [
  { value: "skill", label: "Skills" },
  { value: "interest", label: "Interests" },
];

export default async function AdminSkillsPage({ searchParams }) {
  const sp = await searchParams;
  const kind = sp.kind === "interest" ? "interest" : "skill";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 40) : "";
  const status = sp.status === "active" || sp.status === "hidden" ? sp.status : "";
  const page = Math.max(1, Number.parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1);

  const [allCategories, unlisted] = await Promise.all([listSkillCategories(), listUnlistedSkills(kind)]);
  const categories = allCategories.filter((c) => c.kind === kind).map((c) => c.category);
  const category = categories.includes(sp.category) ? sp.category : "";
  const rows = await listSkills({ kind, category: category || null, q: q || null, status: status || null, page });
  const total = Number(rows[0]?.total_count ?? 0);
  const noun = kind === "skill" ? "skills" : "interests";

  return (
    <>
      <PageHeader
        eyebrow="Community"
        title="Skills & interests"
        description="What the pickers suggest on profiles, in onboarding, on projects and on opportunities. It covers more than coding: design, writing, business, health, music, languages, sports and trades. Members can always type their own, and the ones they type most appear below so you can list them."
        actions={<SkillDialog kind={kind} categories={categories} label={`Add a ${kind}`} variant="default" />}
      />
      <FilterTabs label="List" basePath="/admin/skills" param="kind" current={kind} options={KINDS} />

      {unlisted.length > 0 && (
        <Panel title="Typed by members, not listed yet" description={`The ${noun} members use most that are not in the list, with how many use each. Choose a category, then add with one click.`} className="mb-5">
          <UnlistedAdder unlisted={unlisted} kind={kind} categories={categories} />
        </Panel>
      )}

      <Panel title={`${noun[0].toUpperCase()}${noun.slice(1)} (${fmtNumber(total)})`}>
        <form action="/admin/skills" className="mb-4 flex flex-wrap items-end gap-2">
          <input type="hidden" name="kind" value={kind} />
          <div className="space-y-1.5">
            <label htmlFor="skill-q" className="text-[13px] font-semibold">Search</label>
            <input id="skill-q" name="q" defaultValue={q} placeholder="Name" className="border-input bg-card h-10 w-56 rounded-lg border px-3 text-sm" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="skill-cat" className="text-[13px] font-semibold">Category</label>
            <select id="skill-cat" name="category" defaultValue={category}>
              <option value="">All</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="skill-status" className="text-[13px] font-semibold">Show</label>
            <select id="skill-status" name="status" defaultValue={status}>
              <option value="">Everything</option>
              <option value="active">Suggested</option>
              <option value="hidden">Hidden</option>
            </select>
          </div>
          <Button type="submit" size="sm">Filter</Button>
        </form>

        <DataTable caption={`Listed ${noun}`} columns={["Name", "Category", "Members using it", "Suggested", ""]} empty={rows.length === 0 && <EmptyRow>Nothing matches.</EmptyRow>}>
          {rows.map((s) => (
            <tr key={s.id}>
              <td className="px-4 py-3 font-medium">{s.name}</td>
              <td className="text-muted-foreground px-4 py-3">{s.category}</td>
              <td className="px-4 py-3 tabular-nums">{fmtNumber(s.members)}</td>
              <td className="px-4 py-3"><VisibilitySwitch skill={s} /></td>
              <td className="px-4 py-3 text-right whitespace-nowrap">
                <SkillDialog skill={s} categories={categories} label="Edit" />{" "}
                <ActionDialog
                  label="Remove"
                  destructive
                  title={`Remove ${s.name}`}
                  description="It stops being suggested. Members who already have it keep it on their profile."
                  action={deleteSkillAction}
                  args={{ id: s.id }}
                  askReason={false}
                />
              </td>
            </tr>
          ))}
        </DataTable>
        <Pager basePath="/admin/skills" page={page} total={total} params={{ kind, q: q || null, category: category || null, status: status || null }} />
      </Panel>
    </>
  );
}
