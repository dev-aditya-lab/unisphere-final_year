import { CheckCircle2, CircleAlert } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { DataTable, EmptyRow, FilterTabs, Panel, StatCard, StatusBadge, fmtDateTime, fmtNumber } from "@/components/admin/ui";
import { BreakdownBars } from "@/components/admin/charts";
import { getEnv, getIntegrations } from "@/lib/env";
import { aiModels } from "@/lib/ai/config";
import { listProviderModels } from "@/lib/ai/status";
import { isFlagEnabled } from "@/lib/settings";
import { getAiOverview } from "@/lib/services/admin";

export const metadata = { title: "AI status" };
export const dynamic = "force-dynamic";

const DAYS = [{ value: "1", label: "24 hours" }, { value: "7", label: "7 days" }, { value: "30", label: "30 days" }];

function Check({ ok, label, detail }) {
  const Icon = ok ? CheckCircle2 : CircleAlert;
  return (
    <li className="flex items-start gap-2.5 py-2 text-sm">
      <Icon className={ok ? "text-success mt-0.5 size-4 shrink-0" : "text-warning-text mt-0.5 size-4 shrink-0"} aria-hidden="true" />
      <div><p className="font-medium">{label}</p>{detail && <p className="text-muted-foreground text-[13px]">{detail}</p>}</div>
    </li>
  );
}

