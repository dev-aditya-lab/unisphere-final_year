/**
 * Every picture the landing page uses, in one place: the file name under public/landing, the size it is exported at, where it
 * appears and what it is for. `scripts/landing-images.mjs` reads this to make placeholders now and, later, to turn the real
 * photographs (dropped into assets/landing-source/) into correctly sized, compressed files with the same names, so replacing
 * a placeholder never needs a code change. The text-to-image prompts for each one are in docs/LANDING_IMAGES.md.
 *
 * `tone` only drives the placeholder artwork. `alt` is empty for pictures that are decoration next to real text.
 */
export const LANDING_IMAGES = [
  { file: "hero-campus.jpg", width: 1920, height: 1080, tone: "ink", usage: "Hero, wide 16:9 (cropped to portrait on a phone). Gets the WebGL ripple on desktop.", alt: "" },
  { file: "story-campus.jpg", width: 2400, height: 1350, tone: "graphite", usage: "Full-width story image that grows to fill the screen while the page holds. 16:9.", alt: "" },
  { file: "gallery-projects.jpg", width: 1200, height: 1500, tone: "ink", usage: "Gallery tile: teammates for what you are building. Portrait 4:5.", alt: "" },
  { file: "gallery-mentors.jpg", width: 1200, height: 1500, tone: "paper", usage: "Gallery tile: seniors and alumni. Portrait 4:5.", alt: "" },
  { file: "gallery-events.jpg", width: 1200, height: 1500, tone: "graphite", usage: "Gallery tile: events and opportunities. Portrait 4:5.", alt: "" },
  { file: "club-robotics.jpg", width: 640, height: 640, tone: "ink", usage: "Hover picture, communities list: robotics and hardware. Square.", alt: "" },
  { file: "club-design.jpg", width: 640, height: 640, tone: "paper", usage: "Hover picture, communities list: design and creative. Square.", alt: "" },
  { file: "club-startup.jpg", width: 640, height: 640, tone: "graphite", usage: "Hover picture, communities list: entrepreneurship. Square.", alt: "" },
  { file: "club-debate.jpg", width: 640, height: 640, tone: "ink", usage: "Hover picture, communities list: debating and writing. Square.", alt: "" },
  { file: "club-music.jpg", width: 640, height: 640, tone: "paper", usage: "Hover picture, communities list: music and performing arts. Square.", alt: "" },
  { file: "club-sports.jpg", width: 640, height: 640, tone: "graphite", usage: "Hover picture, communities list: sports and fitness. Square.", alt: "" },
];

export const landingImage = (file) => `/landing/${file}`;
