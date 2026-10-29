import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { DataTable, EmptyRow, Panel, StatusBadge, fmtDateTime } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EntityForm } from "@/components/academy/admin/entity-form";
import { PricePreview } from "@/components/academy/admin/course-tools";
import { saveCouponAction } from "@/lib/actions/academy-admin";
import { COUPON_FIELDS } from "@/lib/academy/forms";
import { formatBps, formatMoney, minorToInput } from "@/lib/academy/money";
import { categoriesAll, courseOptions, needAcademy, rows } from "@/lib/services/academy-admin";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Academy pricing and coupons" };

function couponState(c) {
  const now = Date.now();
  if (!c.active) return "inactive";
  if (c.starts_at && new Date(c.starts_at).getTime() > now) return "scheduled";
  if (c.expires_at && new Date(c.expires_at).getTime() <= now) return "expired";
  return "active";
}

export default async function PricingAndCoupons({ searchParams }) {
  const held = await needAcademy("academy.pricing.manage", "academy.coupons.manage");
  const sp = await searchParams;
  const supabase = await createClient();
  const canCoupons = held["academy.coupons.manage"];
  const [courses, categories] = await Promise.all([courseOptions(), categoriesAll()]);
  const [{ data: coupons }, stats, { data: rules }] = await Promise.all([
    supabase.from("academy_coupons").select("*").order("created_at", { ascending: false }),
    rows("academy_admin_coupon_report"),
    supabase.from("academy_price_rules").select("id, label, kind, price_minor, starts_at, ends_at, active, course:academy_courses(id, code, title)").order("created_at", { ascending: false }).limit(50),
  ]);
  const statBy = new Map(stats.map((s) => [s.coupon_id, s]));
  const editing = (coupons ?? []).find((c) => c.id === sp.edit);
  let initial = null;
  if (editing) {
    const [cc, cat, users] = await Promise.all([
      supabase.from("academy_coupon_courses").select("course_id").eq("coupon_id", editing.id),
      supabase.from("academy_coupon_categories").select("category_id").eq("coupon_id", editing.id),
      rows("academy_coupon_usernames", { p_coupon: editing.id }),
    ]);
    initial = {
      ...editing,
      percent: editing.percent_bps ? formatBps(editing.percent_bps).replace("%", "") : "", amount: editing.amount_minor ? minorToInput(editing.amount_minor) : "",
      max_discount: editing.max_discount_minor ? minorToInput(editing.max_discount_minor) : "", min_purchase: editing.min_purchase_minor ? minorToInput(editing.min_purchase_minor) : "",
      course_ids: (cc.data ?? []).map((x) => x.course_id), category_ids: (cat.data ?? []).map((x) => x.category_id), usernames: users.map((u) => u.username).join(" "),
    };
  }

  return (
    <>
      <PageHeader eyebrow="Academy" title="Pricing and coupons" description="Prices live on each course. Scheduled prices and coupons are set here and checked on the server at checkout; a coupon's discount is never taken from the browser." />

      <Panel title="Preview the price" description="What a student would pay for a course, with a coupon, as a particular student, at a particular moment. Creates nothing." className="mb-6">
        <PricePreview courses={courses} />
      </Panel>

      <Panel title="Scheduled prices" description="Sales, early-bird and cohort prices. Edit them on the course's Pricing tab." className="mb-6">
        <DataTable caption="Scheduled prices" columns={["Course", "Label", "Price", "Window", "State"]} empty={(rules ?? []).length === 0 && <EmptyRow>No scheduled prices.</EmptyRow>}>
          {(rules ?? []).map((r) => (
            <tr key={r.id}><td className="px-4 py-3"><Link className="font-semibold hover:underline" href={`/admin/academy/courses/${r.course?.id}?tab=pricing`}>{r.course?.code}</Link><p className="text-muted-foreground text-xs">{r.course?.title}</p></td>
              <td className="px-4 py-3">{r.label}<p className="text-muted-foreground text-xs">{r.kind}</p></td><td className="px-4 py-3 tabular-nums">{formatMoney(r.price_minor, { withZero: true })}</td>
              <td className="px-4 py-3 text-xs whitespace-nowrap">{r.starts_at ? fmtDateTime(r.starts_at) : "now"} → {r.ends_at ? fmtDateTime(r.ends_at) : "open"}</td><td className="px-4 py-3">{r.active ? <Badge variant="success">on</Badge> : <Badge variant="mono">off</Badge>}</td></tr>
          ))}
        </DataTable>
      </Panel>

      {canCoupons ? (
        <>
          <Panel title={editing ? `Edit coupon ${editing.code}` : "New coupon"} description="Percentages round half up. A coupon with no course or subject ticked works on every course of the chosen types." className="mb-6"
            actions={editing ? <Button asChild variant="ghost" size="sm"><Link href="/admin/academy/pricing">Cancel</Link></Button> : undefined}>
            <EntityForm key={editing?.id ?? "new"} fields={COUPON_FIELDS(courses, categories)} initial={initial ?? { kind: "percent", per_user_limit: 1, kinds: ["course", "program", "internship"], course_ids: [], category_ids: [], stackable_with_sale: true, active: true }} action={saveCouponAction.bind(null, editing?.id ?? null)} submitLabel={editing ? "Save coupon" : "Create coupon"} resetOnSuccess={!editing} />
          </Panel>
          <Panel title="Coupons" description="Visible to staff only. Students can only try a code at checkout.">
            <DataTable caption="Coupons" columns={["Code", "Discount", "State", "Used", "Window", ""]} empty={(coupons ?? []).length === 0 && <EmptyRow>No coupons yet.</EmptyRow>}>
              {(coupons ?? []).map((c) => {
                const s = statBy.get(c.id);
                return (
                  <tr key={c.id}>
                    <td className="px-4 py-3 font-mono text-xs font-semibold">{c.code}{c.auto_apply && <Badge variant="mono" className="ml-2 font-sans">auto · {c.public_label}</Badge>}{c.internal_note && <p className="text-muted-foreground max-w-48 truncate font-sans font-normal">{c.internal_note}</p>}</td>
                    <td className="px-4 py-3">{c.kind === "percent" ? formatBps(c.percent_bps) : formatMoney(c.amount_minor, { withZero: true })}{c.max_discount_minor ? ` (max ${formatMoney(c.max_discount_minor)})` : ""}{c.min_purchase_minor > 0 ? <p className="text-muted-foreground text-xs">min {formatMoney(c.min_purchase_minor)}</p> : null}</td>
                    <td className="px-4 py-3"><StatusBadge value={couponState(c) === "inactive" ? "deactivated" : couponState(c)} /></td>
                    <td className="px-4 py-3 tabular-nums">{s?.redeemed ?? 0}{c.usage_limit ? ` / ${c.usage_limit}` : ""}{s?.reserved ? <p className="text-muted-foreground text-xs">{s.reserved} held</p> : null}<p className="text-muted-foreground text-xs">saved {formatMoney(s?.discount_minor ?? 0, { withZero: true })}</p></td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap">{c.starts_at ? fmtDateTime(c.starts_at) : "now"} → {c.expires_at ? fmtDateTime(c.expires_at) : "open"}</td>
                    <td className="px-4 py-3 text-right"><Button asChild variant="outline" size="sm"><Link href={`/admin/academy/pricing?edit=${c.id}`}>Edit</Link></Button></td>
                  </tr>
                );
              })}
            </DataTable>
          </Panel>
        </>
      ) : <p className="text-muted-foreground text-sm">You can preview prices but need coupon access to manage coupons.</p>}
    </>
  );
}
