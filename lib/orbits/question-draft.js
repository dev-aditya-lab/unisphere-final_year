/**
 * Shared by the admin "Generate with AI" button and the 16:00 worker job.
 * Models tend to put the right answer in B or C; moving it to a random place keeps the key from being guessable by position.
 */
export function shuffleWithKey(options, correct, random = Math.random) {
  const order = options.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { options: order.map((i) => options[i]), correct: order.indexOf(correct) };
}

/** Categories the automatic job rotates through. "campus" is left out: a model cannot know facts about a particular campus. */
export const AUTO_CATEGORIES = ["programming", "technology", "science", "aptitude", "general"];

/** A different category each day, stable for a given date ("2026-10-22"), so a retry the same evening asks for the same kind of question. */
export function categoryForDay(day) {
  const n = Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
  return AUTO_CATEGORIES[((n % AUTO_CATEGORIES.length) + AUTO_CATEGORIES.length) % AUTO_CATEGORIES.length];
}

/** Today's date in IST (YYYY-MM-DD), the calendar the Daily Challenge runs on. */
export const istToday = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