export default async function AiStatusPage({ searchParams }) {
  const sp = await searchParams;
  const days = DAYS.some((d) => d.value === sp.days) ? sp.days : "7";
  const e = getEnv();
  const integrations = getIntegrations();
  const models = aiModels();
  const [stats, master, live] = await Promise.all([getAiOverview(Number(days)), isFlagEnabled("ai_features"), integrations.groq ? listProviderModels() : Promise.resolve(null)]);
  const configured = [["Fast", models.fast], ["Smart", models.smart], ["Safety", models.safety]];
  const liveIds = new Set(live?.models ?? []);
  const errorTasks = (stats.by_task ?? []).filter((t) => t.errors > 0);

  return (
    <>
      <PageHeader eyebrow="Insights & system" title="AI status" description="Health of the AI layer. Prompts and replies are never stored — only task names, timings, token counts and outcomes." />
      <FilterTabs label="Period" basePath="/admin/ai" param="days" current={days} options={DAYS} />

      <section aria-label="Usage" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Requests" value={fmtNumber(stats.total)} hint={`${fmtNumber(stats.cache_hits)} answered from cache`} />
        <StatCard label="Average latency" value={`${fmtNumber(stats.avg_latency_ms)} ms`} hint="Average of live successes" />
        <StatCard label="Tokens in / out" value={`${fmtNumber(stats.input_tokens)} / ${fmtNumber(stats.output_tokens)}`} />
        <StatCard label="Failures" value={fmtNumber(Object.entries(stats.by_status ?? {}).filter(([k]) => ["error", "timeout", "invalid_output"].includes(k)).reduce((s, [, n]) => s + n, 0))} tone="warn" />
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Configuration">
          <ul className="divide-y">
            <Check ok={master} label="Master switch" detail={master ? "AI features are on (Settings & flags)." : "AI features are switched off in Settings & flags."} />
            <Check ok={e.AI_ENABLED} label="AI enabled in the environment" detail={e.AI_ENABLED ? "AI_ENABLED=true" : "Set AI_ENABLED=true to allow any AI call."} />
            <Check ok={integrations.groq} label="Groq API key" detail={integrations.groq ? "A key is configured." : "GROQ_API_KEY is missing; features show their non-AI fallback."} />
            <Check ok={integrations.aiFallback} label="Fallback provider" detail={integrations.aiFallback ? "An OpenAI-compatible fallback is configured." : "None configured (optional)."} />
            <Check ok={integrations.embeddings} label="Embeddings (semantic search)" detail={integrations.embeddings ? `Provider: ${e.EMBEDDING_PROVIDER}, model ${e.EMBEDDING_MODEL}.` : "Not configured. Search uses keyword and concept matching only."} />
            <Check ok={integrations.redis} label="Redis (rate limits & cache)" detail={integrations.redis ? "Connected via REDIS_URL." : "Using in-memory fallback — fine for one server, not for several."} />
          </ul>
        </Panel>

        <Panel title="Models" description="What the app asks for, and whether your key can actually use it right now.">
          <ul className="divide-y text-sm">
            {configured.map(([tier, id]) => (
              <li key={tier} className="flex items-center justify-between gap-3 py-2">
                <span><span className="font-medium">{tier}</span> <span className="text-muted-foreground font-mono text-xs">{id}</span></span>
                {live?.ok ? <StatusBadge value={liveIds.has(id) ? "active" : "removed"} /> : <span className="text-muted-foreground text-xs">not checked</span>}
              </li>
            ))}
          </ul>
          {live && !live.ok && <p className="text-warning-text mt-2 text-[13px]">Could not list models from Groq: {live.error}</p>}
          {live?.ok && (
            <details className="mt-3 text-[13px]">
              <summary className="cursor-pointer font-medium">All {live.models.length} models your key can use</summary>
              <p className="text-muted-foreground mt-2 font-mono text-xs leading-relaxed break-words">{live.models.join(" · ")}</p>
            </details>
          )}
        </Panel>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <BreakdownBars title="Outcomes" data={stats.by_status} color="var(--chart-2)" empty="No AI requests in this period." />
        <BreakdownBars title="Requests by task" data={Object.fromEntries((stats.by_task ?? []).map((t) => [t.task, t.total]))} />
        <BreakdownBars title="Requests by model" data={Object.fromEntries((stats.by_model ?? []).map((m) => [`${m.provider} · ${m.model}`, m.total]))} color="var(--chart-5)" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel title="Background jobs (embeddings)">
          <dl className="grid grid-cols-4 gap-3 text-sm">
            {["pending", "processing", "done", "failed"].map((k) => (
              <div key={k}><dt className="eyebrow">{k}</dt><dd className="font-heading text-xl font-bold tabular-nums">{fmtNumber(stats.jobs?.[k] ?? 0)}</dd></div>
            ))}
          </dl>
          <p className="text-muted-foreground mt-3 text-[13px]">
            Stored vectors: {Object.keys(stats.embeddings ?? {}).length ? Object.entries(stats.embeddings).map(([k, n]) => `${fmtNumber(n)} ${k}s`).join(", ") : "none yet"}.
          </p>
          {(stats.failed_jobs ?? []).length > 0 && (
            <ul className="mt-3 space-y-1.5 text-xs">
              {stats.failed_jobs.map((j, i) => <li key={i} className="bg-muted/60 rounded px-2 py-1.5"><span className="font-semibold">{j.type}</span> after {j.attempts} attempts — {j.error ?? "no message"} <span className="text-muted-foreground">({fmtDateTime(j.at)})</span></li>)}
            </ul>
          )}
        </Panel>

        <Panel title="Recent errors">
          {(stats.recent_errors ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm">No errors in this period.{errorTasks.length ? "" : " 🎉"}</p>
          ) : (
            <DataTable caption="Recent AI errors" columns={["When", "Task", "Outcome", "Code"]} empty={null}>
              {stats.recent_errors.map((r, i) => (
                <tr key={i}><td className="text-muted-foreground px-4 py-2 whitespace-nowrap">{fmtDateTime(r.at)}</td><td className="px-4 py-2">{r.task}</td><td className="px-4 py-2"><StatusBadge value={r.status} /></td><td className="px-4 py-2 font-mono text-xs">{r.code ?? "—"}</td></tr>
              ))}
            </DataTable>
          )}
        </Panel>
      </div>
      {stats.total === 0 && <div className="surface mt-5"><EmptyRow>No AI requests yet in this period.</EmptyRow></div>}
    </>
  );
}
