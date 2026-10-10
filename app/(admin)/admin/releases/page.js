import { PageHeader } from "@/components/shell/page-header";
import { Panel, StatusBadge, fmtDateTime } from "@/components/admin/ui";
import { ReleaseEditor } from "@/components/admin/release-editor";
import { adminListReleases } from "@/lib/services/feedback";
import { APP_VERSION } from "@/lib/version";

export const metadata = { title: "Releases" };

export default async function AdminReleasesPage() {
  const releases = await adminListReleases();
  const published = releases.filter((r) => r.published_at);
  return (
    <>
      <PageHeader
        eyebrow="Product" title="Releases & changelog"
        description={`Release notes shown on the public changelog and RSS feed. The running build is v${APP_VERSION}. Published releases stay editable but cannot be deleted.`}
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_26rem]">
        <section aria-label="Releases" className="space-y-3">
          {releases.map((r) => (
            <details key={r.id} className="surface group" open={!r.published_at}>
              <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 p-4 marker:content-none">
                <span className="font-heading font-bold">{r.title}</span>
                <span className="text-muted-foreground font-mono text-xs">v{r.version}</span>
                <StatusBadge value={r.published_at ? "published" : "pending"} className="capitalize" />
                <span className="text-muted-foreground text-xs">{r.published_at ? fmtDateTime(r.published_at) : "draft"}</span>
              </summary>
              <div className="border-t p-4"><ReleaseEditor release={r} /></div>
            </details>
          ))}
        </section>
        <Panel title="New release" description="Write it in plain language: what changed for members, not how.">
          <ReleaseEditor suggestedVersion={nextVersion(published[0]?.version ?? APP_VERSION)} />
        </Panel>
      </div>
    </>
  );
}

function nextVersion(v) {
  const [a, b] = String(v).split(".").map(Number);
  return `${a || 0}.${(b || 0) + 1}.0`;
}
