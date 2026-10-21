import { Children, cloneElement } from "react";

/**
 * The artwork of the UniSphere icon family: plain, single-colour icons on a 24 x 24 canvas.
 *  - Everything is drawn in `currentColor`, so an icon takes the colour of the text around it, in both themes.
 *  - One stroke weight (1.75), round caps and joins, rounded corners of 1.5 to 3 units, one clear silhouette per concept.
 *  - A closed shape is wrapped in `S`, which adds a `soft` twin of the same outline. The twin is invisible at rest and fades in as
 *    a tint when the icon is selected (`fill="soft"`) or fully when a toggle is on (`fill="solid"`).
 *  - Parts that move are marked `p-a` / `p-b` (see icons.css) and the glyph's `fx` names its motion.
 * Plain SVG elements only: no filters, masks, gradients or blurs.
 */

/** A closed shape that can be filled: the outline plus its `soft` fill twin. */
function S({ children }) {
  const shape = Children.only(children);
  return (
    <>
      {cloneElement(shape, { className: "soft" })}
      {shape}
    </>
  );
}

function ngon(cx, cy, ro, ri, n, rot = 0) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? ro : ri;
    const t = (Math.PI * i) / n + rot;
    pts.push(`${(cx + r * Math.sin(t)).toFixed(2)} ${(cy - r * Math.cos(t)).toFixed(2)}`);
  }
  return `M${pts.join("L")}z`;
}

function gearPath(cx, cy, teeth, rRoot, rTip, tipHalf, rootHalf) {
  const pts = [];
  const step = 360 / teeth;
  for (let i = 0; i < teeth; i++) {
    for (const [deg, r] of [[i * step - rootHalf, rRoot], [i * step - tipHalf, rTip], [i * step + tipHalf, rTip], [i * step + rootHalf, rRoot]]) {
      const t = (deg * Math.PI) / 180;
      pts.push(`${(cx + r * Math.sin(t)).toFixed(2)} ${(cy - r * Math.cos(t)).toFixed(2)}`);
    }
  }
  return `M${pts.join("L")}z`;
}

const BUBBLE = "M5.5 4h13A2.5 2.5 0 0 1 21 6.5v8a2.5 2.5 0 0 1-2.5 2.5H13l-4 3.6c-.6.5-1.5.1-1.5-.7V17h-2A2.5 2.5 0 0 1 3 14.5v-8A2.5 2.5 0 0 1 5.5 4z";
const HEART = "M12 20.5S3.5 15.4 3.5 9.6A4.6 4.6 0 0 1 12 7.2a4.6 4.6 0 0 1 8.5 2.4c0 5.8-8.5 10.9-8.5 10.9z";
const SPARK = "M10 3c.6 4.7 2.8 6.9 7.5 7.5-4.7.6-6.9 2.8-7.5 7.5-.6-4.7-2.8-6.9-7.5-7.5C7.2 9.9 9.4 7.7 10 3z";

const Dot = ({ cx, cy, r = 1 }) => <circle cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" />;

/* ── Navigation and places ─────────────────────────────────────────────────────────────────────────────────────────── */

const Home = () => (
  <>
    <S><path d="M4 11l8-7 8 7v8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z" /></S>
    <path className="p-a" d="M10 20.5v-4.5a2 2 0 0 1 4 0v4.5" />
  </>
);

const Compass = () => (
  <>
    <S><circle cx="12" cy="12" r="9" /></S>
    <g transform="rotate(8 12 12)"><S><path className="p-a" d="M15.5 8.5l-2 5-5 2 2-5z" /></S></g>
  </>
);

const Bulb = () => (
  <>
    <S><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.4 1.1 2.2v.5h5V16c0-.8.4-1.6 1.1-2.2A6 6 0 0 0 12 3z" /></S>
    <path d="M10 19h4M10.8 21.5h2.4" />
    <path className="p-b" d="M2.5 9H4M20 9h1.5M5 2.8l1 1M19 2.8l-1 1M12 0.5v0" />
    <path className="p-a" d="M10.5 11.5L12 13l1.5-1.5" />
  </>
);

const Folder = () => (
  <>
    <S><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2.5h7.5A2.5 2.5 0 0 1 21 10v7.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" /></S>
    <path className="p-a" d="M8 12v4M12 12v2.5M16 12v4.5" />
  </>
);

const Users = () => (
  <>
    <S><circle cx="9" cy="8" r="3.2" /></S>
    <path d="M3 19.5c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
    <g className="p-a">
      <circle cx="17" cy="8.5" r="2.5" />
      <path d="M17.5 14c2.5.2 4 1.9 4 4.5" />
    </g>
  </>
);

