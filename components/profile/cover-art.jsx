const PALETTES = [
  ["var(--coral)", "var(--sun)", "var(--teal)"],
  ["var(--blue)", "var(--sun)", "var(--rose)"],
  ["var(--teal)", "var(--coral)", "var(--sun)"],
  ["var(--plum)", "var(--sun)", "var(--teal)"],
  ["var(--leaf)", "var(--sun)", "var(--blue)"],
  ["var(--rose)", "var(--sun)", "var(--blue)"],
];

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rng(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A cover for members who have not uploaded one: a flat collage of circles and bars in brand colours, derived from
 * the username so every profile has its own, and it never changes. Purely decorative.
 */
export function CoverArt({ seed = "unisphere", className }) {
  const h = hash(seed);
  const rand = rng(h);
  const [base, a, b] = PALETTES[h % PALETTES.length];
  const shapes = Array.from({ length: 6 }, (_, i) => {
    const kind = Math.floor(rand() * 3);
    const x = Math.round(rand() * 400);
    const y = Math.round(rand() * 100);
    const size = 18 + Math.round(rand() * 46);
    return { i, kind, x, y, size, fill: i % 2 ? a : b };
  });
  return (
    <svg aria-hidden="true" viewBox="0 0 400 100" preserveAspectRatio="xMidYMid slice" className={className} role="presentation">
      <rect width="400" height="100" fill={base} />
      {shapes.map((s) =>
        s.kind === 0 ? (
          <circle key={s.i} cx={s.x} cy={s.y} r={s.size} fill={s.fill} opacity="0.9" />
        ) : s.kind === 1 ? (
          <rect key={s.i} x={s.x - s.size} y={s.y - s.size / 3} width={s.size * 2.2} height={s.size / 1.6} rx="4" fill={s.fill} opacity="0.9" transform={`rotate(-18 ${s.x} ${s.y})`} />
        ) : (
          <path key={s.i} d={`M${s.x} ${s.y} h${s.size} a${s.size} ${s.size} 0 0 1 -${s.size} ${s.size} z`} fill={s.fill} opacity="0.9" />
        ),
      )}
      <rect width="400" height="100" fill="none" stroke="var(--foreground)" strokeOpacity="0.0" />
    </svg>
  );
}
