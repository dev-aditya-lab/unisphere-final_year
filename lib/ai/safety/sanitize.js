// Input hygiene for anything sent to an external model.
import { maskPersonalData } from "@/lib/privacy/redact";

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/** Bounded, control-character-free text. */
export function clip(text, max) {
  return String(text ?? "")
    .replace(CONTROL, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
    .slice(0, max);
}

/**
 * Wrap user-supplied (or other members') text so the model treats it as data. Any attempt to
 * close or open our delimiter tags inside the text is defused.
 */
export function untrusted(text, label = "text", max = 4000) {
  // Member text is also stripped of obvious emails, phone numbers and ID numbers before it leaves UniSphere.
  const safe = maskPersonalData(clip(text, max)).replace(/<\/?\s*untrusted[^>]*>/gi, "[tag removed]");
  return `<untrusted_${label}>\n${safe}\n</untrusted_${label}>`;
}

const INJECTION_HINTS = [
  /ignore (all |any )?(the )?(previous|prior|above) (instructions|prompts?)/i,
  /disregard (your|the) (system|previous) (prompt|instructions)/i,
  /you are now (?:in )?(?:developer|dan|jailbreak)/i,
  /reveal (your|the) (system )?prompt/i,
];

/** Heuristic flag for telemetry only. We do not refuse such text; delimiting + schema validation contain it. */
export function looksLikeInjection(text) {
  return INJECTION_HINTS.some((re) => re.test(String(text ?? "")));
}

/** Words that carry meaning, most frequent first. Used to build keyword queries without any model. */
const STOPWORDS = new Set(
  ("a an and are as at be but by for from has have how i if in into is it its me my of on or our so such than that the their them then there these they this to up us " +
    "want build make create using use used need needs would could should can will just like also very more most some any about over under between what which who whom why when where while " +
    "college campus student students project idea ideas help helps system app application platform something someone thing things get getting one two new better good great").split(" "),
);

export function ruleKeywords(text, max = 10) {
  const counts = new Map();
  for (const raw of String(text ?? "").toLowerCase().match(/[a-z][a-z0-9+#.-]{2,}/g) ?? []) {
    const w = raw.replace(/[.-]+$/g, "");
    if (w.length < 3 || STOPWORDS.has(w)) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, max)
    .map(([w]) => w);
}
