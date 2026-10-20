// The Orbits artwork lives in public/icons/reward/ (500x500 transparent PNGs). This is the single place that maps a meaning
// to a file, after looking at every image: the numbered badges show their numeral (1 gold ribbon medal, 2 and 3 gold
// rosettes, 4 to 8 navy hexagons, 9 green, 10 red), so rank N uses the Nth badge.
export const REWARD_ICON_FILES = Object.freeze({
  orbit: "orbit.png",
  award: "award.png",
  "badge-check": "badge-check.png",
  brain: "brain.png",
  "calendar-check": "calendar-check.png",
  "circle-check": "circle-check.png",
  "circle-x": "circle-x.png",
  flame: "flame.png",
  globe: "globe.png",
  "graduation-cap": "graduation-cap.png",
  "lock-keyhole": "lock-keyhole.png",
  "trending-up": "trending-up.png",
  trophy: "trophy.png",
  "user-graduation-cap": "user-graduation-cap.png",
});

const ORDINAL = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th"];

/** File name for a reward icon key, or for a ranking position 1 to 10. */
export function rewardIconFile({ name, rank }) {
  if (rank >= 1 && rank <= 10) return `${ORDINAL[rank]}-award badge.png`;
  return REWARD_ICON_FILES[name] ?? REWARD_ICON_FILES.award;
}

/** Public URL (spaces encoded). The original files are never renamed or modified. */
export function rewardIconSrc(opts) {
  return `/icons/reward/${encodeURIComponent(rewardIconFile(opts))}`;
}

export const KIND_LABEL = {
  checkin: "Daily Orbit Bonus",
  challenge_participation: "Daily Challenge",
  challenge_correct: "Correct answer bonus",
  post: "Post",
  helpful_answer: "Helpful answer",
  streak_milestone: "Orbit Streak milestone",
  achievement: "Orbit Badge",
  manual_adjustment: "Correction by staff",
  reversal: "Reversed",
};
export const KIND_GROUP = { checkin: "contribution", challenge_participation: "learning", challenge_correct: "learning", post: "contribution", helpful_answer: "contribution", streak_milestone: "streak", achievement: "achievement" };

export const SCOPES = [
  { value: "global", label: "Global", icon: "globe" },
  { value: "college", label: "My college", icon: "graduation-cap" },
  { value: "connections", label: "Connections", icon: "user-graduation-cap" },
];
export const PERIODS = [
  { value: "weekly", label: "This week" },
  { value: "monthly", label: "This month" },
  { value: "alltime", label: "All time" },
];
export const CATEGORY_LABEL = { programming: "Programming", technology: "Technology", science: "Science", aptitude: "Aptitude", general: "General knowledge", campus: "Campus life" };
