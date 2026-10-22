// Writing tones for the composer's AI helpers (isomorphic: the picker and the prompt read the same list, so they cannot drift).

export const TONES = [
  { value: "keep", label: "Keep my tone", guide: "Match the author's own tone, vocabulary and level of formality. If the draft is casual, stay casual; if it is formal, stay formal." },
  { value: "casual", label: "Casual", guide: "Relaxed and conversational, the way you would message a friend. Contractions are fine. No slang the draft does not already use." },
  { value: "professional", label: "Professional", guide: "Clear, polite and direct. No slang, no stiffness, no corporate buzzwords." },
  { value: "informative", label: "Informative", guide: "Plain and factual. Put the most useful detail first and keep opinion out of it." },
  { value: "funny", label: "Funny", guide: "Light and dry. Add humour only where the draft gives something to joke about, never at anyone's expense, and do not force a pun." },
  { value: "personal", label: "Personal", guide: "Warm and in the first person. Express only the feelings and experiences the draft states; invent none." },
  { value: "promotional", label: "Promotional", guide: "Make people want to take part, using the concrete details in the draft. No hype, no superlatives, no pressure." },
];

export const TONE_VALUES = TONES.map((t) => t.value);
export const TONE_BY_VALUE = Object.fromEntries(TONES.map((t) => [t.value, t]));
export const LENGTHS = ["short", "detailed"];