const Calendar = () => (
  <>
    <S><path d="M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" /></S>
    <path d="M3 10h18" />
    <path className="p-a" d="M8 3v4M16 3v4" />
    <circle className="p-b" cx="12" cy="15" r="1.3" fill="currentColor" stroke="none" />
  </>
);

const Briefcase = () => (
  <>
    <S><path d="M5 6.5h14A2 2 0 0 1 21 8.5v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z" /></S>
    <path d="M9 6.5v-1a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1" />
    <path d="M3 12.5c3 1.5 6 2.2 9 2.2s6-.7 9-2.2" />
    <rect className="p-a" x="10.5" y="12" width="3" height="3.2" rx="1" />
  </>
);

const Landmark = () => (
  <>
    <S><path d="M12 3L3 8.5h18z" /></S>
    <path className="p-a" d="M6 11v6M10 11v6M14 11v6M18 11v6" />
    <path d="M4.5 19.5h15M3 21.5h18" />
  </>
);

const Cap = () => (
  <>
    <S><path d="M12 4L2 9l10 5 10-5z" /></S>
    <path d="M6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5" />
    <path className="p-a" d="M22 9v5.5" />
  </>
);

const Link = () => (
  <g transform="rotate(-35 12 12)">
    <rect x="2" y="8.5" width="12" height="7" rx="3.5" />
    <rect className="p-a" x="10" y="8.5" width="12" height="7" rx="3.5" />
  </g>
);

/* ── People and conversations ──────────────────────────────────────────────────────────────────────────────────────── */

const Chat = () => (
  <>
    <S><path d={BUBBLE} /></S>
    {[8.5, 12, 15.5].map((x, i) => <circle key={x} className="p-b" style={{ "--i": i }} cx={x} cy="10.5" r="1" fill="currentColor" stroke="none" />)}
  </>
);

const Feedback = () => (
  <>
    <S><path d={BUBBLE} /></S>
    <path className="p-a" d="M12 13.2c-2.2-1.5-3.4-2.6-3.4-3.9a1.8 1.8 0 0 1 3.4-.7 1.8 1.8 0 0 1 3.4.7c0 1.3-1.2 2.4-3.4 3.9z" />
  </>
);

const Bell = () => (
  <>
    <g className="p-a">
      <S><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" /></S>
    </g>
    <path className="p-b" d="M10 21h4" />
  </>
);

const Bookmark = () => (
  <g className="p-a">
    <S><path d="M6.5 4.5A1.5 1.5 0 0 1 8 3h8a1.5 1.5 0 0 1 1.5 1.5V21l-5.5-4-5.5 4z" /></S>
  </g>
);

const User = () => (
  <>
    <S><circle cx="12" cy="8" r="4" /></S>
    <path d="M4.5 20c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5" />
  </>
);

const UserPlus = () => (
  <>
    <S><circle cx="9.5" cy="8" r="3.5" /></S>
    <path d="M3 19.5c0-3.5 2.9-5.5 6.5-5.5 1.3 0 2.5.3 3.5.8" />
    <path className="p-a" d="M18.5 14v6M15.5 17h6" />
  </>
);

const UserCheck = () => (
  <>
    <S><circle cx="9.5" cy="8" r="3.5" /></S>
    <path d="M3 19.5c0-3.5 2.9-5.5 6.5-5.5 1.3 0 2.5.3 3.5.8" />
    <path className="p-a" d="M15.5 17.5l2 2 3.5-4" />
  </>
);

const UserX = () => (
  <>
    <S><circle cx="9.5" cy="8" r="3.5" /></S>
    <path d="M3 19.5c0-3.5 2.9-5.5 6.5-5.5 1.3 0 2.5.3 3.5.8" />
    <path className="p-a" d="M16 15l5 5M21 15l-5 5" />
  </>
);

/* ── Actions ───────────────────────────────────────────────────────────────────────────────────────────────────────── */

const Heart = () => (
  <g className="p-a"><S><path d={HEART} /></S></g>
);

const Send = () => (
  <g className="p-a">
    <S><path d="M21 3L3 10.5l7 3 3 7z" /></S>
    <path d="M10 13.5L21 3" />
  </g>
);

const Search = () => (
  <>
    <g className="p-a"><S><circle cx="10.5" cy="10.5" r="6.5" /></S></g>
    <path d="M15.5 15.5L21 21" />
  </>
);

const Gear = () => (
  <g className="p-a">
    <S><path fillRule="evenodd" d={`${gearPath(12, 12, 8, 7.4, 9.6, 3.6, 6)}M15 12a3 3 0 1 0-6 0 3 3 0 1 0 6 0z`} /></S>
  </g>
);

