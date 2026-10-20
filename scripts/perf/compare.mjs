// Prints the baseline and "after" benchmark runs side by side (median of the runs of each label).
//   node scripts/perf/compare.mjs [baseline] [after]
import fs from "node:fs";
import path from "node:path";

const dir = path.join("scripts", "perf", "results");
const [before = "baseline", after = "after"] = process.argv.slice(2);
const load = (label) =>
  fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(`messaging-${label}-run`) && f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
const median = (xs) => {
  const s = xs.filter((x) => x != null).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};
const sum = (o) => Object.values(o ?? {}).reduce((a, b) => a + b, 0);

const rows = [
  ["Cold open: last message visible (ms)", (r) => r.scenarios.coldOpen.msToLastMessageVisible],
  ["Cold open: JS transferred (KB, gzip)", (r) => r.scenarios.coldOpen.jsKBTransferred],
  ["Revisit by click: message visible (ms)", (r) => r.scenarios.revisitByClick.msToLastMessageVisible],
  ["Revisit: network requests", (r) => sum(r.scenarios.revisitByClick.requests)],
  ["Typing 66 chars: slow-event p95 (ms)", (r) => r.scenarios.typing.slowEvents.p95],
  ["Typing: slow events (>= 16 ms)", (r) => r.scenarios.typing.slowEvents.n],
  ["Typing: long frames / script ms", (r) => (r.scenarios.typing.longFrames ? `${r.scenarios.typing.longFrames.n} / ${r.scenarios.typing.longFrames.scriptMs}` : null)],
  ["Send: Enter to bubble on screen (ms)", (r) => r.scenarios.send.msEnterToBubble],
  ["Send: Enter to confirmed (ms)", (r) => r.scenarios.send.msEnterToConfirmed],
  ["Send: rows stored (must be 1)", (r) => r.scenarios.send.rowsInDatabase],
  ["Send: database statements", (r) => r.scenarios.send.dbStatements],
  ["Incoming: Bob insert to Alice bubble, p50 (ms)", (r) => r.scenarios.incoming.msBobInsertToAliceBubble.p50],
  ["Incoming: database statements per message", (r) => r.scenarios.incoming.dbStatementsPerMessage],
  ["Incoming: server page renders per message", (r) => r.scenarios.incoming.requestsPerMessage["rsc-render"] ?? 0],
  ["Incoming: server actions per message", (r) => r.scenarios.incoming.requestsPerMessage["server-action"] ?? 0],
  ["Incoming: API calls per message", (r) => r.scenarios.incoming.requestsPerMessage.api ?? 0],
  ["New message while reading older: kept place", (r) => (r.scenarios.incomingWhileReadingOlder.keptPosition ? "yes" : "no")],
  ["Load earlier: reading position kept", (r) => (r.scenarios.loadOlder.anchorKept ?? false ? "yes" : "no")],
  ["Load earlier: drift (px)", (r) => r.scenarios.loadOlder.anchorDriftPx ?? null],
  ["Realtime channel joins in the session", (r) => r.totalRealtimeJoins],
  ["Long tasks (>50 ms)", (r) => r.longTasksTotal.n],
];

const B = load(before);
const A = load(after);
const col = (runs, f) => {
  const values = runs.map((r) => { try { return f(r); } catch { return null; } });
  return typeof values.find((v) => v != null) === "string" ? values.find((v) => v != null) : median(values);
};
console.log(`| Metric | ${before} (median of ${B.length}) | ${after} (median of ${A.length}) |`);
console.log("| --- | ---: | ---: |");
for (const [name, f] of rows) console.log(`| ${name} | ${col(B, f) ?? "n/a"} | ${col(A, f) ?? "n/a"} |`);
