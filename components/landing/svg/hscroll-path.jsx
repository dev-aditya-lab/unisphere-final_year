// A long wave that runs under the three "How it works" panels while the page holds and scrolls sideways. It crosses its midline
// every 500 units, so the three nodes (at the centre of each panel: 500, 1500 and 2500 of 3000) sit exactly on it. The path
// draws with the scroll (GSAP DrawSVG) and a dot rides it (MotionPath); both are driven from lib/landing/scroll-fx.js.
const PATH = "M0 100 C 200 100 300 58 500 100 S 800 142 1000 100 S 1300 58 1500 100 S 1800 142 2000 100 S 2300 58 2500 100 S 2800 142 3000 100";

export function HscrollPath() {
  return (
    <svg aria-hidden="true" viewBox="0 0 3000 200" fill="none" className="hscroll-path">
      <path d={PATH} stroke="var(--border-strong)" strokeWidth="2" strokeLinecap="round" />
      <path data-hscroll-line d={PATH} stroke="var(--signal)" strokeWidth="5" strokeLinecap="round" />
      {[500, 1500, 2500].map((x) => (
        <circle key={x} cx={x} cy="100" r="15" fill="var(--background)" stroke="var(--signal)" strokeWidth="5" />
      ))}
      <circle data-hscroll-dot cx="0" cy="0" r="10" fill="var(--signal)" stroke="var(--background)" strokeWidth="3" />
    </svg>
  );
}