const Star = () => (
  <g className="p-a"><S><path d={ngon(12, 12.8, 9.2, 4.3, 5)} /></S></g>
);

const Sparkle = () => (
  <>
    <S><path d={SPARK} /></S>
    <path className="p-a" d="M19 14.5c.3 2 1.2 2.9 3 3.2-1.8.3-2.7 1.2-3 3.2-.3-2-1.2-2.9-3-3.2 1.8-.3 2.7-1.2 3-3.2z" />
    <path className="p-b" d="M18.5 3v3M17 4.5h3" />
  </>
);

const Shield = () => (
  <S><path d="M12 3l7.5 2.8v5.7c0 4.6-3.1 8.2-7.5 9.5-4.4-1.3-7.5-4.9-7.5-9.5V5.8z" /></S>
);

const ShieldCheck = () => (
  <>
    <Shield />
    <path className="p-a" d="M8.5 12l2.5 2.5 4.5-5" />
  </>
);

const Lock = () => (
  <>
    <path className="p-a" d="M8 11V7.5a4 4 0 0 1 8 0V11" />
    <S><path d="M5 11h14a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 19 20H5a1.5 1.5 0 0 1-1.5-1.5v-6A1.5 1.5 0 0 1 5 11z" /></S>
    <Dot cx={12} cy={15.5} />
  </>
);

const Flag = () => (
  <>
    <path d="M5 21V4" />
    <g className="p-a"><S><path d="M5 4.5c3-1.5 5 1.5 8 0s4.5-1 6-.2v8.5c-1.5-.8-3-1.3-6 .2s-5-1.5-8 0z" /></S></g>
  </>
);

const Pin = () => (
  <>
    <S><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z" /></S>
    <circle className="p-a" cx="12" cy="10" r="2.3" />
  </>
);

const Clock = () => (
  <>
    <S><circle cx="12" cy="12" r="9" /></S>
    <path className="p-a" d="M12 7.5V12l3 2" />
  </>
);

const Check = () => (
  <>
    <S><circle cx="12" cy="12" r="9" /></S>
    <path className="p-a" d="M8 12.2l2.8 2.8L16 9.5" />
  </>
);

const Alert = () => (
  <>
    <S><path d="M10.3 4.2L2.7 17.5a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z" /></S>
    <path className="p-a" d="M12 9.5v4" />
    <Dot cx={12} cy={17} />
  </>
);

const Info = () => (
  <>
    <S><circle cx="12" cy="12" r="9" /></S>
    <path className="p-a" d="M12 11v5.5" />
    <Dot cx={12} cy={7.8} />
  </>
);

const Help = () => (
  <>
    <S><circle cx="12" cy="12" r="9" /></S>
    <path className="p-a" d="M9.4 9.4a2.7 2.7 0 1 1 4.1 2.3c-.9.6-1.5 1.1-1.5 2.1" />
    <Dot cx={12} cy={17} />
  </>
);

const Mail = () => (
  <>
    <S><path d="M4 5.5h16A1.5 1.5 0 0 1 21.5 7v10a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 17V7A1.5 1.5 0 0 1 4 5.5z" /></S>
    <path className="p-a" d="M3 7.5l9 6.5 9-6.5" />
  </>
);

const Image = () => (
  <>
    <S><rect x="3" y="4" width="18" height="16" rx="3" /></S>
    <circle cx="8.5" cy="9.5" r="1.5" />
    <path className="p-a" d="M3.5 17l5-5 4 4 3-3 5 5" />
  </>
);

const File = () => (
  <>
    <S><path d="M6 3h8l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" /></S>
    <path d="M14 3v5h5" />
    <path className="p-a" d="M8 13h8M8 17h5" />
  </>
);

const Trash = () => (
  <>
    <g className="p-a"><path d="M4 6.5h16M9.5 6.5V4.5h5v2" /></g>
    <S><path d="M6 6.5l.9 12.5a2 2 0 0 0 2 1.8h6.2a2 2 0 0 0 2-1.8L18 6.5z" /></S>
    <path d="M10 10.5v6M14 10.5v6" />
  </>
);

const Pencil = () => (
  <g className="p-a">
    <S><path d="M4 20l1-4.5L16.5 4a2.1 2.1 0 0 1 3 3L8 18.5z" /></S>
    <path d="M14.5 6l3.5 3.5" />
  </g>
);

/* ── Admin and extra concepts ──────────────────────────────────────────────────────────────────────────────────────── */

const Chart = () => (
  <g className="p-a">
    <S><rect x="4.5" y="12" width="3.5" height="8" rx="1" /></S>
    <S><rect x="10.2" y="4.5" width="3.5" height="15.5" rx="1" /></S>
    <S><rect x="16" y="9" width="3.5" height="11" rx="1" /></S>
  </g>
);

const Coin = () => (
  <>
    <S><circle cx="12" cy="12" r="9" /></S>
    <path className="p-a" d="M9 8h6M9 11h6M9 8h2a3 3 0 0 1 0 6H9l5.5 4" />
  </>
);

const Inbox = () => (
  <>
    <S><path d="M3 13l2.5-7A2 2 0 0 1 7.4 4.5h9.2a2 2 0 0 1 1.9 1.5L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></S>
    <path className="p-a" d="M3 13h4.5a2 2 0 0 1 1.8 1.2 3 3 0 0 0 5.4 0A2 2 0 0 1 16.5 13H21" />
  </>
);

const Key = () => (
  <>
    <S><circle cx="8" cy="8" r="4.5" /></S>
    <path className="p-a" d="M11.5 11.5L21 21M17 17l2.5-2.5" />
  </>
);

const Grid = () => (
  <>
    <S><rect x="3.5" y="3.5" width="7" height="9" rx="2" /></S>
    <S><rect x="13.5" y="3.5" width="7" height="5" rx="2" /></S>
    <S><rect x="3.5" y="15.5" width="7" height="5" rx="2" /></S>
    <S><rect className="p-a" x="13.5" y="11.5" width="7" height="9" rx="2" /></S>
  </>
);

const Megaphone = () => (
  <>
    <g className="p-a">
      <S><path d="M3.5 10A1.5 1.5 0 0 1 5 8.5h3l8-4v15l-8-4H5A1.5 1.5 0 0 1 3.5 14z" /></S>
      <path d="M8 15.5v3a1.5 1.5 0 0 0 3 0v-1.5" />
    </g>
    <path className="p-b" d="M19 9.5a4 4 0 0 1 0 5" />
  </>
);

const Rocket = () => (
  <>
    <g className="p-a">
      <S><path d="M12 3c3 2.5 4.5 5.5 4.5 9v3.5h-9V12c0-3.5 1.5-6.5 4.5-9z" /></S>
      <circle cx="12" cy="9.5" r="1.5" />
      <path d="M7.5 12.5L5 16v2.5L7.5 17M16.5 12.5L19 16v2.5L16.5 17" />
    </g>
    <path className="p-b" d="M12 18v3.5" />
  </>
);

const Scale = () => (
  <>
    <path d="M12 4v16M8 20h8" />
    <g className="p-a">
      <path d="M4 7h16M6 7l-3 6.5M6 7l3 6.5M18 7l-3 6.5M18 7l3 6.5" />
      <S><path d="M3 13.5h6a3 3 0 0 1-6 0zM15 13.5h6a3 3 0 0 1-6 0z" /></S>
    </g>
  </>
);

const Tag = () => (
  <>
    <S><path d="M3 12.2V4.5A1.5 1.5 0 0 1 4.5 3h7.7a2 2 0 0 1 1.4.6l7.1 7.1a2 2 0 0 1 0 2.8l-6.6 6.6a2 2 0 0 1-2.8 0l-7.1-7.1A2 2 0 0 1 3 12.2z" /></S>
    <circle className="p-a" cx="7.5" cy="7.5" r="1.2" fill="currentColor" stroke="none" />
  </>
);

const Sliders = () => (
  <>
    <path d="M4 7h3M11 7h9M4 12h7M15 12h5M4 17h2M10 17h10" />
    <g className="p-a">
      <S><circle cx="9" cy="7" r="2" /></S>
      <S><circle cx="13" cy="12" r="2" /></S>
      <S><circle cx="8" cy="17" r="2" /></S>
    </g>
  </>
);

const Book = () => (
  <>
    <S><path d="M12 6.5c-2-1.6-4.5-2.3-8-2.2v13.2c3.5-.1 6 .6 8 2.2 2-1.6 4.5-2.3 8-2.2V4.3c-3.5-.1-6 .6-8 2.2z" /></S>
    <path className="p-a" d="M12 6.5v13.2" />
  </>
);

const Gift = () => (
  <>
    <S><path d="M4 11h16v8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z" /></S>
    <S><path d="M3 7.5h18V11H3z" /></S>
    <path d="M12 7.5v13" />
    <path className="p-a" d="M12 7.5C10 3.5 6.5 4 7 6s3.5 1.5 5 1.5zM12 7.5c2-4 5.5-3.5 5-1.5s-3.5 1.5-5 1.5z" />
  </>
);

const Orbit = () => (
  <>
    <S><circle cx="12" cy="12" r="3.2" /></S>
    <ellipse className="p-a" cx="12" cy="12" rx="10.5" ry="4.2" transform="rotate(-30 12 12)" />
  </>
);

const Trophy = () => (
  <>
    <g className="p-a">
      <S><path d="M8 4h8v5.5a4 4 0 0 1-8 0z" /></S>
      <path d="M8 6H5.5a1 1 0 0 0-1 1v.5A3 3 0 0 0 8 10.5M16 6h2.5a1 1 0 0 1 1 1v.5a3 3 0 0 1-3.5 3" />
    </g>
    <path d="M12 13.5V17M9.5 17h5M8.5 20.5h7" />
  </>
);

const Globe = () => (
  <>
    <S><circle cx="12" cy="12" r="9" /></S>
    <path d="M3 12h18" />
    <path className="p-a" d="M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z" />
  </>
);

const BadgeCheck = () => (
  <>
    <S><path d={ngon(12, 12, 9.5, 8, 8)} /></S>
    <path className="p-a" d="M8.5 12.2l2.5 2.5 4.5-5" />
  </>
);

const TrendingUp = () => (
  <path className="p-a" pathLength="1" d="M3 17l6-6 4 4 8-8M15 7h6v6" />
);

/**
 * name -> artwork and motion. `fx` names the motion in icons.css (`[data-fx]`); it plays only for a hover or an event.
 * Names are the product concepts, not the picture: several nav destinations can share a drawing.
 */
export const GLYPHS = Object.freeze({
  home: { g: Home, fx: "door" },
  compass: { g: Compass, fx: "needle" },
  bulb: { g: Bulb, fx: "bulb" },
  folder: { g: Folder, fx: "columns" },
  users: { g: Users, fx: "hop" },
  calendar: { g: Calendar, fx: "calendar" },
  briefcase: { g: Briefcase, fx: "hop" },
  landmark: { g: Landmark, fx: "columns" },
  cap: { g: Cap, fx: "tassel" },
  link: { g: Link, fx: "link" },
  chat: { g: Chat, fx: "typing" },
  feedback: { g: Feedback, fx: "beat" },
  bell: { g: Bell, fx: "bell" },
  bookmark: { g: Bookmark, fx: "hop" },
  user: { g: User },
  "user-plus": { g: UserPlus, fx: "pop" },
  "user-check": { g: UserCheck, fx: "pop" },
  "user-x": { g: UserX, fx: "pop" },
  heart: { g: Heart, fx: "beat" },
  send: { g: Send, fx: "plane" },
  search: { g: Search, fx: "lens" },
  gear: { g: Gear, fx: "gear" },
  star: { g: Star, fx: "twirl" },
  sparkle: { g: Sparkle, fx: "twinkle" },
  shield: { g: Shield },
  "shield-check": { g: ShieldCheck, fx: "pop" },
  lock: { g: Lock, fx: "lock" },
  flag: { g: Flag, fx: "wave" },
  pin: { g: Pin, fx: "drop" },
  clock: { g: Clock, fx: "hand" },
  check: { g: Check, fx: "pop" },
  alert: { g: Alert, fx: "shake" },
  info: { g: Info, fx: "pop" },
  help: { g: Help, fx: "pop" },
  mail: { g: Mail, fx: "hop" },
  image: { g: Image, fx: "hop" },
  file: { g: File, fx: "hop" },
  trash: { g: Trash, fx: "lid" },
  pencil: { g: Pencil, fx: "write" },
  chart: { g: Chart, fx: "columns" },
  coin: { g: Coin, fx: "flip" },
  inbox: { g: Inbox, fx: "hop" },
  key: { g: Key, fx: "turn" },
  grid: { g: Grid, fx: "pop" },
  megaphone: { g: Megaphone, fx: "waves" },
  rocket: { g: Rocket, fx: "launch" },
  scale: { g: Scale, fx: "balance" },
  tag: { g: Tag, fx: "twirl" },
  sliders: { g: Sliders, fx: "slide" },
  book: { g: Book, fx: "hop" },
  gift: { g: Gift, fx: "hop" },
  orbit: { g: Orbit, fx: "orbit" },
  trophy: { g: Trophy, fx: "hop" },
  globe: { g: Globe, fx: "flip" },
  "badge-check": { g: BadgeCheck, fx: "pop" },
  "trending-up": { g: TrendingUp, fx: "draw" },
});

export const GLYPH_NAMES = Object.freeze(Object.keys(GLYPHS));
